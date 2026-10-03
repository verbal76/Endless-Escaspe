import { createAudioPlayer } from 'expo-audio';
import * as RN from 'react-native';
import { perceptualVolume } from '../util/musicIntensity';
import { audioWarnOnce } from './Sfx';

// Background music with a danger track.
//
// - Calm playlist: the two lighter tracks, shuffled (a track may
//   repeat once, so it isn't a strict A-B-A-B alternation). The next
//   track starts HANDOFF_S before the current one ends, overlapping
//   its faded tail instead of leaving a gap.
// - Tension track: "Polysneak Pursuit" looping, crossfaded in as
//   danger rises (see util/musicIntensity.ts for the mix).
//
// A player only runs while it is audible: at a level of 0 (slider at
// 0, or a track faded fully out) it is paused, so the game holds no
// decoder - and, with the app's mixWithOthers audio mode, never
// blocks the player's own music. It resumes where it left off when
// it becomes audible again.
//
// Play state is reconciled with the native players: status events
// report what each player is actually doing, and when that differs
// from what we want (an external pause such as a permanent audio
// focus loss, or the OS resuming a player we had paused) the command
// is re-issued, at most once per RETRY_MS, only while the app is in
// the foreground. Returning to the foreground re-checks everything.
//
// Writes to the native players are coalesced so per-frame mix
// updates don't spam the bridge; a write to exactly 0 always lands.

const CALM_TRACKS = [
  require('../../assets/music/pocketEscapeRemix.mp3'),
  require('../../assets/music/voxelSneakParade.mp3'),
];
const TENSION_TRACK = require('../../assets/music/polysneakPursuit.mp3');

export const HANDOFF_S = 0.75;
export const RETRY_MS = 1000;
// Levels at or below this are treated as silent (paused).
export const SILENT_LEVEL = 1e-4;

export type MusicPlayer = {
  setVolume: (v: number) => void;
  setMix: (calmGain: number, tensionGain: number, rate: number) => void;
  dispose: () => void;
};

// The parts of an expo-audio AudioPlayer used here (fakeable in tests).
export type MusicStatus = {
  playing?: boolean;
  didJustFinish?: boolean;
  currentTime?: number;
  duration?: number;
};
export type MusicTrackPlayer = {
  volume: number;
  loop: boolean;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => unknown;
  remove: () => void;
  setPlaybackRate: (rate: number) => void;
  addListener: (event: 'playbackStatusUpdate', cb: (s: MusicStatus) => void) => { remove: () => void };
};
type AppStateLike = {
  currentState?: string | null;
  addEventListener: (type: 'change', cb: (state: string) => void) => { remove: () => void };
};

export type MusicOptions = {
  createPlayer?: (asset: number, loop: boolean) => MusicTrackPlayer | null;
  appState?: AppStateLike | null;
  now?: () => number;
  random?: () => number;
};

function defaultCreatePlayer(asset: number, loop: boolean): MusicTrackPlayer | null {
  try {
    const p = createAudioPlayer(asset, { updateInterval: 500 }) as unknown as MusicTrackPlayer;
    p.loop = loop;
    p.volume = 0;
    return p;
  } catch (e) {
    // Audio unavailable (e.g. no output device) - run silently.
    audioWarnOnce('music-create', 'music create failed', e);
    return null;
  }
}

// Next calm track index. Avoids playing the same track three times in
// a row; otherwise uniform (so two tracks don't strictly alternate).
export function pickNextCalm(
  playable: number[],
  history: number[],
  random: () => number = Math.random,
): number {
  if (playable.length === 0) return -1;
  if (playable.length === 1) return playable[0];
  const [a, b] = history.slice(-2);
  const banned = history.length >= 2 && a === b ? a : -1;
  const pool = playable.filter((i) => i !== banned);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

type Track = {
  p: MusicTrackPlayer;
  want: boolean; // we want it playing
  nativePlaying: boolean; // last reported by status events
  lastCmd: number; // ms of the last play()/pause() we issued
  wrote: number; // last volume written
  tail: boolean; // previous calm track playing out its last seconds
  sub: { remove: () => void } | null;
};

export function createMusic(initialVolume: number, opts: MusicOptions = {}): MusicPlayer {
  const make = opts.createPlayer ?? defaultCreatePlayer;
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const appState: AppStateLike | null =
    opts.appState !== undefined ? opts.appState : ((RN as { AppState?: AppStateLike }).AppState ?? null);

  const track = (p: MusicTrackPlayer | null): Track | null =>
    p ? { p, want: false, nativePlaying: false, lastCmd: -Infinity, wrote: -1, tail: false, sub: null } : null;
  const calm: Array<Track | null> = CALM_TRACKS.map((t) => track(make(t, false)));
  const tension = track(make(TENSION_TRACK, true));

  let current = -1;
  let nextUp = -1; // queued successor of `current`
  const history: number[] = [];
  let volume = Math.max(0, Math.min(1, initialVolume));
  let calmGain = 1;
  let tensionGain = 0;
  let rate = 1;
  let wroteRate = -1;
  let disposed = false;
  let appActive = appState ? appState.currentState !== 'background' && appState.currentState !== 'inactive' : true;

  const command = (t: Track, play: boolean) => {
    t.lastCmd = now();
    try {
      if (play) t.p.play();
      else t.p.pause();
    } catch (e) {
      audioWarnOnce('music-cmd', `music ${play ? 'play' : 'pause'} failed`, e);
    }
  };

  // Desired state changed: issue the command (foreground only; the
  // AppState handler catches up when we return).
  const setWant = (t: Track | null, want: boolean) => {
    if (!t || t.want === want) return;
    t.want = want;
    if (appActive) command(t, want);
  };

  // Native state disagrees with what we want: retry, paced.
  const reconcile = (t: Track, force = false) => {
    if (disposed || !appActive || t.tail) return;
    if (t.nativePlaying === t.want) return;
    if (!force && now() - t.lastCmd < RETRY_MS) return;
    if (t.want) audioWarnOnce('music-resume', 'music paused externally; resuming');
    command(t, t.want);
  };

  const writeVolume = (t: Track | null, v: number, force: boolean) => {
    if (!t) return;
    const w = t.wrote;
    if (force || (v === 0 ? w !== 0 : Math.abs(v - w) > Math.max(0.0015, 0.04 * w))) {
      try {
        t.p.volume = v;
        t.wrote = v;
      } catch (e) {
        audioWarnOnce('music-volume', 'music volume write failed', e);
      }
    }
  };

  const apply = (force = false) => {
    if (disposed) return;
    const level = perceptualVolume(volume);
    const cvRaw = level * calmGain;
    const tvRaw = level * tensionGain;
    const cv = cvRaw > SILENT_LEVEL ? cvRaw : 0;
    const tv = tvRaw > SILENT_LEVEL ? tvRaw : 0;
    const cur = current >= 0 ? calm[current] : null;
    writeVolume(cur, cv, force);
    for (const t of calm) if (t && t.tail) writeVolume(t, cv, force);
    writeVolume(tension, tv, force);
    if (tension && (force || Math.abs(rate - wroteRate) > 0.005)) {
      try {
        tension.p.setPlaybackRate(rate);
        wroteRate = rate;
      } catch (e) {
        audioWarnOnce('music-rate', 'music rate write failed', e);
      }
    }
    setWant(cur, cv > 0);
    setWant(tension, tv > 0);
  };

  const playableIdx = () => calm.flatMap((t, i) => (t ? [i] : []));

  const startNextCalm = () => {
    const next = nextUp >= 0 ? nextUp : pickNextCalm(playableIdx(), history, random);
    if (next < 0) return;
    const prev = current >= 0 ? calm[current] : null;
    if (prev && next !== current) {
      // Let the outgoing track finish its (faded) tail on its own.
      prev.tail = true;
    }
    current = next;
    history.push(next);
    if (history.length > 8) history.shift();
    nextUp = pickNextCalm(playableIdx(), history, random);
    const t = calm[next];
    if (!t) return;
    t.tail = false;
    try {
      t.p.seekTo(0);
    } catch (e) {
      audioWarnOnce('music-seek', 'music seek failed', e);
    }
    // Restart from the top: force a fresh play() if it should be audible.
    t.want = false;
    t.nativePlaying = false;
    apply(true);
  };

  const onStatus = (i: number, t: Track, status: MusicStatus) => {
    if (disposed) return;
    if (typeof status.playing === 'boolean') t.nativePlaying = status.playing;
    if (t.tail) {
      // Outgoing calm track: done once it stops.
      if (status.didJustFinish || status.playing === false) {
        t.tail = false;
        t.want = false;
        t.nativePlaying = false;
      }
      return;
    }
    if (i === current) {
      if (status.didJustFinish) {
        startNextCalm();
        return;
      }
      const d = status.duration ?? 0;
      const ct = status.currentTime ?? 0;
      if (t.want && status.playing && nextUp !== current && d > HANDOFF_S * 2 && ct >= d - HANDOFF_S) {
        startNextCalm();
        return;
      }
    }
    reconcile(t);
  };

  calm.forEach((t, i) => {
    if (!t) return;
    try {
      t.sub = t.p.addListener('playbackStatusUpdate', (s) => onStatus(i, t, s));
    } catch (e) {
      audioWarnOnce('music-listen', 'music status listener failed', e);
    }
  });
  if (tension) {
    try {
      tension.sub = tension.p.addListener('playbackStatusUpdate', (s) => onStatus(-1, tension, s));
    } catch (e) {
      audioWarnOnce('music-listen', 'music status listener failed', e);
    }
  }

  let appSub: { remove: () => void } | null = null;
  try {
    appSub =
      appState?.addEventListener('change', (state) => {
        const active = state === 'active';
        if (active === appActive) return;
        appActive = active;
        if (!active || disposed) return;
        // Back in the foreground: re-assert every player's state (the
        // OS may have left ours paused, or resumed ones we'd paused).
        for (const t of [...calm, tension]) {
          if (!t || t.tail) continue;
          if (t.want) command(t, true);
          else if (t.nativePlaying) command(t, false);
        }
      }) ?? null;
  } catch (e) {
    audioWarnOnce('music-appstate', 'music AppState listener failed', e);
  }

  startNextCalm();

  return {
    setVolume: (v) => {
      volume = Math.max(0, Math.min(1, v));
      apply();
    },
    setMix: (c, t, r) => {
      calmGain = c;
      tensionGain = t;
      rate = r;
      apply();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        appSub?.remove();
      } catch {
        // ignore
      }
      for (const t of [...calm, tension]) {
        if (!t) continue;
        try {
          t.sub?.remove();
          t.p.pause();
          t.p.remove();
        } catch {
          // already released
        }
      }
    },
  };
}

import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import * as RN from 'react-native';
import { getSirenDataUri } from '../util/siren';
import { perceptualVolume } from '../util/musicIntensity';
import { audioWarnOnce } from './Sfx';

// Two-tone siren wired to detection level. The audio source is a
// synthesised, seamlessly looping WAV data URI (see util/siren.ts), so
// there's no asset to bundle.
//
// Volume is updated each frame from the highest detection across
// all guards. Sub-threshold => silent and paused (so the speaker
// idles). Above threshold => looping, fading in over the first
// FADE_IN_SPAN of detection (no abrupt onset), then tracking the
// meter.
//
// Play state comes from the native player's status events
// (playbackStatusUpdate.playing), not from a flag set when we call
// play(): an external interruption (audio focus loss, another app's
// media) can pause it behind our back, and the old cached flag left
// the siren mute until detection dropped and rose again. (Reading
// player.playing directly would be a synchronous main-thread hop per
// frame on Android, so the event-fed copy is used instead.)

// Matches the alarm overlay's visible threshold (it quantises to 0.1
// and shows from 0.25 up), so the siren never sounds without the red
// edge.
export const SIREN_PLAY_THRESHOLD = 0.25;
export const SIREN_FADE_IN_SPAN = 0.1;
export const SIREN_MAX_VOLUME = 0.5;
// Don't re-issue play() / pause() more often than this while the
// native state disagrees (the player may still be preparing).
const RETRY_MS = 1000;

export type SirenHandle = {
  player: AudioPlayer | null;
  // Most recent volume written to the player.
  lastVolume: number;
  // Native play state, fed by playbackStatusUpdate events.
  nativePlaying: boolean;
  // Whether we currently want it playing, and when we last asked.
  wantPlaying: boolean;
  lastCommandAt: number;
  ready: boolean;
  dispose: () => void;
};

// createAudioPlayer can throw or return an unusable instance on some
// platforms; we wrap in try/catch so a busted siren doesn't crash
// the whole scene init.
export function createSiren(): SirenHandle {
  let player: AudioPlayer | null = null;
  let ready = false;
  try {
    player = createAudioPlayer(getSirenDataUri(), { updateInterval: 250 });
    if (player) {
      player.loop = true;
      player.volume = 0;
      ready = true;
    }
  } catch (e) {
    audioWarnOnce('siren-create', 'siren create failed', e);
    player = null;
  }
  let sub: { remove: () => void } | null = null;
  const handle: SirenHandle = {
    player,
    lastVolume: 0,
    nativePlaying: false,
    wantPlaying: false,
    lastCommandAt: -Infinity,
    ready,
    dispose: () => {
      handle.ready = false;
      try {
        sub?.remove();
      } catch {
        // ignore
      }
      sub = null;
      const p = handle.player;
      handle.player = null;
      if (p) {
        try {
          p.pause();
          p.remove();
        } catch {
          // best-effort; player may already be torn down
        }
      }
    },
  };
  try {
    sub =
      player?.addListener('playbackStatusUpdate', (status) => {
        if (typeof status.playing === 'boolean') handle.nativePlaying = status.playing;
      }) ?? null;
  } catch (e) {
    audioWarnOnce('siren-listen', 'siren status listener failed', e);
  }
  return handle;
}

// Target player volume for a detection level and master slider.
export function sirenVolume(detection: number, masterVolume: number): number {
  if (!(detection >= SIREN_PLAY_THRESHOLD)) return 0;
  const d = Math.min(1, detection);
  const fadeIn = Math.min(1, (d - SIREN_PLAY_THRESHOLD) / SIREN_FADE_IN_SPAN);
  return SIREN_MAX_VOLUME * d * fadeIn * perceptualVolume(masterVolume);
}

const appInBackground = () => {
  const st = (RN as { AppState?: { currentState?: string | null } }).AppState?.currentState;
  return st === 'background' || st === 'inactive';
};

export function updateSiren(
  s: SirenHandle,
  detection: number,
  masterVolume: number,
  now: number = Date.now(),
) {
  const p = s.player;
  if (!s.ready || !p) return;
  const vol = sirenVolume(detection, masterVolume);
  try {
    // Exact 0 always lands; otherwise coalesce tiny changes.
    if (vol === 0 ? s.lastVolume !== 0 : Math.abs(vol - s.lastVolume) > 0.01) {
      p.volume = vol;
      s.lastVolume = vol;
    }
    if (vol > 0) {
      const retry = !s.nativePlaying && now - s.lastCommandAt >= RETRY_MS;
      if ((!s.wantPlaying || retry) && !appInBackground()) {
        s.wantPlaying = true;
        s.lastCommandAt = now;
        p.play();
      }
    } else if (s.wantPlaying || (s.nativePlaying && now - s.lastCommandAt >= RETRY_MS)) {
      s.wantPlaying = false;
      s.lastCommandAt = now;
      p.pause();
    }
  } catch (e) {
    // some platforms reject play before fully loaded; retried next frame
    audioWarnOnce('siren-update', 'siren update failed', e);
  }
}

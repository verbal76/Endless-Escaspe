import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

// Background music with a danger layer.
//
// - Calm playlist: the two lighter tracks, shuffled back to back.
// - Tension layer: "Polysneak Pursuit" looping underneath at zero
//   volume, faded in as danger rises (see util/musicIntensity.ts).
//
// Both run continuously while the app is active so a crossfade is
// instant; the mix only changes volumes (and the tension layer's
// rate). Writes to the native players are coalesced so per-frame mix
// updates don't spam the bridge.

const CALM_TRACKS = [
  require('../../assets/music/pocketEscapeRemix.mp3'),
  require('../../assets/music/voxelSneakParade.mp3'),
];
const TENSION_TRACK = require('../../assets/music/polysneakPursuit.mp3');

export type MusicPlayer = {
  setVolume: (v: number) => void;
  setMix: (calmGain: number, tensionGain: number, rate: number) => void;
  pause: () => void;
  resume: () => void;
  dispose: () => void;
};

function makePlayer(asset: number, loop: boolean): AudioPlayer | null {
  try {
    const p = createAudioPlayer(asset, { updateInterval: 500 });
    p.loop = loop;
    p.volume = 0;
    return p;
  } catch {
    // Audio unavailable (e.g. no output device) - run silently.
    return null;
  }
}

export function createMusic(initialVolume: number): MusicPlayer {
  const calm: Array<AudioPlayer | null> = CALM_TRACKS.map((t) => makePlayer(t, false));
  const tension = makePlayer(TENSION_TRACK, true);
  let current = -1;
  let volume = Math.max(0, Math.min(1, initialVolume));
  let calmGain = 1;
  let tensionGain = 0;
  let rate = 1;
  let paused = false;
  // Last values written to the native players.
  let wroteCalm = -1;
  let wroteTension = -1;
  let wroteRate = -1;

  const apply = (force = false) => {
    const cv = paused ? 0 : volume * calmGain;
    const tv = paused ? 0 : volume * tensionGain;
    const p = current >= 0 ? calm[current] : null;
    try {
      if (p && (force || Math.abs(cv - wroteCalm) > 0.01)) {
        p.volume = cv;
        wroteCalm = cv;
      }
      if (tension && (force || Math.abs(tv - wroteTension) > 0.01)) {
        tension.volume = tv;
        wroteTension = tv;
      }
      if (tension && (force || Math.abs(rate - wroteRate) > 0.005)) {
        tension.setPlaybackRate(rate);
        wroteRate = rate;
      }
    } catch {
      // player released mid-update
    }
  };

  const startNextCalm = () => {
    const playable = calm.map((p, i) => ({ p, i })).filter((e) => e.p !== null);
    if (playable.length === 0) return;
    let next = playable[0].i;
    if (playable.length > 1) {
      do {
        next = playable[Math.floor(Math.random() * playable.length)].i;
      } while (next === current);
    }
    current = next;
    const p = calm[next];
    try {
      p?.seekTo(0);
      p?.play();
    } catch {
      // ignore
    }
    apply(true);
  };

  calm.forEach((p, i) => {
    try {
      p?.addListener('playbackStatusUpdate', (status) => {
        if (i === current && status.didJustFinish) startNextCalm();
      });
    } catch {
      // ignore
    }
  });

  startNextCalm();
  try {
    tension?.play();
  } catch {
    // ignore
  }
  apply(true);

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
    pause: () => {
      paused = true;
      apply(true);
      try {
        (current >= 0 ? calm[current] : null)?.pause();
        tension?.pause();
      } catch {
        // ignore
      }
    },
    resume: () => {
      paused = false;
      try {
        (current >= 0 ? calm[current] : null)?.play();
        tension?.play();
      } catch {
        // ignore
      }
      apply(true);
    },
    dispose: () => {
      for (const p of [...calm, tension]) {
        try {
          p?.pause();
          p?.remove();
        } catch {
          // ignore
        }
      }
    },
  };
}

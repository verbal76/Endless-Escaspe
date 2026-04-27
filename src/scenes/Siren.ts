import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { getSirenDataUri } from '../util/siren';

// Real two-tone siren wired to detection level. The audio source is
// a synthesised WAV data URI (see util/siren.ts) so there's no asset
// to bundle - the WAV is generated once at module load and fed
// directly to expo-audio.
//
// Volume is updated each frame from the highest detection across
// all guards. Sub-threshold => silent and paused (so the speaker
// idles). Above threshold => looping with volume tracking the meter.

const PLAY_THRESHOLD = 0.10;
const MAX_VOLUME = 0.85;

export type SirenHandle = {
  player: AudioPlayer | null;
  // Most recent volume (0..MAX_VOLUME) so we can detect changes.
  lastVolume: number;
  isPlaying: boolean;
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
  } catch {
    player = null;
  }
  return {
    player,
    lastVolume: 0,
    isPlaying: false,
    ready,
    dispose: () => {
      if (player) {
        try {
          player.pause();
          player.remove();
        } catch {
          // best-effort; player may already be torn down
        }
      }
    },
  };
}

export function updateSiren(s: SirenHandle, detection: number) {
  if (!s.ready || !s.player) return;
  if (detection >= PLAY_THRESHOLD) {
    const vol = Math.min(MAX_VOLUME, detection * MAX_VOLUME);
    if (Math.abs(vol - s.lastVolume) > 0.02) {
      s.player.volume = vol;
      s.lastVolume = vol;
    }
    if (!s.isPlaying) {
      try {
        s.player.play();
        s.isPlaying = true;
      } catch {
        // ignore - some platforms reject play before fully loaded
      }
    }
  } else {
    if (s.isPlaying) {
      try {
        s.player.pause();
      } catch {
        // ignore
      }
      s.isPlaying = false;
    }
    if (s.lastVolume !== 0) {
      try {
        s.player.volume = 0;
      } catch {
        // ignore
      }
      s.lastVolume = 0;
    }
  }
}

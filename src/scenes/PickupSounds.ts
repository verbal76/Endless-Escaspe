import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { getPickupGrabUri, getPickupUseUri } from '../util/blips';

// Two pre-loaded short tones for pickup events (grab / use). Each is
// played by seeking to 0 and calling play() so rapid retriggers
// always restart from the start of the tone. Volume is gated by the
// store's masterVolume; supply it on each play call.
//
// createAudioPlayer can throw or return an unusable instance on
// some platforms; we wrap construction and playback in try/catch so
// audio failures never block gameplay.

const PEAK_VOLUME = 0.55;

export type PickupSounds = {
  grab: AudioPlayer | null;
  use: AudioPlayer | null;
  dispose: () => void;
};

function makePlayer(uri: string): AudioPlayer | null {
  try {
    const p = createAudioPlayer(uri, { updateInterval: 500 });
    if (p) {
      p.loop = false;
      p.volume = 0;
      return p;
    }
  } catch {
    // ignore
  }
  return null;
}

export function createPickupSounds(): PickupSounds {
  const grab = makePlayer(getPickupGrabUri());
  const use = makePlayer(getPickupUseUri());
  return {
    grab,
    use,
    dispose: () => {
      for (const p of [grab, use]) {
        if (!p) continue;
        try {
          p.pause();
          p.remove();
        } catch {
          // best-effort
        }
      }
    },
  };
}

function playOnce(p: AudioPlayer | null, masterVolume: number) {
  if (!p) return;
  const vol = Math.max(0, Math.min(1, masterVolume)) * PEAK_VOLUME;
  try {
    p.volume = vol;
    // seekTo returns a promise; we don't await - playback can start
    // as soon as the seek lands. For sub-second tones this is fast
    // enough that the perceptual delay is negligible.
    p.seekTo(0);
    p.play();
  } catch {
    // ignore
  }
}

export function playPickupGrab(s: PickupSounds, masterVolume: number) {
  playOnce(s.grab, masterVolume);
}

export function playPickupUse(s: PickupSounds, masterVolume: number) {
  playOnce(s.use, masterVolume);
}

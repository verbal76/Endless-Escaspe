import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

// Background music player. Pre-loads three soundtrack tracks at app
// start, plays them in a continuous shuffle (advance to a different
// random track on completion so the same song doesn't repeat
// twice). Volume is gated by a single setVolume() call so the
// SettingsScreen slider can update the live track in real time.
//
// expo-audio's AudioPlayer accepts a require'd asset directly; the
// Metro bundler resolves it as a static asset URI. No expo-asset
// gymnastics needed.

const TRACKS = [
  require('../../assets/music/polysneakPursuit.mp3'),
  require('../../assets/music/pocketEscapeRemix.mp3'),
  require('../../assets/music/voxelSneakParade.mp3'),
];

export type MusicPlayer = {
  setVolume: (v: number) => void;
  pause: () => void;
  resume: () => void;
  dispose: () => void;
};

function makePlayer(asset: number): AudioPlayer | null {
  try {
    const p = createAudioPlayer(asset, { updateInterval: 500 });
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

export function createMusic(initialVolume: number): MusicPlayer {
  const players: Array<AudioPlayer | null> = TRACKS.map(makePlayer);
  let currentIndex = -1;
  let volume = Math.max(0, Math.min(1, initialVolume));
  let paused = false;

  function pickNextIndex(): number {
    // Advance to a different random track each time so the same song
    // doesn't replay back-to-back. Falls through to a sequential pick
    // if we somehow only have one playable track.
    const playable = players
      .map((p, i) => ({ p, i }))
      .filter((e) => e.p !== null);
    if (playable.length === 0) return -1;
    if (playable.length === 1) return playable[0].i;
    let pickIdx: number;
    do {
      pickIdx = playable[Math.floor(Math.random() * playable.length)].i;
    } while (pickIdx === currentIndex);
    return pickIdx;
  }

  function startNext() {
    const next = pickNextIndex();
    if (next < 0) return;
    currentIndex = next;
    const p = players[next];
    if (!p) return;
    try {
      p.volume = paused ? 0 : volume;
      p.seekTo(0);
      p.play();
    } catch {
      // ignore
    }
  }

  // Subscribe to each player's playbackStatusUpdate so when one
  // finishes we kick off the next track. expo-audio fires status
  // updates every `updateInterval` ms; `didJustFinish` flips true
  // exactly once at completion.
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p) continue;
    try {
      p.addListener('playbackStatusUpdate', (status) => {
        if (i !== currentIndex) return;
        if (status.didJustFinish) startNext();
      });
    } catch {
      // ignore
    }
  }

  // Kick off the first track on creation. Volume guard means the
  // first play() call still happens at zero volume if the slider
  // is at zero, but the playback loop is alive - bumping the slider
  // mid-game makes music audible without restarting.
  startNext();

  return {
    setVolume: (v) => {
      volume = Math.max(0, Math.min(1, v));
      const p = currentIndex >= 0 ? players[currentIndex] : null;
      if (!p) return;
      try {
        p.volume = paused ? 0 : volume;
      } catch {
        // ignore
      }
    },
    pause: () => {
      paused = true;
      const p = currentIndex >= 0 ? players[currentIndex] : null;
      if (!p) return;
      try {
        p.volume = 0;
        p.pause();
      } catch {
        // ignore
      }
    },
    resume: () => {
      paused = false;
      const p = currentIndex >= 0 ? players[currentIndex] : null;
      if (!p) {
        startNext();
        return;
      }
      try {
        p.volume = volume;
        p.play();
      } catch {
        // ignore
      }
    },
    dispose: () => {
      for (const p of players) {
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

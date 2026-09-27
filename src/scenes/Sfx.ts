import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

// Sampled sound effects (Kenney CC0 sounds; see assets/LICENSES.md).
// Replaces the old synthesized sine / noise blips. Each effect gets a
// small round-robin pool so rapid repeats (e.g. two guards firing)
// overlap instead of cutting each other off.

const SOURCES = {
  pickup_grab: require('../../assets/sfx/pickup_grab.mp3'),
  crowbar_swing: require('../../assets/sfx/crowbar_swing.mp3'),
  crowbar_hit: require('../../assets/sfx/crowbar_hit.mp3'),
  smoke_pop: require('../../assets/sfx/smoke_pop.mp3'),
  gunshot: require('../../assets/sfx/gunshot.mp3'),
  aim_click: require('../../assets/sfx/aim_click.mp3'),
  caught: require('../../assets/sfx/caught.mp3'),
  hurt: require('../../assets/sfx/hurt.mp3'),
  ui_tap: require('../../assets/sfx/ui_tap.mp3'),
  throw: require('../../assets/sfx/throw.mp3'),
  throw_land: require('../../assets/sfx/throw_land.mp3'),
} as const;

export type SfxName = keyof typeof SOURCES;

// Per-effect mix level (before the master volume slider).
const GAIN: Record<SfxName, number> = {
  pickup_grab: 0.6,
  crowbar_swing: 0.55,
  crowbar_hit: 0.75,
  smoke_pop: 0.6,
  gunshot: 0.7,
  aim_click: 0.5,
  caught: 0.7,
  hurt: 0.7,
  ui_tap: 0.4,
  throw: 0.45,
  throw_land: 0.65,
};

const POOL: Record<SfxName, number> = {
  pickup_grab: 2,
  crowbar_swing: 1,
  crowbar_hit: 1,
  smoke_pop: 1,
  gunshot: 3,
  aim_click: 2,
  caught: 1,
  hurt: 1,
  ui_tap: 1,
  throw: 1,
  throw_land: 2,
};

export type Sfx = {
  pools: Record<SfxName, { players: Array<AudioPlayer | null>; next: number }>;
  dispose: () => void;
};

function make(src: number): AudioPlayer | null {
  try {
    const p = createAudioPlayer(src, { updateInterval: 1000 });
    p.loop = false;
    p.volume = 0;
    return p;
  } catch {
    return null;
  }
}

export function createSfx(): Sfx {
  const pools = {} as Sfx['pools'];
  for (const name of Object.keys(SOURCES) as SfxName[]) {
    pools[name] = { players: Array.from({ length: POOL[name] }, () => make(SOURCES[name])), next: 0 };
  }
  return {
    pools,
    dispose: () => {
      for (const name of Object.keys(pools) as SfxName[]) {
        for (const p of pools[name].players) {
          try {
            p?.pause();
            p?.remove();
          } catch {
            // already released
          }
        }
      }
    },
  };
}

// Fire-and-forget. `gain` scales this one play (e.g. distance falloff).
export function playSfx(s: Sfx, name: SfxName, masterVolume: number, gain: number = 1) {
  const pool = s.pools[name];
  const p = pool.players[pool.next];
  pool.next = (pool.next + 1) % pool.players.length;
  if (!p) return;
  const vol = Math.max(0, Math.min(1, masterVolume * GAIN[name] * gain));
  if (vol <= 0.001) return;
  try {
    p.volume = vol;
    p.seekTo(0);
    p.play();
  } catch {
    // Player released or audio focus lost; skip this play.
  }
}

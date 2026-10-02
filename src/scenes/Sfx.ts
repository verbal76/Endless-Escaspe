import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { useStore } from '../state/store';
import { logDebug } from '../util/debug';
import { perceptualVolume } from '../util/musicIntensity';

// Sampled sound effects (Kenney CC0 sounds; see assets/LICENSES.md).
// Each effect gets a small round-robin pool so rapid repeats (e.g.
// two guards firing) overlap instead of cutting each other off.
//
// stage_clear / coin / purchase / spotted / alarm are derived from
// the same Kenney files (pitched / layered; recipes in LICENSES.md).

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
  stage_clear: require('../../assets/sfx/stage_clear.mp3'),
  coin: require('../../assets/sfx/coin.mp3'),
  purchase: require('../../assets/sfx/purchase.mp3'),
  spotted: require('../../assets/sfx/spotted.mp3'),
  alarm: require('../../assets/sfx/alarm.mp3'),
} as const;

export type SfxName = keyof typeof SOURCES;

// Per-effect mix level (before the master volume slider). Balanced
// on the loudest 50 ms of each asset so the cues that matter most sit
// on top: the "killed" hurt and caught cues are the loudest things in
// the mix, above the gunshot that precedes them, and the crowbar
// whoosh (the only feedback for a miss) sits clearly above the music.
// Effective levels (loudest 50 ms, dBFS, at master 1) in comments.
export const SFX_GAIN: Record<SfxName, number> = {
  hurt: 1.0, //            -9.5
  caught: 0.7, //          -9.3
  alarm: 0.8, //          -12.0
  crowbar_hit: 0.75, //   -12.4
  pickup_grab: 0.6, //    -12.2
  stage_clear: 0.9, //    -13.0
  gunshot: 0.55, //       -13.0 (x distance falloff)
  purchase: 0.8, //       -13.5
  throw_land: 0.65, //    -15.2 (x distance falloff)
  crowbar_swing: 0.65, // -15.5
  smoke_pop: 0.6, //      -15.6
  spotted: 0.8, //        -16.7
  throw: 0.45, //         -17.3
  coin: 0.5, //           -17.3
  aim_click: 0.5, //      -19.4
  ui_tap: 0.4, //         -19.8
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
  stage_clear: 1,
  coin: 2,
  purchase: 1,
  spotted: 1,
  alarm: 1,
};

// Minimum spacing between two plays of the same effect. UI taps and
// coin ticks can fire in bursts; spotted / alarm are stingers that
// must not stutter when several guards trip at once.
export const SFX_MIN_INTERVAL_MS: Partial<Record<SfxName, number>> = {
  ui_tap: 60,
  coin: 45,
  spotted: 2000,
  alarm: 1500,
  stage_clear: 500,
};

// Log the first failure of each kind into the debug crash trail
// (shared by Music / Siren), without flooding it from per-frame code.
const warned = new Set<string>();
export function audioWarnOnce(key: string, msg: string, err?: unknown) {
  if (warned.has(key)) return;
  warned.add(key);
  try {
    logDebug('warn', `[audio] ${msg}`, err ?? '');
  } catch {
    // logging must never break audio
  }
}

export type Sfx = {
  pools: Record<SfxName, { players: Array<AudioPlayer | null>; next: number }>;
  lastPlayedAt: Partial<Record<SfxName, number>>;
  // Plays at the store's master volume. Usable from anywhere that
  // holds the handle; HUD components can use playUiSfx instead.
  play: (name: SfxName, gain?: number) => void;
  dispose: () => void;
};

function make(name: SfxName): AudioPlayer | null {
  try {
    const p = createAudioPlayer(SOURCES[name], { updateInterval: 1000 });
    p.loop = false;
    p.volume = 0;
    return p;
  } catch (e) {
    audioWarnOnce('sfx-create', `sfx create failed: ${name}`, e);
    return null;
  }
}

// The live Sfx instance, for UI code that has no handle (playUiSfx).
let shared: Sfx | null = null;

export function createSfx(): Sfx {
  const pools = {} as Sfx['pools'];
  for (const name of Object.keys(SOURCES) as SfxName[]) {
    pools[name] = { players: Array.from({ length: POOL[name] }, () => make(name)), next: 0 };
  }
  let disposed = false;
  const s: Sfx = {
    pools,
    lastPlayedAt: {},
    play: (name, gain = 1) => {
      if (disposed) return;
      playSfx(s, name, useStore.getState().masterVolume, gain);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (shared === s) shared = null;
      for (const name of Object.keys(pools) as SfxName[]) {
        for (const p of pools[name].players) {
          try {
            p?.pause();
            p?.remove();
          } catch {
            // already released
          }
        }
        pools[name].players = [];
      }
    },
  };
  shared = s;
  return s;
}

// Effective player volume for one play: perceptual master curve x
// per-effect level x per-play gain (e.g. distance falloff).
export function sfxVolume(name: SfxName, masterVolume: number, gain: number = 1): number {
  return Math.max(0, Math.min(1, perceptualVolume(masterVolume) * SFX_GAIN[name] * gain));
}

// Fire-and-forget. `gain` scales this one play (e.g. distance falloff).
// Returns whether a play was issued (false: silent, throttled, no player).
export function playSfx(
  s: Sfx,
  name: SfxName,
  masterVolume: number,
  gain: number = 1,
  now: number = Date.now(),
): boolean {
  const pool = s.pools[name];
  if (!pool || pool.players.length === 0) return false;
  const minGap = SFX_MIN_INTERVAL_MS[name];
  const last = s.lastPlayedAt[name];
  if (minGap !== undefined && last !== undefined && now - last < minGap) return false;
  const vol = sfxVolume(name, masterVolume, gain);
  if (vol <= 0.0005) return false;
  const p = pool.players[pool.next];
  pool.next = (pool.next + 1) % pool.players.length;
  if (!p) return false;
  s.lastPlayedAt[name] = now;
  try {
    p.volume = vol;
    p.seekTo(0);
    p.play();
    return true;
  } catch (e) {
    // Player released or audio focus lost; skip this play.
    audioWarnOnce('sfx-play', `sfx play failed: ${name}`, e);
    return false;
  }
}

// For HUD / menu components without an Sfx handle: plays on the live
// instance (created by Game) at the stored master volume. No-op
// before the game scene has created its sound bank.
export function playUiSfx(name: SfxName = 'ui_tap', gain: number = 1): boolean {
  if (!shared) return false;
  return playSfx(shared, name, useStore.getState().masterVolume, gain);
}

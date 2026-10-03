// Small pure rules the game loop (Game.tsx) applies at run / segment
// boundaries. Kept out of the loop's closures so they can be tested.
import type { GameMode } from '../state/store';
import type { RunState } from '../types/world';
import { noiseMultiplier, visionMultiplier, type WeatherKind } from '../scenes/Weather';

// Endless / Daily: one mood per run, picked from the run's seed (day,
// afternoon, dusk or night - the moods of stages 1-4), so runs differ
// but a Daily is the same for everyone that day. Campaign stages use
// their own mood. Math.imul keeps the multiplicative hash in 32 bits:
// a plain `*` overflows 2^53 for real seeds, drops the low bits and
// made almost every run Day.
export function moodStageFor(stage: number, mode: GameMode, seed: number): number {
  if (mode === 'campaign') return stage;
  return 1 + ((Math.imul(seed >>> 0, 2654435761) >>> 0) % 4);
}

// Leaving gameplay (menu, banners) drops bullets in flight and every
// guard's aim wind-up. Pausing is NOT leaving: a paused run is frozen
// as it is, otherwise pausing at the aim click dodges every shot.
export function clearsCombatState(runState: RunState): boolean {
  return runState !== 'playing';
}

// Weather multipliers the detection rules use. Normally they follow
// the weather the player sees; with weather effects toggled off the
// AI gets a flat compensation instead. The Daily is the same run for
// everyone, so its rules follow the day's rolled weather whatever the
// visual toggle says.
export function weatherRules(
  mode: GameMode,
  weatherEnabled: boolean,
  shownKind: WeatherKind,
  rolledKind: WeatherKind,
): { vision: number; noise: number } {
  if (mode === 'daily') {
    return { vision: visionMultiplier(rolledKind), noise: noiseMultiplier(rolledKind) };
  }
  if (!weatherEnabled) return { vision: 1.1, noise: 1.0 };
  return { vision: visionMultiplier(shownKind), noise: noiseMultiplier(shownKind) };
}

import { create } from 'zustand';
import type { RunState, Stance } from '../types/world';
import type { WeatherKind } from '../scenes/Weather';

// End-of-segment stats reported on the win board.
export type RunStats = {
  // Number of distinct alert peaks this run (transitions from
  // "calm" to "any guard above SEEN_THRESHOLD"); a proxy for how
  // often the player got noticed.
  timesSeen: number;
  // Total seconds where any guard had detection above
  // DETECTED_THRESHOLD.
  timeDetected: number;
  // Wall-clock seconds from run start to win line.
  runDurationS: number;
  // 3 - hearts at finish (i.e. how many catches you took to get here).
  livesUsed: number;
  // Computed 1..3 stars based on the four metrics above.
  stars: number;
};

type Store = {
  runState: RunState;
  hearts: number;
  // Per-guard detection 0..1; HUD subscribes selectively to keep re-renders cheap.
  detection: Record<number, number>;
  segmentSeed: number;
  stage: number;
  stance: Stance;
  paused: boolean;
  restartCounter: number;
  // Per-segment weather. Picked at segment init by Game.tsx via
  // pickWeather(seed); HUD subscribes if it ever needs to surface it.
  weather: WeatherKind;
  lastStats: RunStats | null;
  setRunState: (s: RunState) => void;
  setHearts: (n: number) => void;
  setDetection: (id: number, v: number) => void;
  setStance: (s: Stance) => void;
  setStage: (n: number) => void;
  setPaused: (b: boolean) => void;
  setLastStats: (s: RunStats | null) => void;
  setWeather: (w: WeatherKind) => void;
  requestRestart: () => void;
  resetForSegment: (seed: number) => void;
  startRun: () => void;
};

export const useStore = create<Store>((set) => ({
  runState: 'idle',
  hearts: 3,
  detection: {},
  segmentSeed: 1,
  stage: 1,
  stance: 'walk',
  paused: false,
  restartCounter: 0,
  weather: 'clear',
  lastStats: null,
  setRunState: (s) => set({ runState: s }),
  setHearts: (n) => set({ hearts: n }),
  setDetection: (id, v) =>
    set((st) => {
      const cur = st.detection[id];
      if (cur !== undefined && Math.abs(cur - v) < 0.01) return st;
      return { detection: { ...st.detection, [id]: v } };
    }),
  setStance: (s) =>
    set((st) => (st.stance === s ? st : { stance: s })),
  setStage: (n) =>
    set((st) => (st.stage === n ? st : { stage: n })),
  setPaused: (b) => set((st) => (st.paused === b ? st : { paused: b })),
  setLastStats: (s) => set({ lastStats: s }),
  setWeather: (w) => set((st) => (st.weather === w ? st : { weather: w })),
  requestRestart: () =>
    set((st) => ({
      restartCounter: st.restartCounter + 1,
      paused: false,
      lastStats: null,
    })),
  resetForSegment: (seed) =>
    set({
      runState: 'playing',
      detection: {},
      segmentSeed: seed,
      stance: 'walk',
      paused: false,
      lastStats: null,
    }),
  startRun: () =>
    set({
      runState: 'playing',
      hearts: 3,
      detection: {},
      stance: 'walk',
      paused: false,
      lastStats: null,
    }),
}));

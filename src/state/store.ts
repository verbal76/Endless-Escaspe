import { create } from 'zustand';
import type { RunState, Stance } from '../types/world';

type Store = {
  runState: RunState;
  hearts: number;
  // Per-guard detection 0..1; HUD subscribes selectively to keep re-renders cheap.
  detection: Record<number, number>;
  segmentSeed: number;
  // Mirrors player.stance for HUD subscribers (e.g. the PRONE badge).
  // The game loop only pushes when stance changes, so HUD components
  // don't re-render every frame.
  stance: Stance;
  setRunState: (s: RunState) => void;
  setHearts: (n: number) => void;
  setDetection: (id: number, v: number) => void;
  setStance: (s: Stance) => void;
  resetForSegment: (seed: number) => void;
  startRun: () => void;
};

export const useStore = create<Store>((set) => ({
  runState: 'idle',
  hearts: 3,
  detection: {},
  segmentSeed: 1,
  stance: 'walk',
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
  resetForSegment: (seed) =>
    set({ runState: 'playing', detection: {}, segmentSeed: seed, stance: 'walk' }),
  startRun: () =>
    set({ runState: 'playing', hearts: 3, detection: {}, stance: 'walk' }),
}));

import { create } from 'zustand';
import type { RunState } from '../types/world';

type Store = {
  runState: RunState;
  hearts: number;
  // Per-guard detection 0..1; HUD subscribes selectively to keep re-renders cheap.
  detection: Record<number, number>;
  segmentSeed: number;
  setRunState: (s: RunState) => void;
  setHearts: (n: number) => void;
  setDetection: (id: number, v: number) => void;
  resetForSegment: (seed: number) => void;
  startRun: () => void;
};

export const useStore = create<Store>((set) => ({
  runState: 'idle',
  hearts: 3,
  detection: {},
  segmentSeed: 1,
  setRunState: (s) => set({ runState: s }),
  setHearts: (n) => set({ hearts: n }),
  setDetection: (id, v) =>
    set((st) => {
      const cur = st.detection[id];
      // Avoid set() when delta is sub-pixel; HUD uses bar widths.
      if (cur !== undefined && Math.abs(cur - v) < 0.01) return st;
      return { detection: { ...st.detection, [id]: v } };
    }),
  resetForSegment: (seed) =>
    set({ runState: 'playing', detection: {}, segmentSeed: seed }),
  startRun: () => set({ runState: 'playing', hearts: 3, detection: {} }),
}));

import { create } from 'zustand';
import type { RunState } from '../types/world';

type Store = {
  runState: RunState;
  hearts: number;
  // Per-guard detection 0..1; HUD subscribes selectively to keep re-renders cheap.
  detection: Record<number, number>;
  segmentSeed: number;
  // Mirrors player.isHidden for HUD subscribers; the game loop pushes
  // it on transitions instead of every frame.
  isHidden: boolean;
  setRunState: (s: RunState) => void;
  setHearts: (n: number) => void;
  setDetection: (id: number, v: number) => void;
  setHidden: (b: boolean) => void;
  resetForSegment: (seed: number) => void;
  startRun: () => void;
};

export const useStore = create<Store>((set) => ({
  runState: 'idle',
  hearts: 3,
  detection: {},
  segmentSeed: 1,
  isHidden: false,
  setRunState: (s) => set({ runState: s }),
  setHearts: (n) => set({ hearts: n }),
  setDetection: (id, v) =>
    set((st) => {
      const cur = st.detection[id];
      if (cur !== undefined && Math.abs(cur - v) < 0.01) return st;
      return { detection: { ...st.detection, [id]: v } };
    }),
  setHidden: (b) =>
    set((st) => (st.isHidden === b ? st : { isHidden: b })),
  resetForSegment: (seed) =>
    set({ runState: 'playing', detection: {}, segmentSeed: seed, isHidden: false }),
  startRun: () =>
    set({ runState: 'playing', hearts: 3, detection: {}, isHidden: false }),
}));

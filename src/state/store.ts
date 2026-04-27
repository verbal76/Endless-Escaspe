import { create } from 'zustand';
import type { RunState, Stance } from '../types/world';
import type { WeatherKind } from '../scenes/Weather';
import type { Save, SavesMap } from '../util/storage';
import { startingHeartsFor } from '../util/progression';

export type PlayerSkin = 'beige' | 'brown';

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
  // Player stamina mirror (0..1). Game.tsx writes it each frame so
  // the HUD can subscribe; only meaningful when staminaEnabledFor
  // the current stage.
  stamina: number;
  // Camera alarm level (0..1). Wall-mounted cameras feed this
  // separately from per-guard detection; when it hits 1 an extra
  // guard is summoned for the rest of the run.
  alarmLevel: number;
  segmentSeed: number;
  stage: number;
  stance: Stance;
  paused: boolean;
  restartCounter: number;
  // Per-segment weather. Picked at segment init by Game.tsx via
  // pickWeather(seed); HUD subscribes if it ever needs to surface it.
  weather: WeatherKind;
  // Toggle: when false, every segment is forced to clear weather and
  // the AI gets a sense boost so the player doesn't get an easier
  // game by disabling effects. Persisted via AsyncStorage.
  weatherEnabled: boolean;
  // Master audio volume 0..1, applied on top of the siren's
  // detection-driven volume curve. Persisted via AsyncStorage.
  masterVolume: number;
  // Player head skin tone. Mirrors the active save's skin while a
  // run is underway so the rest of the codebase can keep reading
  // playerSkin without caring about save plumbing.
  playerSkin: PlayerSkin;
  // Display name typed at character creation. Empty until the player
  // either creates a new save or loads an existing one.
  playerName: string;
  // All known character saves, keyed by lowercased name. Hydrated
  // from AsyncStorage on boot.
  saves: SavesMap;
  // Lookup key (lowercased name) of the save the current run belongs
  // to. Null between runs / before any save is selected.
  activeSaveName: string | null;
  // Optional one-shot navigation for the start screen. Pause-menu
  // "LOAD RUN" sets this to 'continue' so the user lands directly on
  // the save list instead of the home buttons. StartScreen consumes
  // it on mount and clears it.
  pendingStartMode: 'home' | 'continue' | null;
  lastStats: RunStats | null;
  // Best star score (1..3) per stage for the *currently active save*.
  // Mirrored from save.bestStars when a save is loaded so existing
  // HUD code (Banner, etc.) can keep reading from the store. Resets
  // to {} when no save is active.
  bestStars: Record<number, number>;
  setRunState: (s: RunState) => void;
  setHearts: (n: number) => void;
  setDetection: (id: number, v: number) => void;
  setStamina: (v: number) => void;
  setAlarmLevel: (v: number) => void;
  setStance: (s: Stance) => void;
  setStage: (n: number) => void;
  setPaused: (b: boolean) => void;
  setLastStats: (s: RunStats | null) => void;
  setWeather: (w: WeatherKind) => void;
  setBestStars: (b: Record<number, number>) => void;
  setWeatherEnabled: (b: boolean) => void;
  setMasterVolume: (v: number) => void;
  setPlayerSkin: (s: PlayerSkin) => void;
  setPlayerName: (n: string) => void;
  setSaves: (m: SavesMap) => void;
  upsertSave: (save: Save) => void;
  removeSave: (key: string) => void;
  setActiveSave: (key: string | null) => void;
  setPendingStartMode: (m: 'home' | 'continue' | null) => void;
  recordSegmentStars: (stage: number, stars: number) => boolean;
  requestRestart: () => void;
  resetForSegment: (seed: number) => void;
  startRun: () => void;
};

export const useStore = create<Store>((set) => ({
  runState: 'idle',
  hearts: 3,
  detection: {},
  stamina: 1,
  alarmLevel: 0,
  segmentSeed: 1,
  stage: 1,
  stance: 'walk',
  paused: false,
  restartCounter: 0,
  weather: 'clear',
  weatherEnabled: true,
  masterVolume: 0.7,
  playerSkin: 'beige',
  playerName: '',
  saves: {},
  activeSaveName: null,
  pendingStartMode: null,
  lastStats: null,
  bestStars: {},
  setRunState: (s) => set({ runState: s }),
  setHearts: (n) => set({ hearts: n }),
  setDetection: (id, v) =>
    set((st) => {
      const cur = st.detection[id];
      if (cur === v) return st;
      return { detection: { ...st.detection, [id]: v } };
    }),
  setStamina: (v) =>
    set((st) => {
      const clamped = Math.max(0, Math.min(1, v));
      // Coalesce sub-1% changes so the HUD bar isn't re-rendering
      // every frame while the pool is slowly regenerating.
      return Math.abs(st.stamina - clamped) < 0.01 ? st : { stamina: clamped };
    }),
  setAlarmLevel: (v) =>
    set((st) => {
      const clamped = Math.max(0, Math.min(1, v));
      return Math.abs(st.alarmLevel - clamped) < 0.01
        ? st
        : { alarmLevel: clamped };
    }),
  setStance: (s) =>
    set((st) => (st.stance === s ? st : { stance: s })),
  setStage: (n) =>
    set((st) => (st.stage === n ? st : { stage: n })),
  setPaused: (b) => set((st) => (st.paused === b ? st : { paused: b })),
  setLastStats: (s) => set({ lastStats: s }),
  setWeather: (w) => set((st) => (st.weather === w ? st : { weather: w })),
  setWeatherEnabled: (b) =>
    set((st) => (st.weatherEnabled === b ? st : { weatherEnabled: b })),
  setMasterVolume: (v) =>
    set((st) => {
      const clamped = Math.max(0, Math.min(1, v));
      return Math.abs(st.masterVolume - clamped) < 0.005
        ? st
        : { masterVolume: clamped };
    }),
  setPlayerSkin: (s) =>
    set((st) => (st.playerSkin === s ? st : { playerSkin: s })),
  setPlayerName: (n) =>
    set((st) => (st.playerName === n ? st : { playerName: n })),
  setSaves: (m) => set({ saves: m }),
  upsertSave: (save) =>
    set((st) => ({
      saves: {
        ...st.saves,
        [save.name.trim().toLowerCase()]: save,
      },
    })),
  removeSave: (key) =>
    set((st) => {
      if (!(key in st.saves)) return st;
      const next: SavesMap = {};
      for (const k of Object.keys(st.saves)) {
        if (k !== key) next[k] = st.saves[k];
      }
      return {
        saves: next,
        activeSaveName: st.activeSaveName === key ? null : st.activeSaveName,
      };
    }),
  setActiveSave: (key) =>
    set((st) => (st.activeSaveName === key ? st : { activeSaveName: key })),
  setPendingStartMode: (m) =>
    set((st) => (st.pendingStartMode === m ? st : { pendingStartMode: m })),
  setBestStars: (b) => set({ bestStars: b }),
  // Returns true iff this is a new high score for the stage. Caller
  // can then persist to AsyncStorage (Game.tsx handles that).
  recordSegmentStars: (stage, stars) => {
    let isNewHigh = false;
    set((st) => {
      const current = st.bestStars[stage] ?? 0;
      if (stars <= current) return st;
      isNewHigh = true;
      return { bestStars: { ...st.bestStars, [stage]: stars } };
    });
    return isNewHigh;
  },
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
      stamina: 1,
      alarmLevel: 0,
      segmentSeed: seed,
      stance: 'walk',
      paused: false,
      lastStats: null,
    }),
  startRun: () =>
    set((st) => ({
      runState: 'playing',
      hearts: startingHeartsFor(st.stage),
      detection: {},
      stamina: 1,
      alarmLevel: 0,
      stance: 'walk',
      paused: false,
      lastStats: null,
    })),
}));

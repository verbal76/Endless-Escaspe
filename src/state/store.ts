import { create } from 'zustand';
import type { PickupKind, RunState, Stance } from '../types/world';
import type { WeatherKind } from '../scenes/Weather';
import type { Save, SavesMap } from '../util/storage';
import type { GameModalConfig } from '../components/HUD/GameModal';
import { startingHeartsFor } from '../util/progression';

// How many of each pickup the player is currently carrying. Counts
// reset to zero on each segment start. The HUD's PickupBag reads
// from here; Game.tsx's update loop writes when a pickup is grabbed
// or used.
export type Inventory = Record<PickupKind, number>;
const EMPTY_INVENTORY: Inventory = { crowbar: 0, smokebomb: 0 };

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
  // Visibility of the intro tutorial overlay. Set true on first
  // launch and from the start-screen "How to play" button; flips
  // back to false when the cutscene finishes or the player skips.
  showTutorial: boolean;
  // Branded confirm / alert modal config. Any component can set
  // this to show a popup; the GameModal mounted in Game.tsx renders
  // it. The action onPress handlers are responsible for clearing
  // the config back to null when the user taps a button.
  gameModal: GameModalConfig | null;
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
  // What killed the player on the most recent run-ending hit, used
  // by the death banner to render "ARRESTED" vs "KILLED". Cleared
  // on every new segment so the banner doesn't stale-read after a
  // win + Next Segment.
  lastDeathCause: 'arrested' | 'killed' | null;
  // Best star score (1..3) per stage for the *currently active save*.
  // Mirrored from save.bestStars when a save is loaded so existing
  // HUD code (Banner, etc.) can keep reading from the store. Resets
  // to {} when no save is active.
  bestStars: Record<number, number>;
  // Per-segment pickup inventory (crowbar, smoke bomb). Resets when
  // a new segment starts; mirrored to / from the game loop via the
  // setters below.
  inventory: Inventory;
  setRunState: (s: RunState) => void;
  setHearts: (n: number) => void;
  setDetection: (id: number, v: number) => void;
  setStamina: (v: number) => void;
  setAlarmLevel: (v: number) => void;
  setStance: (s: Stance) => void;
  setStage: (n: number) => void;
  setPaused: (b: boolean) => void;
  setLastStats: (s: RunStats | null) => void;
  setLastDeathCause: (c: 'arrested' | 'killed' | null) => void;
  setWeather: (w: WeatherKind) => void;
  setBestStars: (b: Record<number, number>) => void;
  setWeatherEnabled: (b: boolean) => void;
  setShowTutorial: (b: boolean) => void;
  setGameModal: (m: GameModalConfig | null) => void;
  setMasterVolume: (v: number) => void;
  setPlayerSkin: (s: PlayerSkin) => void;
  setPlayerName: (n: string) => void;
  setSaves: (m: SavesMap) => void;
  upsertSave: (save: Save) => void;
  removeSave: (key: string) => void;
  setActiveSave: (key: string | null) => void;
  setPendingStartMode: (m: 'home' | 'continue' | null) => void;
  recordSegmentStars: (stage: number, stars: number) => boolean;
  setInventory: (inv: Inventory) => void;
  addPickup: (kind: PickupKind) => void;
  consumePickup: (kind: PickupKind) => boolean;
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
  showTutorial: false,
  gameModal: null,
  masterVolume: 0.7,
  playerSkin: 'beige',
  playerName: '',
  saves: {},
  activeSaveName: null,
  pendingStartMode: null,
  lastStats: null,
  lastDeathCause: null,
  bestStars: {},
  inventory: { ...EMPTY_INVENTORY },
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
  setLastDeathCause: (c) =>
    set((st) => (st.lastDeathCause === c ? st : { lastDeathCause: c })),
  setWeather: (w) => set((st) => (st.weather === w ? st : { weather: w })),
  setWeatherEnabled: (b) =>
    set((st) => (st.weatherEnabled === b ? st : { weatherEnabled: b })),
  setShowTutorial: (b) =>
    set((st) => (st.showTutorial === b ? st : { showTutorial: b })),
  setGameModal: (m) => set({ gameModal: m }),
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
  setInventory: (inv) =>
    set((st) =>
      st.inventory.crowbar === inv.crowbar &&
      st.inventory.smokebomb === inv.smokebomb
        ? st
        : { inventory: { ...inv } },
    ),
  addPickup: (kind) =>
    set((st) => ({
      inventory: { ...st.inventory, [kind]: st.inventory[kind] + 1 },
    })),
  // Returns true if a pickup was actually consumed; lets callers
  // gate their effect on a successful decrement so spamming the
  // button on an empty slot is a no-op.
  consumePickup: (kind) => {
    let consumed = false;
    set((st) => {
      if (st.inventory[kind] <= 0) return st;
      consumed = true;
      return {
        inventory: { ...st.inventory, [kind]: st.inventory[kind] - 1 },
      };
    });
    return consumed;
  },
  requestRestart: () =>
    set((st) => ({
      restartCounter: st.restartCounter + 1,
      paused: false,
      lastStats: null,
      lastDeathCause: null,
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
      lastDeathCause: null,
      inventory: { ...EMPTY_INVENTORY },
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
      lastDeathCause: null,
      inventory: { ...EMPTY_INVENTORY },
    })),
}));

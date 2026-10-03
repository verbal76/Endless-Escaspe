import { create } from 'zustand';
import type { PickupKind, RunState, Stance } from '../types/world';
import type { WeatherKind } from '../scenes/Weather';
import type { Save, SavesMap } from '../util/storage';
import type { GameModalConfig } from '../components/HUD/GameModal';
import { startingHeartsFor } from '../util/progression';
import { snapVolume } from '../util/musicIntensity';

// Coalesce slider noise, but never swallow a move onto an endpoint.
const volumeUnchanged = (prev: number, next: number) =>
  next === prev || (next !== 0 && next !== 1 && Math.abs(prev - next) < 0.005);
import type { OutfitId } from '../util/outfits';
import type { UpdatePhase } from '../util/updateFlow';

// How many of each pickup the player is currently carrying. Counts
// reset to zero on each segment start. The HUD's PickupBag reads
// from here; Game.tsx's update loop writes when a pickup is grabbed
// or used.
export type Inventory = Record<PickupKind, number>;
const EMPTY_INVENTORY: Inventory = { crowbar: 0, smokebomb: 0, rock: 0 };

export type PlayerSkin = 'beige' | 'brown';

// campaign = numbered stages with a finish line; endless = a seeded,
// never-ending yard scored by distance; daily = endless with the
// day's shared seed.
export type GameMode = 'campaign' | 'endless' | 'daily';

// Shown on the end-of-run banner for Endless / Daily runs, and for
// the coins a campaign clear earned.
export type RunSummary = {
  mode: GameMode;
  distanceM: number;
  bestM: number;
  coinsEarned: number;
  coinsTotal: number;
  day: string | null;
};

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
  // Run time needed for full marks on the time metric (seconds), for
  // the results card. Absent on run-over / non-scored snapshots.
  timeTarget3?: number;
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
  // Run-toggle mirror. RunButton writes here on tap (alongside the
  // input.run flag the game loop reads); the HUD highlight subscribes
  // here so the button styling matches the actual run state, including
  // when resetSegment() clears it on level start.
  running: boolean;
  paused: boolean;
  restartCounter: number;
  // Per-segment weather. Picked at segment init by Game.tsx via
  // pickWeather(seed); HUD subscribes if it ever needs to surface it.
  weather: WeatherKind;
  // The weather setting the current segment was built with (the toggle
  // applies from the next segment).
  segmentWeatherEnabled: boolean;
  // Toggle: when false, every segment is forced to clear weather and
  // the AI gets a sense boost so the player doesn't get an easier
  // game by disabling effects. Persisted via AsyncStorage.
  weatherEnabled: boolean;
  // Vibration on/off (pause panel). Persisted with the settings.
  hapticsEnabled: boolean;
  // Visibility of the intro tutorial overlay. Set true on first
  // launch and from the start-screen "How to play" button; flips
  // back to false when the cutscene finishes or the player skips.
  showTutorial: boolean;
  // How to Play reference screen: where it was opened from (the home
  // screen, or the pause panel - which is its own native modal, so the
  // reference renders inside it there), or null when closed.
  howToPlay: 'home' | 'pause' | null;
  // Settings > About view open (rendered inside the settings panel).
  aboutOpen: boolean;
  // OTA activation state (util/updateFlow.ts), written by the
  // UpdateApplier; read by the applying overlay and About.
  updatePhase: UpdatePhase;
  // True while the start screen is on its home step with a run not
  // started: the only place an OTA may be applied (util/updateFlow.ts).
  menuIdle: boolean;
  // Persisted: the intro tutorial was watched or skipped once already.
  tutorialSeen: boolean;
  // Branded confirm / alert modal config. Any component can set
  // this to show a popup; the GameModal mounted in Game.tsx renders
  // it. The action onPress handlers are responsible for clearing
  // the config back to null when the user taps a button.
  gameModal: GameModalConfig | null;
  // Boss-arena dev gate. Once `bossModeUnlocked` is true the
  // settings panel surfaces the `bossModeEnabled` toggle; when
  // that's true, the next scene rebuild produces an arena variant
  // in place of the standard linear segment. Both flags mirror
  // the persisted Settings record so toggling them survives a
  // relaunch.
  bossModeUnlocked: boolean;
  bossModeEnabled: boolean;
  // Live countdown for the active boss-arena segment, in seconds.
  // The Game.tsx update loop writes this each frame (coalesced to
  // whole seconds); 0 outside an arena. The HUD's BossTimer
  // subscribes to render the on-screen clock.
  bossTimeRemaining: number;
  // Master audio volume 0..1 (the pause panel's "Volume"): scales
  // SFX, the siren and the music. Persisted via AsyncStorage.
  masterVolume: number;
  // Music slider 0..1, applied on top of masterVolume, so the player
  // can mute the soundtrack while keeping SFX. Persisted.
  musicVolume: number;
  // Boss-perk reward. Beating a boss arena (surviving the timer
  // without dying) sets perkRemainingStages to PERK_DURATION_STAGES;
  // each subsequent stage start decrements it. While > 0 the player
  // starts each segment with +1 heart over startingHeartsFor(stage).
  // Resets to 0 on run-end (caught state) so each fresh run earns
  // its own perks.
  perkRemainingStages: number;
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
  // Monotonic counter that increments on every catch (soft hit AND
  // run-ending hit). The CatchFlash HUD subscribes to this so it can
  // pop the shield+skull cue once per hit; the counter changing is
  // what triggers the animation, not the runState (which only flips
  // on the run-ending hit and would miss soft catches otherwise).
  catchCounter: number;
  // Best star score (1..3) per stage for the *currently active save*.
  // Mirrored from save.bestStars when a save is loaded so existing
  // HUD code (Banner, etc.) can keep reading from the store. Resets
  // to {} when no save is active.
  bestStars: Record<number, number>;
  // Per-segment pickup inventory (crowbar, smoke bomb). Resets when
  // a new segment starts; mirrored to / from the game loop via the
  // setters below.
  inventory: Inventory;
  // True while a crowbar is carried and something (guard or dog) is
  // inside swing range; the crowbar slot glows to match the in-world
  // target ring.
  crowbarInRange: boolean;
  gameMode: GameMode;
  // Daily run day key (YYYY-MM-DD) while gameMode === 'daily'.
  dailyDay: string | null;
  // Endless / Daily HUD: distance (whole metres) and current level.
  distanceM: number;
  endlessLevel: number;
  runSummary: RunSummary | null;
  playerOutfit: OutfitId;
  setGameMode: (m: GameMode, day?: string | null) => void;
  setDistance: (m: number, level: number) => void;
  setRunSummary: (s: RunSummary | null) => void;
  setPlayerOutfit: (o: OutfitId) => void;
  // Highest guard detection (0..1), coalesced for the HUD edge tint.
  dangerLevel: number;
  setDangerLevel: (v: number) => void;
  // Short in-game notice (camera alarm dispatch, tutorial prompts).
  // `id` changes on every post so repeated text still re-animates.
  toast: { id: number; text: string; tone: 'info' | 'warn' | 'tip' } | null;
  setCrowbarInRange: (b: boolean) => void;
  showToast: (text: string, tone?: 'info' | 'warn' | 'tip') => void;
  clearToast: () => void;
  setRunState: (s: RunState) => void;
  setHearts: (n: number) => void;
  setDetection: (id: number, v: number) => void;
  // Write every guard's meter in one store update (one notification
  // per frame instead of one per guard).
  setDetections: (values: ReadonlyMap<number, number>) => void;
  setStamina: (v: number) => void;
  setAlarmLevel: (v: number) => void;
  setStance: (s: Stance) => void;
  setRunning: (b: boolean) => void;
  setStage: (n: number) => void;
  setPaused: (b: boolean) => void;
  setLastStats: (s: RunStats | null) => void;
  setLastDeathCause: (c: 'arrested' | 'killed' | null) => void;
  bumpCatchCounter: () => void;
  setWeather: (w: WeatherKind) => void;
  setSegmentWeatherEnabled: (v: boolean) => void;
  setBestStars: (b: Record<number, number>) => void;
  setWeatherEnabled: (b: boolean) => void;
  setHapticsEnabled: (b: boolean) => void;
  setShowTutorial: (b: boolean) => void;
  setHowToPlay: (v: 'home' | 'pause' | null) => void;
  setAboutOpen: (b: boolean) => void;
  setUpdatePhase: (p: UpdatePhase) => void;
  setMenuIdle: (b: boolean) => void;
  setTutorialSeen: (b: boolean) => void;
  setGameModal: (m: GameModalConfig | null) => void;
  setBossModeUnlocked: (b: boolean) => void;
  setBossModeEnabled: (b: boolean) => void;
  setBossTimeRemaining: (v: number) => void;
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  // Boss-perk lifecycle.
  grantBossPerk: () => void;
  decayBossPerk: () => void;
  clearBossPerk: () => void;
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
  // `opts.perkStages`: boss perk carried by the save being resumed
  // (Save.perkStages); omitted / invalid -> 0 (fresh perk state).
  startRun: (opts?: { perkStages?: number }) => void;
};

let toastSeq = 0;

export const useStore = create<Store>((set) => ({
  runState: 'idle',
  hearts: 3,
  detection: {},
  stamina: 1,
  alarmLevel: 0,
  segmentSeed: 1,
  stage: 1,
  stance: 'walk',
  running: false,
  paused: false,
  restartCounter: 0,
  weather: 'clear',
  segmentWeatherEnabled: true,
  weatherEnabled: true,
  hapticsEnabled: true,
  showTutorial: false,
  howToPlay: null,
  aboutOpen: false,
  updatePhase: 'idle',
  menuIdle: false,
  tutorialSeen: false,
  gameModal: null,
  bossModeUnlocked: false,
  bossModeEnabled: false,
  bossTimeRemaining: 0,
  masterVolume: 0.7,
  musicVolume: 0.5,
  perkRemainingStages: 0,
  playerSkin: 'beige',
  playerName: '',
  saves: Object.create(null) as SavesMap,
  activeSaveName: null,
  pendingStartMode: null,
  lastStats: null,
  lastDeathCause: null,
  catchCounter: 0,
  bestStars: {},
  inventory: { ...EMPTY_INVENTORY },
  crowbarInRange: false,
  gameMode: 'campaign',
  dailyDay: null,
  distanceM: 0,
  endlessLevel: 1,
  runSummary: null,
  playerOutfit: 'classic',
  setGameMode: (m, day = null) => set({ gameMode: m, dailyDay: m === 'daily' ? day : null }),
  setDistance: (m, level) =>
    set((st) => {
      const d = Math.floor(m);
      return st.distanceM === d && st.endlessLevel === level ? st : { distanceM: d, endlessLevel: level };
    }),
  setRunSummary: (r) => set({ runSummary: r }),
  setPlayerOutfit: (o) => set((st) => (st.playerOutfit === o ? st : { playerOutfit: o })),
  dangerLevel: 0,
  setDangerLevel: (v) =>
    set((st) => {
      const q = Math.round(Math.max(0, Math.min(1, v)) * 25) / 25;
      return st.dangerLevel === q ? st : { dangerLevel: q };
    }),
  toast: null,
  setCrowbarInRange: (b) =>
    set((st) => (st.crowbarInRange === b ? st : { crowbarInRange: b })),
  // Ids never repeat (the previous "last id + 1" restarted at 1 after a
  // toast cleared), so a toast can be tracked by id.
  showToast: (text, tone = 'info') => set({ toast: { id: ++toastSeq, text, tone } }),
  clearToast: () => set((st) => (st.toast === null ? st : { toast: null })),
  setRunState: (s) => set({ runState: s }),
  setHearts: (n) => set({ hearts: n }),
  setDetection: (id, v) =>
    set((st) => {
      const cur = st.detection[id];
      if (cur === v) return st;
      return { detection: { ...st.detection, [id]: v } };
    }),
  setDetections: (values) =>
    set((st) => {
      let changed = false;
      for (const [id, v] of values) {
        if (st.detection[id] !== v) {
          changed = true;
          break;
        }
      }
      if (!changed) return st;
      const next: Record<number, number> = { ...st.detection };
      for (const [id, v] of values) next[id] = v;
      return { detection: next };
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
  setRunning: (b) =>
    set((st) => (st.running === b ? st : { running: b })),
  setStage: (n) =>
    set((st) => (st.stage === n ? st : { stage: n })),
  setPaused: (b) => set((st) => (st.paused === b ? st : { paused: b })),
  setLastStats: (s) => set({ lastStats: s }),
  setLastDeathCause: (c) =>
    set((st) => (st.lastDeathCause === c ? st : { lastDeathCause: c })),
  bumpCatchCounter: () =>
    set((st) => ({ catchCounter: st.catchCounter + 1 })),
  setWeather: (w) => set((st) => (st.weather === w ? st : { weather: w })),
  setSegmentWeatherEnabled: (v) => set((st) => (st.segmentWeatherEnabled === v ? st : { segmentWeatherEnabled: v })),
  setHapticsEnabled: (b) =>
    set((st) => (st.hapticsEnabled === b ? st : { hapticsEnabled: b })),
  setWeatherEnabled: (b) =>
    set((st) => (st.weatherEnabled === b ? st : { weatherEnabled: b })),
  setTutorialSeen: (b) => set({ tutorialSeen: b }),
  setShowTutorial: (b) =>
    set((st) => (st.showTutorial === b ? st : { showTutorial: b })),
  setHowToPlay: (v) => set((st) => (st.howToPlay === v ? st : { howToPlay: v })),
  setAboutOpen: (b) => set((st) => (st.aboutOpen === b ? st : { aboutOpen: b })),
  setUpdatePhase: (p) => set((st) => (st.updatePhase === p ? st : { updatePhase: p })),
  setMenuIdle: (b) => set((st) => (st.menuIdle === b ? st : { menuIdle: b })),
  setGameModal: (m) => set({ gameModal: m }),
  setBossModeUnlocked: (b) =>
    set((st) => (st.bossModeUnlocked === b ? st : { bossModeUnlocked: b })),
  setBossModeEnabled: (b) =>
    set((st) => (st.bossModeEnabled === b ? st : { bossModeEnabled: b })),
  setBossTimeRemaining: (v) =>
    set((st) => (st.bossTimeRemaining === v ? st : { bossTimeRemaining: v })),
  // Volume setters: endpoints snap (<= 0.01 -> 0, >= 0.99 -> 1) and
  // always land, so the 0.005 change dead-band can never leave the
  // game faintly audible at "0" (audio review E-4).
  setMasterVolume: (v) =>
    set((st) => {
      const snapped = snapVolume(v);
      return volumeUnchanged(st.masterVolume, snapped) ? st : { masterVolume: snapped };
    }),
  setMusicVolume: (v) =>
    set((st) => {
      const snapped = snapVolume(v);
      return volumeUnchanged(st.musicVolume, snapped) ? st : { musicVolume: snapped };
    }),
  // Beating a boss tops up the perk counter; subsequent boss wins
  // refresh / extend it instead of stacking - one heart of buffer is
  // enough generosity for a steady streak of clears.
  grantBossPerk: () => set({ perkRemainingStages: 10 }),
  decayBossPerk: () =>
    set((st) =>
      st.perkRemainingStages > 0
        ? { perkRemainingStages: st.perkRemainingStages - 1 }
        : st,
    ),
  clearBossPerk: () =>
    set((st) => (st.perkRemainingStages === 0 ? st : { perkRemainingStages: 0 })),
  setPlayerSkin: (s) =>
    set((st) => (st.playerSkin === s ? st : { playerSkin: s })),
  setPlayerName: (n) =>
    set((st) => (st.playerName === n ? st : { playerName: n })),
  setSaves: (m) => set({ saves: m }),
  // --- save-map plumbing (own-property safe; see storage.hasOwn) ---
  // Maps are built with a null prototype so a lookup like
  // saves['constructor'] can't hit Object.prototype.
  upsertSave: (save) =>
    set((st) => ({
      saves: Object.assign(Object.create(null) as SavesMap, st.saves, {
        [save.name.trim().toLowerCase()]: save,
      }),
    })),
  removeSave: (key) =>
    set((st) => {
      if (!Object.prototype.hasOwnProperty.call(st.saves, key)) return st;
      const next: SavesMap = Object.create(null);
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
      st.inventory.smokebomb === inv.smokebomb &&
      st.inventory.rock === inv.rock
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
      // Guard ids are reused when the world is rebuilt; stale meters
      // would keep the alarm edge lit and seed the new guards.
      detection: {},
      alarmLevel: 0,
      lastStats: null,
      lastDeathCause: null,
      // A restart is a fresh attempt: the world respawns its pickups,
      // so the bag starts empty (otherwise items farm across restarts).
      inventory: { ...EMPTY_INVENTORY },
    })),
  resetForSegment: (seed) =>
    set({
      runState: 'playing',
      detection: {},
      stamina: 1,
      alarmLevel: 0,
      segmentSeed: seed,
      stance: 'walk',
      running: false,
      paused: false,
      lastStats: null,
      lastDeathCause: null,
      inventory: { ...EMPTY_INVENTORY },
      distanceM: 0,
      endlessLevel: 1,
      runSummary: null,
    }),
  startRun: (opts) =>
    set((st) => ({
      runState: 'playing',
      // --- boss-perk persistence ---
      // A campaign continue resumes the perk stored on the save
      // (Save.perkStages); anything else starts without one. The
      // value is checked because startRun is also wired to handlers
      // that may pass an event object.
      perkRemainingStages:
        opts && typeof opts.perkStages === 'number' && Number.isFinite(opts.perkStages)
          ? Math.max(0, Math.floor(opts.perkStages))
          : 0,
      hearts: startingHeartsFor(st.stage),
      detection: {},
      stamina: 1,
      alarmLevel: 0,
      stance: 'walk',
      running: false,
      paused: false,
      lastStats: null,
      lastDeathCause: null,
      inventory: { ...EMPTY_INVENTORY },
      distanceM: 0,
      endlessLevel: 1,
      runSummary: null,
    })),
}));

// Level the difficulty rules use: the campaign stage, or in Endless /
// Daily the distance-driven level. HUD pieces that depend on the rules
// (hearts, stamina, camera alarm) must read this, not `stage`, which in
// Endless / Daily still holds the player's campaign progress.
export const selectRuleLevel = (s: { gameMode: GameMode; stage: number; endlessLevel: number }): number =>
  s.gameMode === 'campaign' ? s.stage : s.endlessLevel;

> Read-only analysis at commit 02e13eb (OTA 131). Nothing here is implemented. Re-verify line references against the current code before acting; balance numbers predate several gameplay fixes.

# F: Game.tsx decomposition plan (read-only review of HEAD 02e13eb, OTA 131)

All file:line references are `src/game/Game.tsx` unless another file is named. Nothing in the repo was changed to produce this.

## 0. Ground truth about the file (so the plan is not guessed)

- 2,513 lines. `Game()` is 225-2509. `onContextCreate` is 235-2481 (about 2,250 lines, not 2,100). `update` is 1420-2237 (818 lines). `render` is 2243-2426. Everything between 235 and 2481 is one closure.
- 17 commits touched the file since 2026-09-01 (`git log --since=2026-09-01 -- src/game/Game.tsx`). It is the collision point the task describes.
- **No test imports Game.tsx.** `grep -n "Game.tsx\|game/Game" tests/*.ts` is empty. The only `src/game` modules under test are `Loop` (tests/loop.test.ts) and `runRules` (tests/pack6-gameplay.test.ts). All closure logic (catch, win, restart, perk, endless streaming, tips, detection pass) is covered only by the browser scenarios in the scratchpad, which are not in the repo.
- The browser scenarios work because `$SP/web/build.sh` text-patches Game.tsx: it looks for the exact line `    loopRef.current = startLoop({` and inserts `globalThis.__ee = { input, useStore, player, THREE, get scene(), handleCatch, handleWin, noiseRing, crowbarMarker, projectiles, update, render, get renderer() }` before it. **That anchor and those 13 names are an undocumented contract.** Any extraction that moves `handleCatch`, `handleWin`, `scene`, `update` or `render` out of the closure, or changes the anchor line, silently breaks every scenario (pack2, pack5, review, review2/B/e*.mjs, webC2/*). Step E0 below replaces the text patch with a real debug handle.
- `restartedNow` (named in the brief) does not exist. The restart-related flag is `rebuiltNow` (1437, 1444, 1483, 1504). `perkChargedStage` is 1128, `prevAnyChase` is 292.
- Pure modules that already exist and are the model to copy: `src/game/runRules.ts` (moodStageFor, clearsCombatState, weatherRules), `src/util/runStats.ts` (RunTracker), `src/util/bossClock.ts`, `src/util/economy.ts` (applyRunResult), `src/util/scoring.ts`, `src/util/stageTips.ts`, `src/util/musicIntensity.ts`.

### Frame order of `update` (this is the invariant that makes the file hard to split)

Numbers are used in the traps below.

| # | Lines | Step | Early return |
|---|---|---|---|
| 0 | 1421-1423 | `prevPX/prevPZ = player`; take store snapshot `st` | |
| 1 | 1437-1520 | transition block: rebuild (seed/stage/mode change, not while `cleared`), skin change, restart, fresh-start from idle; `lastRunState` cursor | |
| 2 | 1522-1547 | boss-intro modal (`bossIntroPending`) | |
| 3 | 1549-1602 | not playing or paused: clear combat if `clearsCombatState`, zero cues, calm music mix, siren 0, idle splash demo | return |
| 4 | 1606-1615 | hit-stop: count down `hitStopRemaining`, fire `pendingCatch` | return |
| 5 | 1617-1630 | `tracker.tickTime`, `tickTips`, fork tip, `animTime`, `stageNow`, shake decay | |
| 6 | 1636-1653 | slow-mo `timeScale` -> `effDt` | |
| 7 | 1655-1669 | backdrop + weather update; Endless: `streamEndless`, `maxZ`, `setDistance`, level tips | |
| 8 | 1672-1686 | low-wall tip (0.25 s throttle) | |
| 9 | 1687-1700 | `updatePlayer`, Endless backtrack clamp, `nearCover`, mirror stance/stamina/running to store | |
| 10 | 1705-1709 | razor wire -> `handleCatch()` | return |
| 11 | 1716-1749 | pickup grab + fading sparkles | |
| 12 | 1754-1814 | crowbar, facing, rock throw + landing callback (sets `nextDetectionFloor`), smoke bomb | |
| 13 | 1819-1863 | smoke clouds -> `smokeRegions`, swing arcs, footprints | |
| 14 | 1865-1884 | light towers -> `lit`, `searchlightBump` | |
| 15 | 1895-1926 | `effectiveVisionRange`, `litAdd`, `tuning`, `aiTier` | |
| 16 | 1931-1961 | camera alarm, alarm rising edge, reinforcement, `alarmHot` | |
| 17 | 1971-2039 | `updateDogs` (once, first), pass 1 detection per guard, `senses` | |
| 18 | 2041-2042 | `st.setDetections`, `nextDetectionFloor.clear()` | |
| 19 | 2047-2093 | pass 2 guard AI (tier-3 broadcast, `updateGuard`, fire callback, aim click) | |
| 20 | 2096-2158 | `isHidden`, noise ring values, crowbar target, guard markers | |
| 21 | 2165-2171 | dog transforms + `dogHits` -> `handleCatch()` | return |
| 22 | 2174-2189 | tracker detection, `setDangerLevel`, `anyChase` sting, music mix, siren | |
| 23 | 2191-2211 | `procgen.update`; boss clock -> `handleWin()`; campaign win line -> `handleWin()` | return on win |
| 24 | 2213-2216 | `projectiles.update` -> `handleCatch('killed')` | return |
| 25 | 2225-2236 | guard body contact -> `handleCatch()` | |

Pinned orderings (verified by B.md "What is solid"): the win check (23) comes before bullets (24) and contact (25); `updateDogs` (17) runs before the per-guard loop because it fills `dogSmellByHandler`; pass 1 (17) before pass 2 (19) because `chaserGuard` is computed in pass 1; `nextDetectionFloor` is written in steps 12 and 16 and consumed by pass 1, then cleared at 18 before pass 2.

## 1. Inventory of closure state

Lifetimes: **ctx** = per GL context (lives until `onContextCreate` runs again or unmount, i.e. until `disposeRef` at 2473), **scene** = replaced by `buildScene`, **run** = reset by `resetSegment` (1023), **frame** = scratch cleared every frame, **const** = never reassigned (a constant or a pooled object).

Module column: S1 = scene factory, S2 = endless streamer, R = run lifecycle, T = tip scheduler, A = audio director, E = transient effects bundle, V = render frame, D = detection frame, X = stay in Game.tsx (orchestrator), P = pure rule (no state).

### 1a. Mount-once entities (240-334)

| Name (line) | Life | Writers | Readers | Module |
|---|---|---|---|---|
| `r` renderer bundle (240) | ctx | createRenderer | everywhere (tearDown 830, render 2402, effects add) | X (passed in ctx) |
| `player` (248) | ctx | `updatePlayer` (1688), `resetSegment` (1043-1051), `resolveCatch` (1240-1247), demo wrap (1593), backtrack clamp (1693), `__ee` tests | update, render, everything | X (shared object) |
| `prevPX/prevPZ` (252-253) | ctx | top of `update` (1421) | render (2247-2249) | V (read), X (write) |
| `TELEPORT_DIST` (256), `playerView` (257) | const | render (2389) | render | V |
| `playerSkin/playerOutfit/playerFigure` (258-260) | ctx | update skin block (1461-1468) | render pose (2269-2278) | V (figure), X (swap) |
| `playerShadow` (263) | const | render | render | V |
| `backdrop` (266) | ctx | rebuildScene (849-853, mood), update (1598, 1655), render (2383-2385) | | S1/V |
| `radialMeter` (269), `noiseRing` (274), `crowbarMarker` (276) | const | render | render | V |
| `dust`, `bursts`, `rocks` (279-283) | const pools | update (spawnBurst 1729, launchRock 1785, updateRocks 1793), render (2344-2359), resetSegment (`clearRocks` 1024, `clearDustField` 1031) | | E |
| `facingX/facingZ` (285-286) | ctx | update (1778-1779) | rock throw target (1784) | E (throw) |
| `noiseRadiusNow`, `noiseLoudness`, `crowbarTarget` (288-290) | ctx, written each frame | update (2099-2122), paused branch zeroes (1556-1557) | render (2360-2361) | V via `SimView` |
| `prevAnyChase` (292) | ctx | update 2183, paused branch 1558 | update 2182 | A |
| `senseOut`, `guardSenses`, `nextDetection`, `nextDetectionFloor` (294-298) | frame/ctx scratch | pass 1 (1965-2042), rock cb (1802), `summonReinforcement` (940) | pass 1/2 | D |
| `siren`, `sfx`, `music`, `musicIntensity`, `unsubVolume` (300-315) | ctx | update (1560-1564, 2184-2189), volume subscription (313), dispose (2473-2480) | `playSfx` call sites (about 20) | A |
| `projectiles` (316) | ctx | spawn in guard fire cb (2080); `clear` at 1553, 1080, 1178, 1417; `update` 2213 | | X (or D hook) |
| `smokeClouds`, `smokeRegions` (322-323) | ctx / frame | update 1805-1830, resetSegment 1084, resolveCatch 1277 | detection (1871, 1974, 2010, 2142) | E (+ read by D) |
| `swingArcs` (329) | ctx | 1765, 1835, resets 1100, 1291 | | E |
| `footprintField` (334) | ctx | 1849-1863, `disposeFootprintField` 1108, 1299 | | E |

### 1b. Types and constants (336-414)

`GuardEntry` (336), `Section` (359), `Scene` (361-410), `BEAM_BASE_RANGE` (414). These must become `src/game/sceneTypes.ts` (types only) before any other split, because every candidate module takes a `Scene`.

### 1c. Scene/run state declared after the first scene (802-1309)

| Name (line) | Life | Writers | Readers | Module |
|---|---|---|---|---|
| `renderAuditIn`, `renderAuditRetries` (803-804) | ctx | rebuildScene 846, skin swap 1466, render 2409-2420 | render | V |
| `scene` (805, `let`) | scene | init 805, `rebuildScene` 848 | everything. Closure functions at 599-795 read the *variable*, not a parameter (`streamEndless` 768 uses `scene` and `player` from the closure) | X (owner), passed explicitly to S2/D/V |
| `lighting` (817, `let`) | scene | 817, 850 | detection range (1904) | S1 |
| `tracker` (859) | run | `resetSegment` 1035; `tickTime` 1617, `tickDetection` 2174, `onCatch` 1168 | `snapshot` at 1229, 1345, 1353 | R |
| `alarmLevel` (861) | run | update 1941, `resetSegment` 1056, `resolveCatch` 1250 | `updateCameraAlarm` 1933, 1940 | D (camera alarm step) |
| `dogSmellByHandler` (863) | frame | `updateDogs` 1971 | pass 1 1990 | D |
| `lastSegmentSeed/lastStage/lastMode/lastRestartCounter/lastRunState` (864-872) | ctx | transition block 1445-1447, 1470, 1520 | 1440-1442, 1492-1508 | transition planner (P) + X |
| `animTime` (873) | run | `resetSegment` 1042, update 1575/1622 | render (poses, pickups, win line) | V (read), X (write) |
| `bossClock` (878) | run | `resetSegment` 1040, tick 2199 | | R |
| `tmpVec` (880) | const | fire cb 2067, render 2330 | | D and V each own one |
| `SHAKE_DURATION`, `shakeRemaining` (886-887) | ctx | `handleCatch` 1179, decay 1608, 1628-1630 | render 2396-2401, `isStatic` 2439 | R (write), V (read) |
| `demoTime` (892) | ctx | 1574 | 1579 | X (idle branch) |
| `fadingPickups` (901) | ctx | 1724, 1739-1749, resets 1093, 1284 | | E |
| `MAX_REINFORCEMENTS` (914) + `summonReinforcement`, `removeReinforcements` (904-943) | scene | alarm edge 1950 | | S1 (reinforcements live on `scene.root`) |
| tips: `tipQueue`, `tipCooldown`, `stageTipDelay`, `tipLevel`, `lowWallCheck`, `sessionSeen`, `showingTip`, `offered` (948-974) | run (`sessionSeen` is ctx) | `resetSegment` 1026-1030, `tickTips` 990, `queueTip` 967, `offerTip` 975, `grantStartingHearts` 1145, pickup 1728, aimed 2090, fork 1620, level 1665-1667, low wall 1672-1685 | | T |
| `bossIntroPending` (1127) | run | 1456, 1523 | 1522 | R |
| `perkChargedStage`, `perkBonusThisStage` (1128-1129) | run | `grantStartingHearts` 1140-1142, `resolveCatch` 1217-1218, fresh start 1496-1497 | 1140, 1148 | R |
| `hitStopRemaining`, `pendingCatch` (1156-1157) | run | `handleCatch` 1181-1182, 1606-1612, `resetSegment` 1033-1034 | 1162, 1606 | R |
| `runId` (1309, `let`) | run | `resetSegment` 1025 | `payRun` callers 1329, 1357 | R |

Note: `resetSegment` (1023) writes `runId`, which is declared 286 lines later (1309). It works because `resetSegment` is only called from `update`. Any extraction that calls `resetSegment` during initialisation hits the temporal dead zone. Same for `bossClock.arm(scene...)` at 879, which needs `scene` assigned at 805.

### 1d. Render/loop state (2240-2431)

`lastRenderMs` (2242): ctx, written/read only in `render`. `lastFrameErrorAt` (2431): ctx, only in `onError`. Both are trivially movable.

### 1e. Hidden shared-state contracts (not variables, but they will bite)

1. **`const st = useStore.getState()` at 1423 is a snapshot used for the whole frame.** Writes made during the frame (`st.setDetections`, `consumePickup`, `setStance`) do not update `st`. Several reads rely on that: pass 1 reads `st.detection[g.id]` (1978) which is the *previous* frame's value (the comment at 937-939 says so); `st.inventory.crowbar` at 2104 is read after `consumePickup` at 1756, so the crowbar ring lags one frame; `st.bossTimeRemaining` at 2201. An extracted function that re-reads `useStore.getState()` returns the fresh value and changes behaviour by one frame. Pass `st` in explicitly and keep it.
2. **Guard ids restart at 1 in every `Scene` (`nextGuardId: 1`, 737).** The store keeps `detection` keyed by guard id. `requestRestart`, `resetForSegment` and `startRun` (store.ts 481, 492, 519) clear `detection` for exactly this reason. The first frame of a rebuilt scene reads the pre-reset `st.detection` snapshot; it is safe today because every rebuild path also sets store state that makes the same frame return early (paused or non-playing snapshot) or the store zeroed the map before the frame. Do not change id assignment or the order "store reset, then `update` sees it".
3. **The store subscription order.** `useStore.subscribe` at 313 (music volume) is the only subscription in Game.tsx. HUD components subscribe via hooks. `startSettingsAutosave` is elsewhere (App-level). Moving the subscription into an audio director must keep it unsubscribed in `disposeRef` (2476).
4. **`disposeRef` (230-233, 2473-2480) disposes only loop, subscription, music, sfx, siren.** It does not call `tearDownScene(scene)`, `r.renderer.dispose()` or `disposeSubtree(r.worldRoot)`. That is acceptable today (the native GL context is destroyed by expo-gl) but it matters for render-scale re-creation (see G-performance.md (a)). When the closure is split, give every module a `dispose()` and call them in one place so this gap is visible and fixable.
5. **Soft-reset logic exists twice.** The guard/dog reset at 1058-1077 is repeated at 1253-1273, and the effects clear (smoke, sparkles, arcs, footprints) at 1084-1108 is repeated at 1277-1299. They have already drifted: `resolveCatch` does not clear `rocks`, `dust` or `tracker`, and `resetSegment` also zeroes input. A single `resetGuardsAndDogs` and `clearTransientEffects` removes the drift risk (step E4).

## 2. Proposed modules

Principle: extract only what (a) is pure and can be tested without GL, or (b) has a clear owner that parallel workers will edit independently (render path vs sim vs audio vs run lifecycle). Everything that shares the frame-order invariants stays in one orchestrator.

### 2a. `src/game/sceneTypes.ts` (types only)
`GuardEntry`, `Section`, `Scene` (from 336-410), `BEAM_BASE_RANGE`. No logic. Required by all later steps.

### 2b. Pure rules, no closure state (extend `src/game/runRules.ts`, add `src/game/endlessRules.ts`)

```ts
// grantStartingHearts (1130-1149): the perk-charge decision only
export function perkCharge(a: { stage: number; chargedStage: number; perkRemainingStages: number; prevBonus: number }):
  { chargedStage: number; bonus: number; decay: boolean };
export function heartsForStage(mode: GameMode, stage: number, bonus: number): number;      // startingHeartsFor(1) in endless

// resolveCatch branch (1197-1233)
export type CatchOutcome = 'soft-respawn' | 'boss-retry' | 'endless-end' | 'campaign-death';
export function catchOutcome(remaining: number, scene: { isBossArena: boolean; endless: boolean }): CatchOutcome;

// handleWin save update (1386-1408): pure Save -> Save
export function winSaveUpdate(existing: Save, clearedStage: number, stars: number, perkRemainingStages: number, now: number): Save;

// endless math (597-599, 770-790, 1188-1195)
export const ENDLESS_SECTION_LEN: number;           // CHUNKS_AHEAD * CHUNK_LEN
export function levelAtZ(z: number): number;
export function sectionsToBuild(nextSection: number, playerZ: number): number[];       // indices k with k*LEN < playerZ + 2*LEN
export function shouldDropSection(behind: number, busy: boolean): boolean;               // behind > 45 && (behind > 160 || !busy)
export function backtrackFloor(startZ: number, maxZ: number): number;                    // Math.max(startZ + 2, maxZ - 30)
export function respawnZ(a: { startZ: number; maxZ: number; playerZ: number }): number;  // 1191

// per-frame detection inputs (1895-1926). Also needed by the offline bot harness (H file).
export function computeFrameTuning(a: {
  stageNow: number; scene: Pick<Scene, 'endless'|'baseVisionRange'|'rulesVision'|'rulesNoise'|'isBossArena'>;
  lit: boolean; playerCrouched: boolean; visionMul: number; effDt: number; alarmHot: boolean;
}, out: FrameTuning): FrameTuning;   // fills a reused object; no per-frame allocation
```

Why first: no state, pure arithmetic on existing helpers (`progression.ts`), can be unit-tested with the same style as `tests/pack6-gameplay.test.ts`. Each is a literal copy of existing lines.

### 2c. `src/game/transitions.ts`: the 1437-1520 state machine as a pure planner

```ts
export type Cursors = { seed: number; stage: number; mode: GameMode; restart: number; runState: RunState };
export type TransitionPlan = {
  rebuild: boolean;               // call rebuildScene + resetSegment
  grantEndlessHearts: boolean;
  bossIntroPending: boolean | null;     // null = leave unchanged
  restart: boolean;               // grantStartingHearts, setLastStats(null), setRunState('playing'), reset
  resetPerkBookkeeping: boolean;  // fresh run from 'idle'
  grantCampaignHearts: boolean;
  nextCursors: Cursors;
};
export function planTransitions(cursors: Cursors, st: Pick<StoreState,'runState'|'segmentSeed'|'stage'|'gameMode'|'restartCounter'>): TransitionPlan;
```

The 83 lines carry the most subtle rule in the file: `rebuiltNow` suppresses a second rebuild when a restart or fresh start lands on the same frame as a seed change, and nothing rebuilds while `runState === 'cleared'` (1438-1441, "handleWin already advanced the stage"). Making it a table-driven pure function is the cheapest way to pin it with tests (pack5 "Campaign clear pays coins once", review P2 "same-day Daily restart is a fresh run").

### 2d. `src/game/TipScheduler.ts` (class, injected deps)

```ts
export class TipScheduler {
  constructor(deps: {
    seenInSave: () => readonly string[];                 // save.tipsSeen
    markSeen: (id: TipId) => void;                       // persists (upsertSave + writeSaves) - stays in Game
    showToast: (text: string) => number | null;          // returns toast id
    currentToastId: () => number | null;
  });
  reset(): void;                 // resetSegment 1026-1030 (stageTipDelay = 1.2)
  queue(id: TipId | null): void; // 967
  offer(id: TipId): void;        // 975, once per segment
  tick(dt: number, ctx: { endless: boolean; mode: GameMode; stage: number }): void;   // 990-1021
  levelUp(level: number): void;  // 1665-1667
  nearFork(): void;              // 1620
}
```

Moves 948-1021 plus the throttle `lowWallCheck` logic (1672-1686). Today the toast-id handshake (`showingTip.toastId` vs `store.toast.id`) is untested; with injected deps it can be tested with a fake clock (the 2 s read rule, the 5.4 s cooldown, re-queue on replaced toast). `queueTip(contextTip('perk'))` inside `grantStartingHearts` (1145) becomes `tips.queue(...)`, which is the only cross-module call from the run lifecycle.

### 2e. `src/game/detectionFrame.ts` (steps 14-20: lights to markers)

```ts
export type FrameInput = {
  st: StoreSnapshot; effDt: number; stageNow: number; lit: boolean; searchlightBump: number;
  player: Player; smokeRegions: readonly SmokeRegion[]; alarmHot: boolean; tuning: FrameTuning;
  prevDetection: Readonly<Record<number, number>>;        // st.detection (stale on purpose)
};
export type FrameResult = { maxDetection: number; anyVisual: boolean; chaserGuard: Guard | null };
// pass 1 (1963-2039). Pure given `scene`; writes entry.range, scratch maps, and returns the aggregate.
export function runDetectionPass(scene: Scene, f: FrameInput, scratch: DetectionScratch): FrameResult;
// pass 2 (2043-2093). Side effects go through hooks so the function stays testable.
export function runGuardAi(scene: Scene, f: FrameInput, r: FrameResult, scratch: DetectionScratch,
  hooks: { onFire(g: Guard, tx: number, tz: number): void; onAimStart(g: Guard): void }): void;
```

Everything inside is already using exported pure helpers (`updateDetection`, `externalFeedFor`, `updateGuard`, `hearNoiseAt`). This is the module the bot harness in H-balance-evidence.md needs so that bots run the real per-frame logic instead of a copy. Keep `updateDogs` (1971) as the first statement of the caller (see traps).

### 2f. `src/game/Effects.ts` (transient effect bundle)

Owns `smokeClouds`, `smokeRegions`, `swingArcs`, `footprintField`, `fadingPickups`, `rocks`, `dust`, `bursts`. API: `clearAll()` (the duplicated 1084-1108 / 1277-1299 blocks plus `clearRocks`, `clearDustField`), `useSmoke(player)`, `useCrowbar(...)`, `throwRock(...)`, `tick(effDt, player, weatherKind)`, `regions()`. `useCrowbar`/rock/smoke handlers also call `sfx`/`haptics` today; pass those as hooks. This is a real reliability win only for `clearAll()` and `regions()`; do not split the three item handlers into three files (see section 6).

### 2g. `src/game/AudioDirector.ts`

Owns `sfx`, `music`, `musicIntensity`, `siren`, `prevAnyChase`, the volume subscription, `playSfx` calls guarded by master volume, and `dispose()`.

```ts
export function createAudioDirector(store: typeof useStore): {
  frame(a: { maxDetection: number; anyChase: boolean; dt: number; paused: boolean }): void;  // 1559-1564 and 2177-2189 unified
  play(name: SfxName, vol?: number): void;      // playSfx(sfx, name, masterVolume, vol)
  dispose(): void;                              // 2473-2480
};
```

Traps: the paused branch (1560-1564) uses `musicIntensity.update(0, false, dt)` and `updateSiren(siren, 0, ...)`; the playing branch uses real values; the two early-return catch frames (steps 10 and 21) skip the audio update and hold the last mix. Keep that.

### 2h. `src/game/SceneFactory.ts` and `src/game/EndlessStreamer.ts`

`SceneFactory` = `makeGuardEntry` (417), `populateSection` (459), `buildScene` (601), `tearDownScene` (828), `summonReinforcement`/`removeReinforcements` (904-943), `dropGuardAt` (547), `removeSection` (575), `sectionBusy` (565). It takes `r`, and returns `Scene`. Note `buildScene` writes the store (`setWeather`, `setSegmentWeatherEnabled`, 641-642); keep that behind an injected `onWeatherChosen` callback so the factory can be tested without the store.

`EndlessStreamer` = `streamEndless` (767-795) as `stream(scene, playerZ)` using the pure rules from 2b. This is where the frame-spreading in G-performance.md (c) will be implemented, so it must exist as its own file before that work starts.

### 2i. `src/game/RunLifecycle.ts`

`handleCatch`, `resolveCatch`, `respawnPoint`, `handleWin`, `finishEndlessRun`, `payRun`, `grantStartingHearts`, `resetSegment`, `runId`, `perkChargedStage`, `perkBonusThisStage`, `bossIntroPending`, `hitStopRemaining`, `pendingCatch`, `tracker`, `bossClock`, `shakeRemaining`. Takes a `GameContext`:

```ts
type GameContext = {
  r: GameRenderer; player: Player; getScene(): Scene; st(): StoreSnapshot;
  effects: Effects; audio: AudioDirector; tips: TipScheduler; projectiles: ProjectileSystem;
  guards: { resetGuardsAndDogs(scene: Scene, spawn: {x:number;z:number}): void };
  haptics: typeof haptics;
};
export function createRunLifecycle(ctx: GameContext): {
  handleCatch(cause?: 'arrested'|'killed', source?: 'guard'|'dog'|'wire'|'bullet'): void;
  handleWin(): void; resetSegment(): void; grantStartingHearts(stage: number): void;
  tickHitStop(dt: number): boolean;        // true => frame consumed
  tracker: RunTracker; bossClock: BossClock; shake: { remaining: number; readonly DURATION: number };
};
```
The optional `source` parameter is not behaviour (it only feeds the debug log); it unlocks the death-cause evidence in H-balance-evidence.md.

### 2j. `src/game/renderFrame.ts` (the render path as one owner)

`render` (2243-2426) becomes `renderFrame(view: SimView, alpha: number)` where `SimView` is a plain object written once per sim step by `update` and read-only for render: `{ player, prevPX, prevPZ, scene, animTime, noiseRadiusNow, noiseLoudness, crowbarTarget, shakeRemaining }`. Render writes only mesh transforms, `lastRenderMs`, `renderAuditIn`. This separation is the reason it is worth doing: all items in G-performance.md (interpolation of guards/dogs, culling of section roots, render-scale, perf overlay, depth near plane, matrix freezing) live in the render path and can then be owned by one worker while another owns `update`/sim.

### 2k. `src/game/GameHud.tsx`

The JSX overlay list at 2486-2506 (21 components) moved to a component. Tiny, but it removes the only place in Game.tsx that the HUD workers (overlay merge in G(g), render-scale GLView wrapper in G(a)) would otherwise edit.

### 2l. What stays in `Game.tsx` after all of the above (target 450-600 lines)

The orchestrator: `Game()` component, `onContextCreate`: create `r`, `player`, `backdrop` and the other mount-once objects; construct the modules above with a shared context; the transition block executor; the `update` sequence 5-25 calling into the modules in the pinned order; `startLoop` wiring and `disposeRef`.

### Dependency graph (arrows = "imports / is passed")

```
sceneTypes <- everything
runRules/endlessRules/transitions (pure) <- RunLifecycle, EndlessStreamer, Game
TipScheduler <- RunLifecycle (perk tip), Game (tick, fork, level, pickup, aimed)
Effects <- RunLifecycle (clearAll), Game (item handlers, tick), detectionFrame (regions)
AudioDirector <- RunLifecycle (hurt/caught/stage_clear), detectionFrame hooks (gunshot, aim_click), Game (frame)
SceneFactory <- Game (build/rebuild), EndlessStreamer, detectionFrame (reinforcement via alarm step)
detectionFrame <- Game
RunLifecycle <- Game (needs Effects, Audio, Tips, SceneFactory.reset)
renderFrame <- Game (reads SimView)
Game (orchestrator) owns player, scene, st snapshot, lastRunState cursors, demo branch
```
No module imports `Game.tsx`. No cycles: `RunLifecycle` depends on `Effects`/`Audio`/`Tips`, never the reverse.

### What MUST stay together

1. **Steps 14-20 (lights, tuning, camera alarm, `updateDogs`, pass 1, `setDetections`, floor clear, pass 2, markers)** in one module and one call order (`detectionFrame`). They share `lit`, `searchlightBump`, `smokeRegions`, `alarmLevel`, `nextDetectionFloor`, `dogSmellByHandler`, `chaserGuard`, `anyVisual`, `maxDetection`. Splitting pass 1 from pass 2 across files is acceptable only because both take the same `scratch` and the caller keeps the order.
2. **The orchestration order 5-25 stays in one function** (the `update` that remains in Game.tsx). Do not turn it into an event bus or per-feature systems with their own tick order: the early returns at 10, 21, 23, 24 are order-dependent ("a catch in step 10 skips the audio update at 22").
3. **`handleCatch` + `pendingCatch` + `hitStopRemaining` + `shakeRemaining` + `resolveCatch`** together, because the hit-stop counter and the deferred resolve closure form one state machine (1159-1183, 1606-1615).
4. **`grantStartingHearts` + `perkChargedStage` + `perkBonusThisStage`** with `resetSegment`/`resolveCatch`, because `resolveCatch` (1217-1218) and the fresh-start block (1496-1497) reset the same pair.
5. **`rebuildScene` + `resetSegment` + `lastSegmentSeed/...` cursors**: always called as a pair in that order (848 then 1023). The deferral in G(d) must keep that pairing.
6. **`render` reading `prevPX/prevPZ` and `alpha`** with the `jump` teleport test: any code that teleports the player (`resetSegment`, `resolveCatch`, demo wrap) relies on `TELEPORT_DIST` (256, 2247) to avoid a streak. Keep the constant next to the render function and add a test.

## 3. Extraction order (risk/benefit ranked)

Every step: one PR, moves code verbatim, no behaviour change, lands only when the gate passes. Gate = (G1) `npm run typecheck`, (G2) `npm test` (about 20 s), (G3) the golden trace (defined in E0) is bit-identical, (G4) the listed browser scenarios pass on a rebuilt web bundle (`$SP/web/build.sh`, then `node pack2.mjs`, `node pack5.mjs`, `node review.mjs`, plus the named `review2/B/e*.mjs`).

### E0. Safety net (no Game.tsx behaviour change). Sonnet can do this.
- Add `src/game/debugHandle.ts`: `export function installDebugHandle(h: object)` that sets `globalThis.__ee` only when `__DEV__` or a build flag is on (the web test build). Replace the text-patching in `web/build.sh` with this. Call it from the same place as the current anchor (just before `startLoop`).
- Add `src/game/sceneTypes.ts` (2a). Pure type move.
- **Golden trace harness** (new, lives in `tests-browser/` or the scratchpad until a CI home exists): drives `__ee.update(1/60)` by hand (as `review2/B/hb.mjs` does: kills rAF, seeds `Math.random`), for a fixed scripted input over {campaign stages 1, 3, 8, 12, 18, 22; boss arena 10; endless; daily}. Every 30 frames record a hash of: player x/z/stance/stamina, every guard x/z/state/stunTimer, every dog x/z/state, `store.detection`, hearts, `runState`, `alarmLevel`, `projectiles` count, `scene.sections.length`. Save the golden hashes from the current HEAD. This is the single most valuable regression gate because the browser scenarios use wall-clock `setTimeout` waits under SwiftShader (pack2.mjs comment: "sim speed varies under software GL"), whereas the manual-step approach is deterministic (B.md e12: step-size independent).
- Tests that must exist before E1: the golden trace itself, plus `tests/loop.test.ts` (exists).
- New tests: none (the harness is the test).
- Traps: the hook must expose the same names; `__ee.scene` must stay a getter.
- Done: `build.sh` no longer needs the Python patch; golden hashes recorded; `typecheck` and `npm test` green.

### E1. Pure rules into runRules/endlessRules (quick win, low risk). Sonnet.
- Moves: `perkCharge`, `heartsForStage`, `catchOutcome`, `winSaveUpdate`, `levelAtZ` and the endless math, `computeFrameTuning` (2b). Game.tsx calls them; lines deleted there.
- Tests before: `tests/pack6-gameplay.test.ts` (runRules), `tests/pack5-modes.test.ts` (economy/progression), `tests/storage-hardening.test.ts` (Save shape). Browser: pack5 "Campaign clear pays coins once", "Boss round failure retries the round", review "P5/P6 boss popup once; retry keeps the perk heart", "P3 endless ignores campaign stage".
- New tests (node, same pattern as pack6): perk charged once per stage and not re-decayed on restart or boss retry; `catchOutcome` table (4 cases); `winSaveUpdate` never moves `stage` backwards after a replay of a lower stage and keeps `perkStages` unless advancing (1393-1404); `levelAtZ` caps at 30; `shouldDropSection` boundary at 45 and 160; `backtrackFloor`; `respawnZ`; `computeFrameTuning` snapshot per stage {1, 5, 12, 21}, standing vs crouched in a beam (matches `progression.ts` ramps).
- Traps: `computeFrameTuning` is called every frame: it must fill a reused object (the current code allocates `tuning` at 1920; do not make it allocate more). `winSaveUpdate` must keep reading `after` (state after `setStage`) not `st`.
- Done: Game.tsx no longer contains the arithmetic for these; 10+ new assertions; golden trace identical.

### E2. TipScheduler (quick win, low risk). Sonnet.
- Moves 948-1021 + 1672-1686 + the `markTipSeen` persistence behind an injected callback.
- Tests before: `util/stageTips` has none under tests (no `stageTips` import in tests). Browser: pack2 does not hit tips; review P5 hits the boss-intro modal only.
- New tests: fake deps; (1) a tip becomes "seen" only after 2 s on screen; (2) a tip replaced by another toast is re-queued at the front with `tipCooldown >= 2`; (3) `offer` fires once per segment; (4) per-level tips in Endless fire once per level; (5) `reset()` clears queue and sets the 1.2 s delay; (6) `sessionSeen` survives `reset()` (it is ctx-lifetime, 955).
- Traps: `markTipSeen` calls `upsertSave` then `writeSaves` (987-988): keep the write order and keep reading `useStore.getState().saves` after the upsert. `seenTips()` allocates a spread array on every call (959); a scheduler that caches the list must invalidate on `markSeen`.
- Done: Game.tsx has no tip fields; tests above; no change in the golden trace (tips never touch sim state).

### E3. Transition planner (medium, high value). Sonnet with review; Opus preferred for the review.
- Moves 1437-1520 into `planTransitions` + a small executor in Game.tsx that interprets the plan in the same order (rebuild, skin, restart, fresh start).
- Tests before: browser pack5 (Daily same seed, Endless streaming), review P2 (same-day Daily restart is fresh), P3, P5/P6, R2 (restart clears detection). B/e9 (restart inventory), B/e2 (alarm after catch).
- New tests (node): table of (cursors, store snapshot) -> plan for: seed change while playing; seed change while `cleared` (no rebuild); restart on the same frame as a seed change (single rebuild, `rebuiltNow` true); fresh start from idle with unchanged seed (forced rebuild, 1502-1518); fresh start from idle with changed seed (rebuild already ran, no second); `lastRunState` not idle (no perk bookkeeping reset); mode change; stage-only change.
- Traps: the **order inside the block matters**: seed-change rebuild (1438) precedes skin swap (1461) precedes restart (1469) precedes fresh start (1492). The skin swap sets `renderAuditIn = 3`, which also happens in `rebuildScene` (846); keep both. `bossIntroPending` is assigned only in the rebuild branch (1456) and consumed at 1522 in the same frame, so the planner must report it.
- Done: the block in Game.tsx is about 30 lines; the planner has 8+ table rows; golden trace identical (this block is exercised by every scenario).

### E4. De-duplicate soft reset (quick win, medium risk). Sonnet.
- Moves: `resetGuardsAndDogs(scene, spawn?)` (from 1058-1077 and 1253-1273) and `Effects.clearAll()` (from 1084-1108 and 1277-1299; `rocks`/`dust` clearing stays only in `resetSegment`, to keep behaviour identical).
- Tests before: browser review P1 (endless respawn near the catch), B/e2 (alarm after catch), B/e9, pack2 section G (boss restart re-arms the timer), pack2 C (restart removes reinforcements).
- New tests: node test with a headless `Scene` built from the real `ProcgenSystem` + `createGuard`: after `resetGuardsAndDogs` every guard is at home, `state === 'wander'`, `stunTimer === 0`, `fireCooldown === 0`, nav and memory cleared (`resetNavState`, `resetGuardMemory`), dogs reset to the handler. This also makes the `B-9` alarm reset (1250-1252) testable once step E9 lands.
- Traps: `setDetection(g.id, 0)` must stay per guard (the HUD alarm reads the store). `resolveCatch` calls `setDogTransform(d)` after `resetDog`; `resetSegment` does the same (1075-1076). The two currently differ in what else they reset: do not "unify" those extra fields in this step.
- Done: the duplicated blocks exist once; golden trace identical.

### E5. Detection frame (medium-high value, medium-high risk). Opus recommended.
- Moves steps 14-20 (1865-2158) minus the item handlers into `detectionFrame.ts` (2e), keeping `updateDogs` and the markers loop where the order demands.
- Tests before: `tests/pack2-stealth.test.ts` (15 tests: detection, noise, cover, projectile), `tests/pack6-gameplay.test.ts` (17), `tests/integration-review.test.ts`, `tests/pack1-bugs.test.ts`; browser pack2 A (line-of-sight shooting with telegraph), B (decay + noise ring), C (camera alarm reinforcement), D (dogs), review2/B/e1 (floodlight reach), e1b, e11 (dog), e10 (pause does not dodge bullets), e12 (step-size independence).
- New tests: a node test that builds a `Scene` (real procgen + guards, no GL) and runs `runDetectionPass` + `runGuardAi` for N frames against the golden numbers recorded from the browser (guard state/meters after 600 frames, stage 3, 8, 14); `externalFeedFor` only reaches guards inside range (already in DetectionSystem.ts:134); tier-3 broadcast sends the nearest non-chasing guard within 20 m to `chaserGuard.lastSeen`; the fire callback is invoked once per shot with a lead only at `aiTier >= 4`.
- Traps: (1) `prev` must come from the stale snapshot `st.detection` (1978), not a fresh `getState()`. (2) `st.setDetections(nextDetection)` and `nextDetectionFloor.clear()` between the passes (2041-2042). (3) `updateDogs` before pass 1. (4) `entry.range` written in pass 1 is read by render (beam scale 2321). (5) the fire callback reads `entry.equipment.pistol.getWorldPosition(tmpVec)` (2067): that is a three.js call and needs matrices up to date; keep it in the hook supplied by Game.tsx, not inside the pure module. (6) `guardSenses`/`nextDetection`/`senseOut` are reused maps (no per-frame allocation): keep passing scratch. (7) allocation: the per-guard callback closure for `updateGuard` is created per guard per frame today (2062); do not make it worse.
- Done: Game.tsx update shrinks by about 280 lines; the node test above passes; golden trace identical for every stage in the set; the bot harness in H can import `detectionFrame`.

### E6. AudioDirector (low-medium risk, independent). Sonnet.
- Moves 300-315, 1558-1564, 2177-2189, `playSfx` call sites become `audio.play`, `disposeRef` audio part (2476-2479).
- Tests before: `tests/audio.test.ts` (store/haptics/musicIntensity/siren), `tests/audioPlayers.test.ts` (10), `tests/pack4-feel.test.ts` (musicIntensity). Browser: pack2 has none for audio.
- New tests: with the stubbed expo-audio (`tests/stubs/expo-audio.mjs`), `frame({maxDetection: 0.5, anyChase: false})` drives siren volume and music mix; a `chase` rising edge plays `spotted` exactly once; paused `frame` mutes siren; `dispose` unsubscribes the volume listener (a store change afterwards must not call `music.setVolume`).
- Traps: sting timing (`spotted` plays on the same frame `anyChase` rises, 2182, before the music mix update); haptic and sfx call order inside `handleCatch` (1169-1177: sfx first, then haptic, then `bumpCatchCounter`); the two early-return frames skip `frame()`.
- Done: Game.tsx imports no audio module except the director; `disposeRef` calls `audio.dispose()`.

### E7. SceneFactory + EndlessStreamer (medium-high risk, high value for the Endless work). Opus recommended.
- Moves 417-795 and 828-856, 904-943. `scene` stays a variable owned by Game.tsx; every function receives `scene` (no more reading the closure variable).
- Tests before: `tests/procgen.test.ts`, `tests/culling.test.ts`, `tests/navgrid-flood.test.ts`, `tests/pack5-modes.test.ts`; browser pack5 "Endless streaming + payout", "Daily: same seed, same layout", review P4+R2 (a section with a chasing guard is kept; removal zeroes detection), R6 (cannot walk back into the stripped stretch), P7 (forks alternate); review2/B/e5 (guard nav), procgen stress (`B/procgen_stress.ts`).
- New tests: headless streamer test: real `ProcgenSystem` + fake `THREE.Group` root; advance `playerZ` by 10 m steps to 3 km and assert (a) `sections.length` stays 3-4, (b) every guard's `section` index exists, (c) `guardEntries`/`guards`/`threatArrows` stay index-aligned (they are three parallel arrays spliced together in `dropGuardAt`, 555-557), (d) a section with a chasing guard is not dropped until `behind > 160`, (e) `procgen.trimBefore` never removes a chunk containing the player, (f) `dropGuardAt` zeroes the store meter (559).
- Traps: the **parallel arrays** (`guardEntries`, `guards`, `threatArrows`, plus `dogs`/`dogShadows`) must be spliced at the same index everywhere; `render` indexes `scene.threatArrows[i]` with the index of `scene.guards[i]` (2363-2366). `removeSection` deletes dogs by `group.parent === sec.root`. `buildScene` writes the store (641-642). Reinforcements are guards with `section === null` added to `scene.root`, not a section root (925-935), so they are only removed by `removeReinforcements` or the 60 m rule (786-789). The streamer's hitch-spreading (G(c)) must not change when `s.nextSection` advances relative to `procgen.extendTo`.
- Done: Game.tsx no longer contains `populateSection`/`buildScene`; the headless streamer test exists; golden trace identical for Endless and Daily.

### E8. renderFrame + SimView (medium risk, unlocks parallel perf work). Sonnet with screenshot gate.
- Moves 2240-2426. `update` writes `view.*` instead of closure variables (`noiseRadiusNow`, `noiseLoudness`, `crowbarTarget`, `prevPX/Z`, `animTime`, `shakeRemaining` become fields of one object; the paused branch zeroes them at 1556-1558).
- Tests before: `tests/loop.test.ts`, `tests/culling.test.ts`, `tests/materials.test.ts`, `tests/renderAudit.test.ts`; browser: screenshot pairs as in `webC2/cmp.mjs` and `webC2/out-c3` (before/after PNG diff per scene) for campaign 1/5/15/29, endless 1.
- New tests: interpolation unit test (pure function `drawPosition(prev, cur, alpha, teleport)`); teleport rule (`> TELEPORT_DIST` draws the new position); `renderDt` clamp at 0.1 (2245).
- Traps: `isStatic()` reads `shakeRemaining` (2439): it must read the same field. `render` is also where `renderAuditIn` counts down (2409): keep it in the render module. `updateCameraRig` has module-level `currentYaw` (CameraRig.ts:15): a second GL context would share it (harmless today).
- Done: render has no closure reads except `SimView`/`r`/`scene`; pixel diff 0 on the scene set.

### E9. RunLifecycle (dangerous, highest testability payoff). Opus.
- Moves 1023-1418 and the `handleCatch` call sites become `lifecycle.handleCatch(cause, source)`.
- Tests before: all of the above plus pack2 E (razor wire), F (stamina), G (boss restart), pack5 (campaign clear pays once, boss retry), review P1, P2, P5, P6, R2, B/e2, e4 (boss), e9.
- New tests (this is the F-14 item in the ledger): headless lifecycle test with a real store (`useStore`) and stubbed audio/haptics: (1) a catch with hearts 2 goes to hit-stop then soft respawn: hearts 1, alarm reset to 0 (B-9), guards at home; (2) two catches in one frame cost one heart (`pendingCatch` guard, 1162); (3) boss round failure requests a restart and does not advance stage (1204-1209); (4) campaign death clears the boss perk both in the store and the save (1216-1225); (5) win pays once per `runId` (economy idempotence) and moves stage forward only (1381-1398); (6) `grantStartingHearts` is charged once per stage; (7) Endless end writes a `RunSummary` and pays `distanceM` (1323-1346).
- Traps: `runId` TDZ (see 1c); `handleCatch` order: store writes, `tracker.onCatch`, sfx, haptic, `bumpCatchCounter`, `projectiles.clear`, shake, deferred resolve (1163-1182); do not reorder (sfx before haptic is currently deliberate: "Haptic on the impact frame"). `handleWin` calls `grantStartingHearts(justClearedStage + 1)` *after* `setRunState('cleared')` (1410-1416). `payRun` is idempotent per `runId`; `resetSegment` mints a new `runId` (1025), so extracting must keep exactly one mint per segment start. `resolveCatch` reads `scene` at the time it runs (after hit-stop), not at the time `handleCatch` was called: pass `getScene()` not the scene.
- Done: Game.tsx has no catch/win/payout code; lifecycle tests above; golden trace identical including a scripted catch sequence.

### E10. `GameHud.tsx` (trivial, do any time after E0). Sonnet.
Moves 2486-2506. Done when no `Game.tsx` edit is needed to change the overlay list.

### Do not do (further splits of `update`)
After E1-E9 `update` should be about 330 lines of ordered calls. Stop there.

## 4. Quick wins versus dangerous

Quick wins (pure logic or no frame-order coupling; low risk; do first): E0, E1 (run rules, perk charge, endless math, frame tuning, win save update), E2 (tips), E10 (HUD seam), E4's `resetGuardsAndDogs` dedupe, E6 (audio director, independent of sim).

Medium: E3 (transitions, subtle but isolatable by table tests), E8 (render path, gated by screenshots).

Dangerous (share frame-order or closure invariants; need the golden trace and a second reviewer): E5 (detection frame), E7 (scene factory + streamer; parallel arrays and `scene` variable), E9 (run lifecycle).

## 5. Single-owner protocol (preventing parallel edits to Game.tsx)

1. **One integration branch.** `decomp/game-tsx` is the only branch allowed to modify `src/game/Game.tsx` and the new `src/game/*` modules while the plan runs. Extraction PRs target it, land strictly sequentially (one open at a time), and each is rebased on the previous. The integration branch is merged to the release branch only after E0-E4 pass on a device smoke test, then after each later group.
2. **Lock mechanism.** A one-line file `docs/GAME_TSX_LOCK` (content: owner session id and current step, e.g. `owner=session_X step=E3 since=2026-10-04`). A CI check (`scripts/check-game-lock.mjs`, 10 lines) fails any PR that touches `src/game/Game.tsx` whose branch name does not start with `decomp/`. Releasing the lock = deleting the file in the final PR.
3. **Meanwhile other workers may edit**: `src/systems/*`, `src/scenes/*`, `src/util/*`, `src/ui/*`, `src/components/HUD/*` (except by adding to the overlay list in `Game.tsx`), `src/state/store.ts` (additive fields only, with `storage.ts`/`settingsAutosave.ts` in the same PR), tests, scripts. They may add new modules and exports.
4. **When another worker needs a Game.tsx change**: they do not edit it. They add the logic as an exported pure function or class in their own file, with unit tests, and attach a "wiring note" to the PR: anchor text (not line numbers), the exact call to insert, and the frame step number from the table in section 0. The lock owner applies wiring notes between extraction steps (after a green gate) as separate small commits on `decomp/game-tsx`.
5. **Conflict rule.** If a worker's PR touches Game.tsx anyway, it is closed and re-submitted as a wiring note. No force pushes; no merging of the release branch into `decomp/game-tsx` except at step boundaries (rebase only).
6. **PR shape.** One module per PR, verbatim code move, diff stat shows Game.tsx lines out roughly equal to module lines in. PR description lists: step id, gate results (typecheck, `npm test` count, golden trace hash match, scenarios run), and traps checked. Revert is one `git revert`.
7. **Freeze windows.** No extraction PR merges to the release branch within 24 h of a planned device playtest; extraction merges are not mixed with OTA content.

## 6. What NOT to extract (aesthetic splits)

- The item handlers (crowbar 1754-1776, rock throw 1781-1804, smoke bomb 1805-1814, pickup grab 1716-1749) as three or four separate files. They share `effDt`, `st`, `facingX/Z`, `nextDetectionFloor` and `sfx`/`haptics` and are 60-130 lines each; they belong inside `Effects`.
- The idle splash-demo branch (1565-1600) into its own module. It writes `input` and calls `updatePlayer` (it relies on `scene.segmentEndZ`) and has no tests to add.
- Constants (`SHAKE_DURATION`, `HIT_STOP_S`, `PICKUP_GRAB_DURATION`, `ENDLESS_*`) into a `constants.ts`. No isolation value.
- Converting the closure to a class or hooking up an event bus or ECS. The orchestrator order is the contract; indirection hides it.
- `startLoop` error and fatal handlers (2428-2471) into a module. 40 lines, already behind `Loop.ts`; extract only if a test for the fatal modal is wanted.
- A `GuardAI` wrapper over `updateGuard`. `GuardAI.ts` is already the module.
- Moving the transient pools (`rocks`, `dust`, `bursts`) out of `Effects` into separate singletons. They are pooled once per context for a reason (`createRockPool(r.worldRoot, 2)`).
- Splitting `Scene` into sub-types or classes. It is a shared struct read by render, detection, streamer and lifecycle; a better type is `sceneTypes.ts` only.

## 7. Is Opus 5.5 materially needed?

Yes for **E5, E7, E9** and for reviewing E3, because correctness there depends on reasoning about the stale-snapshot reads (section 1e), parallel arrays, hit-stop/deferred-resolve ordering and the early-return frames, and a wrong move can pass typecheck and unit tests and only show up as one-frame behaviour drift. The golden trace turns most of that into a mechanical check, but designing that trace (what to hash, which scripted inputs reach catch, boss clock, alarm rising edge, streaming boundaries) is the hard part.

Sonnet (with the gates above) can do **E0, E1, E2, E4, E6, E8, E10** and the test writing for all steps. If only one strong-model session is available, spend it on: designing the golden trace in E0, then E5 and E9, and a review pass over E3 and E7.

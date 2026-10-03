# Review 2 / Area A: lifecycle, state machine, persistence, updates, error handling

HEAD 370a624. The review was read-only; the repo was not modified. Baseline: `npm test` 91/91 pass, `npx tsc --noEmit` clean.
Repro scripts are in `review2/A/` (harness `../h.mjs`, port 8801), plus `A/storage-repro.ts`, which runs with
`node --import ./tests/register.mjs <path>` from the repo root and uses the real `storage.ts`/`economy.ts` with the AsyncStorage stub.

State machine as built: `runState ∈ idle | playing | caught | cleared`. `paused` and `gameModal` are separate flags, and so are `showTutorial` and `howToPlay`.
Every store setter is unguarded (any state can go to any state). Game.tsx picks up changes by diffing
`segmentSeed/stage/gameMode/restartCounter/runState` once per frame (Game.tsx:1423-1494).

---

## A-1 [S2] Pause panel works in every runState: at the main menu, RESTART starts a run with no character, and that run's progress and coins are never saved
- **Confidence:** confirmed by repro (`A/a1.mjs`).
- **Evidence:** on a fresh install the gear button sits on top of the start screen. Tapping it, then RESTART, gives:
  ```
  after RESTART from menu {"runState":"playing","paused":false,"active":null,"stage":1,"hearts":3,"gameMode":"campaign"}
  after win with no save {"runState":"cleared","stage":2,"summary":{...coinsEarned:0...},"saves":[],"ls":["debug:current","endless-escaspe:settings:v1"]}
  ```
  The player can clear stages that never reach a save. `payRun` returns 0 (Game.tsx:1309) and `handleWin` skips the write (1383).
- **Root cause:** `SettingsScreen` shows RESUME/RESTART/LOAD RUN/MAIN MENU whatever the `runState`
  (SettingsScreen.tsx:265-288, gear at 203-220). `requestRestart` unconditionally becomes `setRunState('playing')`
  (Game.tsx:1452-1464).
- **Defect class:** run actions with no guard on the current state. The same condition causes these:
  - (a) On the **cleared** banner, pause, then RESTART, skips NEXT STAGE and starts stage N+1 on the old seed.
    Repro `a3.mjs (d)`: `{"runState":"cleared","stage":11,"seed":7003}` becomes `{"runState":"playing","stage":11,"seed":7003}`.
  - (b) On the campaign **caught** banner, RESTART is a hidden "retry", even though the banner itself offers only MAIN MENU.
  - (c) At idle after the active save was deleted (`removeSave` nulls `activeSaveName`), RESTART plays without a save.
  - (d) At idle after an Endless run, RESTART silently starts Endless.
- **Fix (OTA-safe):**
  - In SettingsScreen, derive `inRun = runState === 'playing'`.
  - At idle, show a settings-only panel: CLOSE plus sliders, HOW TO PLAY and build info. Hide RESTART, LOAD RUN and MAIN MENU.
  - On the caught and cleared banners, hide RESTART, or hide the gear entirely.
  - Belt and braces in Game.tsx: ignore a `restartCounter` change while `runState === 'idle'` or `activeSaveName == null` in campaign. Apply the counter (`lastRestartCounter = ...`) without starting a run.
- **Regression test:** harness test. Open the gear at idle, assert RESTART is absent, and `requestRestart()` at idle leaves `runState === 'idle'`.

## A-2 [S3] A retry through MAIN MENU then CONTINUE (including after death) reuses the old scene: collected pickups stay gone and the inventory is zeroed
- **Confidence:** confirmed by repro (`A/a4.mjs`, death path through the real banner MAIN MENU button; also `a2.mjs`).
  ```
  death-path: grabbed {"grabbed":3,"inv":{"crowbar":1,"smokebomb":0,"rock":2}}
  death-path: after CONTINUE stage 4 {"seed":8100,"uncollected":3,"total":6,"inv":{"crowbar":0,"smokebomb":0,"rock":0}}
  ```
  The player gets the same layout with half the tools missing and an empty bag. This is the most common retry path, because the campaign death banner only offers MAIN MENU.
- **Root cause:**
  - `beginRunForSave` keeps `segmentSeed` and, on a retry, `stage` unchanged, so no rebuild happens.
  - The idle-to-playing "fresh transition" rebuilds only Endless scenes (Game.tsx:1479-1492: `if (scene.endless) rebuildScene(...)`).
  - `resetSegment` (1035-1124) never resets `procgen.pickups()[].collected`.
  - `store.startRun` zeroes the inventory (store.ts `startRun`).
- **Defect class:** per-scene mutable world state that only a full rebuild clears. Pickups are one example; anything else procgen mutates during play is too. The RESTART path is consistent only because `requestRestart` happens not to clear the inventory.
- **Fix (OTA-safe):** in the fresh-transition branch, rebuild whenever `lastRunState === 'idle'` (campaign as well), i.e. drop the `scene.endless` condition there. The alternative is a `procgen.resetPickups()` that re-creates the meshes and clears `collected`.
- **Regression test:** harness test. Collect pickups, die, MAIN MENU, `startRun` on the same stage, then assert every pickup is uncollected.

## A-3 [S3] The boss reward "+1 heart for the next 10 stages" is lost on MAIN MENU, LOAD RUN, app restart or OTA reload
- **Confidence:** confirmed by repro (`A/a4.mjs`).
  ```
  perk after boss clear, stage 11 start {"stage":11,"hearts":3,"perk":9}
  perk after MAIN MENU -> CONTINUE      {"stage":11,"hearts":2,"perk":0}
  ```
- **Root cause:** `perkRemainingStages` lives only in the zustand store. `startRun` sets it to 0 ("Fresh runs don't inherit a leftover boss perk", store.ts startRun), and the Save has no field for it. The boss intro promises the reward without qualification (Game.tsx:1506).
- **Defect class:** progress the game promises is stored as run-scoped memory. Run-scoped by design: inventory, hearts. Wrongly run-scoped: perk.
- **Fix (OTA-safe):**
  - Add `perkStages: number` to Save. Default it to 0 in `parseSaves`, which is backward compatible.
  - Write it in `handleWin`/`grantStartingHearts`.
  - Have `beginRunForSave` load it, and stop `startRun` zeroing it for campaign continues. Still clear it on a stage replay of a lower stage if that is the intended design.
- **Regression test:** unit test for the parse default, plus a harness test of boss win, then MAIN MENU, then CONTINUE, with hearts equal to start + 1.

## A-4 [S2] Save loading is lossy and the whole map is rewritten, so unreadable entries are permanently erased; the backup slot can be overwritten with corrupt data
- **Confidence:** confirmed by repro (`A/storage-repro.ts`).
  ```
  S1 loadSaves with future-shaped primary []                 <- primary is valid JSON, one entry has skin:'pale'
  S1 backup after next write still has alice? []             <- good backup replaced by the unreadable primary
  S1 primary after next write ["bob"]                        <- Alice (stage 14, 320 coins) gone from both slots
  S2 unknown field survives parse? false                     <- future fields stripped, then rewritten
  S3 backup after write (raw head) "{\"alice\":{\"name\":\"Alice\",\"sk"   <- truncated primary copied over the good backup
  ```
- **Root cause:**
  - `parseSaves` (storage.ts:241-283) silently drops any entry that fails validation. Validation is strict: `skin` must be 'beige' or 'brown', and `stage` must be a number. It rebuilds each entry from known fields only.
  - `loadSaves` (285-306) falls back to the backup only when `parseSaves` returns null. A parse that yields `{}` or a partial map counts as success.
  - `writeSaves` (308-328) copies whatever the primary holds into the backup before every write, including content that does not parse. Every caller writes the full in-memory map.
- **Why it matters here:** this project ships OTA updates and shows emergency launches (fallback to the embedded bundle) in its UI. Any future schema change, such as a new skin, an outfit-driven skin, a new field type or `stage` as an object, then becomes permanent character loss after a rollback, an emergency launch or a channel switch to an older bundle. The same happens to a single bad field written by a bug.
- **Defect class:** a lossy parse feeding a full rewrite. The same pattern exists in `saveSettings` (storage.ts:105-115): a corrupt settings JSON resets `tutorialSeen` etc. to defaults, which is benign there.
- **Fix (OTA-safe, JS only):**
  1. `parseSaves` returns `{ saves, passthrough }`. Entries it cannot validate are kept as raw JSON in `passthrough`.
  2. Each valid entry spreads the raw object first, then overrides the validated fields, so unknown fields survive.
  3. `writeSaves` merges `passthrough` back into the written map.
  4. `loadSaves` treats "raw non-empty but zero valid entries" as a failure and tries the backup.
  5. `writeSaves` refreshes the backup only when the current primary parses to at least one valid entry.
  6. Add `schemaVersion` to the stored map. A bundle that sees a newer version writes to a side key, or refuses to write that map.
- **Regression tests:** unit tests for the four cases above, against the async-storage stub.

## A-5 [S3] No error containment in the main loop: one exception in `update()` stops the game for good (crash-to-desktop on native release)
- **Confidence:** confirmed by repro (`A/a4.mjs`). The test makes `scene.procgen.update` throw exactly once:
  ```
  loop after one exception in update {"callsAfterThrow":1,"playerMoved":false}    pageerrors ["transient"]
  ```
  On web the world freezes for good while the HUD still responds. On a native release build, an exception in a rAF callback goes to the global handler as fatal, and the app closes.
- **Root cause:** `Loop.ts` `tick` has no try/catch, so `requestAnimationFrame(tick)` is never re-queued after a throw. There is no React ErrorBoundary anywhere (grep), so a render error in any HUD component takes the tree down. `debug.ts` records the error but nothing recovers.
- **Defect class:** a single point of failure in the frame loop and in the HUD render. Every latent bug that throws, in any review area, becomes S1.
- **Fix (OTA-safe):**
  - Wrap `opts.update`/`opts.render` in try/catch inside `tick`, call `logDebug('error', ...)` and always re-queue the frame.
  - After N consecutive failures, set a store flag that shows a GameModal ("Something went wrong", MAIN MENU / REPORT A BUG).
  - Add an ErrorBoundary around `<Game/>` HUD children.
- **Regression test:** a Loop.ts unit test where `update` throws once and later frames still run.

## A-6 [S4] After a run, the start screen reopens on the stale sub-screen (name entry shows the used name, so DONE gives "Name already taken")
- **Confidence:** confirmed by repro (`A/a5.mjs`).
  ```
  menu after the run ends (visible text) "... Name your save Bob BACK START Q W E ..."
  DONE again -> modal "Name already taken"
  ```
- **Root cause:**
  - `onConfirmName` (StartScreen.tsx:316-318), `beginRunForSave` and `beginEndlessForSave` start the run without `setMode('home')`.
  - The reset effect (StartScreen.tsx:179-191) only runs when `mode === 'home'`.
  - Profile-started runs also come back to 'profile', which may be acceptable, but name and tutorialPrompt never should.
- **Fix (OTA-safe):** set `mode` explicitly when a run starts: 'home' after name entry, 'profile' (by design) for profile-started runs. Alternatively, add an effect `if (runState !== 'idle' && (mode === 'name' || mode === 'tutorialPrompt')) setMode('home')`.
- **Regression test:** harness test. NEW RUN, name, DONE, die, MAIN MENU, then assert the home buttons are visible.

## A-7 [S5] The name "Constructor" is reported as already taken (lookups by prototype key)
- **Confidence:** confirmed by repro (`a5.mjs`: typing CONSTRUCTOR then DONE gives the "Name already taken" modal and no save; `storage-repro.ts` S4).
- **Root cause:** `liveSavesPre[key]` (StartScreen.tsx:290) on a plain `{}` finds `Object.prototype.constructor`.
- **Defect class:** maps keyed by user text are plain objects. The same applies to `saves[...]` lookups at StartScreen.tsx:223/661/708 and Game.tsx:970/996/1308/1384, and to the `out[...]=` assignment in `parseSaves`. The letters-only keyboard limits exposure to "constructor".
- **Fix:** use `Object.hasOwn(saves, key)` for existence checks, or build the maps with `Object.create(null)`.

## A-8 [S4] Settings are saved only when the pause panel closes, so changes are lost on "RESTART INTO UPDATE" or an OS kill while backgrounded
- **Confidence:** confirmed by code reading.
- **Evidence:**
  - `persistSettings` runs only from close, restart, main menu and load run (SettingsScreen.tsx:124-190).
  - `BuildInfo.onCheck` calls `reloadIntoUpdate()` from inside the same panel without persisting (BuildInfo.tsx:28-36).
  - Backgrounding opens this panel automatically (SettingsScreen.tsx:156-158). If Android then kills the process, the volume and weather changes are gone.
- **Fix (OTA-safe):** have a store subscriber persist the three settings fields, debounced by about 300 ms, and `await` a flush before `reloadAsync`.

## A-9 [S4] Android back is unhandled outside gameplay, so the app is sent to the background from sub-screens, the tutorial and the banners
- **Confidence:** confirmed by code reading (not run on a device).
- **Evidence:** the only BackHandler registrations are SettingsScreen.tsx:159 (`playing && !paused` only) and HowToPlay.tsx:115 (home reference only). StartScreen modes name, continue, profile, outfits and tutorialPrompt, the Tutorial, and the caught/cleared banners all fall through to the default handler. On Expo, that handler moves the task to the background.
- **Fix:** one back handler that maps the current state to an action: sub-mode goes to the previous mode, tutorial is skipped, the banner's primary or "menu" action fires, home falls through.

## A-10 [S4] Storage failures are silent, and the crash-trail flush is not synchronous
- **Confidence:** confirmed by code reading for the swallowed errors; the lost crash trail is suspected.
- **Evidence:**
  - `storage.ts` has bare `catch {}` at 92, 111, 246, 295, 302, 319 and 324, with no `logDebug`.
  - A backup recovery (`loadSaves` falling back) or a failed `setItem` (disk full, or the Android SQLite row/DB limit) leaves no trace in the bug-report log, and the player is never told.
  - `debug.ts:471-477` says it "force-flushes synchronously", but `flush()` is an async `AsyncStorage.setItem`. On a fatal error the process can die before the write lands, and the last ~200 ms of entries are lost.
- **Fix (OTA-safe):**
  - Call `logDebug('warn', '[storage] ...', e)` in every catch.
  - Log `'[storage] recovered saves from backup'` and show a one-off toast.
  - Log `runState` transitions and the AppState change in `logDebug`, which is cheap and gives the crash trail context.
  - Accept the async flush limitation, but correct the comment.

## A-11 [S4] Daily is an unlimited coin farm that beats Endless
- **Confidence:** confirmed by repro (`storage-repro.ts` S5): five 400 m runs pay **Daily 110** vs **Endless 80**.
- **Root cause:** `applyRunResult` pays `dailyReward(distance)` for every Daily run (economy.ts `dailyReward`, 20 m/coin vs Endless 25 m/coin). The participation bonus is correctly limited to the first run of the day. The Daily seed is fixed for the day, so the layout can be memorised, and RUN AGAIN is one tap (Banner.tsx:190).
- **Fix (design call, OTA-safe):** pay Daily distance coins only for improvement over today's best (`max(0, reward(new) - reward(oldBest))`), or cap paid Daily runs per day.

## A-12 [S5] Daily RUN AGAIN after UTC midnight replays and records yesterday's daily as "Best today"
- **Confidence:** confirmed by code reading.
- **Evidence:** Banner.tsx:190 → `requestRestart()` keeps `dailyDay` and the seed. Banner.tsx:155 labels it `Best today (${day})`.
- **Fix:** on RUN AGAIN for Daily, compare `utcDayKey(new Date())` with `dailyDay`. If they differ, start today's Daily (`setGameMode('daily', today)` + `resetForSegment(dailySeed(today))`). Otherwise restart.

## A-13 [S5] Each stage clear builds the scene twice: once under the "YOU MADE IT!" banner, again on NEXT STAGE
- **Confidence:** confirmed by repro (`A/a6.mjs`). The scene root tag changes at each phase:
  ```
  [["playing","2zg5","1.0"],["cleared banner up","e05m","1.0","cleared"],["after NEXT STAGE","i9ju","1.0"]]
  ```
  Behind the win card, the world switches to the next stage and the player snaps back to spawn. A full dispose and rebuild is wasted.
- **Root cause:** `handleWin` calls `setStage(n+1)` (Game.tsx:1376). The update loop rebuilds on the stage change (1423-1432), and NEXT STAGE changes the seed, which triggers another rebuild.
- **Fix:** keep `justClearedStage` in the store and advance `stage` and `seed` together in NEXT STAGE. Banner.tsx:41 must then read `justClearedStage`, not `stage-1`. The save write in handleWin stays as is.

## A-14 [S5] Lifecycle loose ends
- **Keep-awake for the whole app lifetime.** `activateKeepAwakeAsync` is held on menus, pause and banners (App.tsx:23-28), and its rejection is unhandled. Activate it only while `runState==='playing' && !paused`.
- **Dead persisted state.** `bossModeUnlocked`/`bossModeEnabled` are loaded and persisted, but nothing reads or sets them (grep). The boss arena is driven by `stage % 10` (Game.tsx:626). Remove them, or keep them only for compatibility.

---

## Good, preserve
- **Double taps are safe.** Double-tap NEXT STAGE advances the seed once (`a3 (a)`: 7001 → 7002), and double-tap DONE creates one save (`a5`).
- **Auto-pause works.** Backgrounding during the catch hit-stop opens the pause panel and freezes resolution, and RESUME resolves it correctly (`a3 (e)`).
- **Overlays cover the gear.** GameModal (BOSS ROUND), Tutorial and the home How-To-Play all cover the gear (`a3 (c)(g)(h)`).
- **Catch handling.** `pendingCatch` dedupes multi-hits, and `resetSegment` clears it on restart. MAIN MENU during the final hit-stop is harmless (`a3 (f)`).
- **Economy.** The `coinStars` ledger, unique per-segment run ids, the one-time pre-economy migration, and clamped parsing of every field.
- **Storage plumbing.** The per-key serial write queue (`enqueueWrite`), and the backup fallback for unparseable JSON (`S3 recovered from backup`).
- **Boot does not hang on assets.** The texture preload never rejects (per-texture try/catch, embedded PNG path), and a font failure does not block boot.
- **Release info.** `releaseInfo` never guesses, surfaces emergency launches in the menu line and the panel, and a failed OTA check or reload shows its message.
- **Background audio.** expo-audio pauses natively in the background (`AudioModule.kt` OnActivityEntersBackground), so music does not keep playing.

## Summary by severity
| ID | Sev | Title | Confidence |
|---|---|---|---|
| A-1 | S2 | Pause panel RESTART at main menu starts a save-less run, and other run actions are unguarded on banners | repro |
| A-4 | S2 | Lossy save parse + whole-map rewrite erases unreadable or future-shaped characters; backup overwritten with corrupt data | repro (unit) |
| A-2 | S3 | MAIN MENU then CONTINUE (after death) reuses the scene: pickups gone, inventory zeroed | repro |
| A-3 | S3 | Boss +1-heart perk lost on menu, reload or app restart | repro |
| A-5 | S3 | One exception in update() kills the loop, with no ErrorBoundary (native: crash) | repro |
| A-6 | S4 | Start screen returns to the stale name-entry screen after a run, then "Name already taken" | repro |
| A-8 | S4 | Settings saved only on panel close; lost on reload-into-update or OS kill | code |
| A-9 | S4 | Android back unhandled on sub-screens, tutorial and banners | code |
| A-10 | S4 | Storage errors swallowed without logging; crash flush is async | code / suspected |
| A-11 | S4 | Daily replays farm more coins than Endless | repro (unit) |
| A-7 | S5 | "Constructor" name reported as taken (prototype keys) | repro |
| A-12 | S5 | Daily RUN AGAIN after UTC midnight replays yesterday as "today" | code |
| A-13 | S5 | Scene built twice per clear, the first time visibly under the win banner | repro |
| A-14 | S5 | Keep-awake always on; dead bossMode settings | code |

All fixes listed are JS-only and OTA-safe.

# Review B: gameplay simulation, AI, collision/navigation, procgen, balance, exploits

Target: `/home/user/Endless-Escaspe` at HEAD 370a624 (frozen web build in `review2/dist`). This review was read-only.
Note: the working tree is not clean. `git status` shows `M src/game/Game.tsx`, an uncommitted `startLoop({ onError, onFatal })` hunk at about line 2374 that I did not write. Every line number below is below that hunk, so it matches HEAD.

Evidence scripts are in `review2/B/`. Browser scripts use `hb.mjs`, which wraps `../h.mjs` on port **8802**. It kills the rAF loop and drives `__ee.update(1/60)` by hand, so runs are reproducible and fast. Node scripts run as `node --import /home/user/Endless-Escaspe/tests/register.mjs <file>.ts` and import the real `src/` modules. Saved outputs are the `*.out` files.

Severity scale: S1 crash/corruption · S2 progression blocker/soft lock/exploit · S3 functional defect · S4 feel/feedback · S5 polish.

---

## B-1 (S2): floodlight, searchlight and dog-smell feeds raise *every* guard's meter with no position, so guards go `investigate` with no target and freeze for about 20 s
**Confidence:** confirmed by repro (`e1_floodlight_global.mjs`, `e1b_freeze_duration.mjs`, `e11_dog.mjs`).

**Evidence**
- `Game.tsx:1965-1967`: `externalBumps = (litAdd + dogSmell) * EXTERNAL_FEED_GAIN + searchlightBump` is added to **every** guard in `scene.guardEntries`. There is no distance, cone or line-of-sight gate. The searchlight jolt (`:1845`, 0.4) also goes to every guard.
- `DetectionSystem.ts:183`: a non-visual feed can lift the meter to `NON_VISUAL_CAP` = 0.75, which is above `TH_INVESTIGATE` = 0.40.
- `GuardAI.ts:277-278`: `setState(g,'investigate', believed)` runs even when `believed` is `null`. That happens when the guard has no `lastSeen`/`lastHeard`.
- `setState` (`:150`) only sets a target when one is given. `case 'investigate'` (`:320-321`) does nothing without `investigationTarget`. The only exit is the timeout (`:343`, 21 s **and** meter below 0.4).
- Repro: on stage 3, 8 and 14 the player stands still in a beam beside the first tower:
  `t=4s [g1 investigate det=0.74 dist=18m target=null everSeen=n] [g2 investigate det=0.74 dist=71m target=null] [g3 ... dist=55m target=null]`.
  On stage 14 the guard 139 m away is also pinned at 0.75. After 5 s lit and then hiding, every guard moved `0.0m` for 15 s and only resumed wandering at about t+18 s.
- Dog smell is the same defect class. A crouched, motionless player 3 m from a leashed dog pins the handler at `investigate det=0.75 target=null lastSeen=n lastHeard=n handlerMoved=2.4m` indefinitely. The meter never drops below 0.4, so the timeout never fires. The dog stays leashed next to the frozen handler.

**Impact**
- **Exploit:** stepping into any beam for about 4 s stops every patrol in the level, including Endless sections up to 240 m ahead, for about 20 s. Sitting next to a dog freezes its handler for as long as you like.
- **Unfairness:** every meter starts at 0.75, so any later glimpse goes almost straight to chase, and at 0.85 the guard can shoot. `timesSeen`/`timeDetected` (stars) are charged even when no guard is near.
- **Feedback:** yellow "search" markers on every guard and the tension music play while nothing searches.

**Root cause / defect class.** Two independent flaws.
1. Global feeds carry no spatial information.
2. The guard FSM can enter a goal-seeking state without a goal. `alert` (`:279`) correctly requires `believed`; `investigate` does not. The same null-target path exists at `:276` (chase to investigate with `believed` null).

**Fix**
- (a) Gate the floodlight, searchlight and smell feeds per guard. Floodlight and searchlight should reach only guards within `guardRange*(1+litBonus)` of the player, or with the lit spot in their cone. Smell should apply only while the handler is within about 15 m of the dog.
- (b) Make the feed carry a fix. When the feed raises a meter, call `hearNoiseAt(g, player.x, player.z)`; the light reveals the spot.
- (c) Make the FSM total. If `believed` is null, go to `alert` and scan in place, or stay in `wander`. In `case 'investigate'`, when `!investigationTarget`, fall back to `return` after `ALERT_PAUSE_S`.

**Regression test.** Unit-test `updateGuard` with detection 0.6, `senses={visual:false,heard:false}` and empty memory. It must not stay put for more than N s. In integration (node), a lit player must not raise the meter of a guard 50 m away.

**OTA-safe:** yes.

## B-2 (S2): pausing deletes bullets in flight and cancels every guard's aim wind-up
**Confidence:** confirmed by repro (`e10_pause_dodge.mjs`).

**Evidence.** `Game.tsx:1523-1530`: the branch for `runState !== 'playing' || st.paused` runs `projectiles.clear()` and `e.guard.aimTimer = 0` on **pause** as well as in menus.

Repro: stage 3, open ground, guard 5 m from a standing player, meter pinned. Each variant ran for 20 s of sim:
```
control               heartsLost=1 shotsFired=1
pauseTap (every 0.5s) heartsLost=0 shotsFired=0  pauses=40
pauseWhenBulletFlies  heartsLost=0 shotsFired=4  bulletsDeletedByPause=4
```

**Impact.** Pausing when the aim click sounds, or tapping pause rhythmically, makes the player immune to gunfire. That is the main ranged threat.

**Root cause.** "Freeze" and "leave gameplay" share one branch. While paused, nothing advances anyway, so the clear is unnecessary.

**Fix.** Run `projectiles.clear()` and the aim reset only when `runState !== 'playing'`. On pause, return without touching sim state. Projectiles are already cleared on catch, win and reset.

**Regression test.** Harness: spawn a projectile, then pause, `update`, unpause. Assert `projectiles.count()` is unchanged and `aimTimer` is preserved.

**OTA-safe:** yes.

## B-3 (S2): Endless/Daily restart keeps the inventory and respawns every pickup, so items can be farmed without limit
**Confidence:** confirmed by repro (`e9_restart_inventory.mjs`).

**Evidence**
- `store.ts:461-471`: `requestRestart` resets meters, alarm and stats but **not** `inventory`. `startRun` and `resetForSegment` do reset it (`:484`, `:504`).
- `Game.tsx:1462`: Endless restarts rebuild the world, so pickups respawn. The callers are the pause-menu RESTART (`SettingsScreen.tsx:172`) and Daily "RUN AGAIN" (`Banner.tsx:190`).
- Repro, collecting the pickups in the first 120 m and then restarting four times:
  - daily: `{crowbar:1,smokebomb:2,rock:1}` → `{2,4,2}` → `{3,6,3}` → `{4,8,4}`.
  - endless: identical.
  - campaign: stays at `{1,2,1}`, because the campaign scene is reused and pickups stay collected.

**Impact.** The Daily ("same run for everyone") and Endless distance records can be inflated with stacks of crowbars and smoke. Campaign has a milder version: restart keeps items picked up on the failed attempt while stats reset, which allows star gaming.

**Root cause.** Restart semantics are split. The store keeps run-scoped state that the world rebuild resets.

**Fix.** Clear `inventory` in `requestRestart`. For campaign, also restore `collected=false` and the meshes of the scene's pickups, or rebuild the campaign scene on restart.

**Regression test.** Store unit test: `requestRestart()` sets inventory to empty. Harness repeat of `e9` expects a flat inventory.

**OTA-safe:** yes.

## B-4 (S3): "Endless mood per seed" is effectively always Day (32-bit overflow in the hash)
**Confidence:** confirmed by repro (`mood.mjs`, which uses the expression from `Game.tsx:615` verbatim).

**Evidence.** `1 + (((seed >>> 0) * 2654435761) >>> 0) % 4`. The product exceeds 2^53 for every real seed: Endless uses `(Math.random()*0x7fffffff)|0`, and Daily uses the 32-bit FNV hash. The double drops the low bits, so `% 4` is about 0.
```
Endless (10000 random seeds): {"1":9988,"2":0,"3":7,"4":5}
Daily (365 days of 2026):     {"1":363,"2":0,"3":1,"4":1}
small seeds 1..1000:          {"1":250,"2":250,"3":250,"4":250}   (why tests with small seeds pass)
with Math.imul:               {"1":2533,"2":2501,"3":2447,"4":2519}
```

**Impact.** A recent feature does nothing. Mood also changes gameplay through `lighting.visionMul` (night shortens sight), so Endless and Daily never get the night rules.

**Fix.** `1 + (Math.imul(seed >>> 0, 2654435761) >>> 0) % 4`. The class to audit is any hash that uses `*` on 32-bit values; I found no other instance.

**Regression test.** Mood histogram over 1000 seeds of 0x7fffffff magnitude: each mood should get more than 15%.

**OTA-safe:** yes.

## B-5 (S3): floodlights can never light the centre lane (|x| ≤ 0.55 m), which covers about 85% of each route; tracking re-aims instantly
**Confidence:** confirmed by repro (`floodlight_lane.ts`, `darkband.ts`, both using the real `LightTower.ts`).

**Evidence**
- `LightTower.ts:211`: towers stand at x = ±9.6. `BEAM_FOOTPRINT_OFFSET` is 5 and `LIGHT_FOOTPRINT_R` is 4 (`:20-21`), so the lit area spans 1 to 9 m from a tower.
- A brute force over every angle, z and tower gives: `player x positions NEVER lit by any tower: -0.55 .. 0.6`.
- `darkband.ts`: on stages 8, 12, 16 and 22, the never-lit band is walkable for **85-86%** of the segment length (30 seeds each). Spawn is at x = 0.
- Tracking (`:192-197`) snaps `scanAngle` to the player with no turn-rate limit. Once tracked, the player stays lit anywhere 1 to 9 m from the tower, whatever they do. The jump on acquisition is up to about 53° in one frame (asin(4/5)).

**Impact.** The floodlight mechanic, including the stage-8 tracking and the night "lights give you away" rule, is trivially avoided by walking up the middle. Near the fences it is near-inescapable. Tracking pops visibly.

**Fix**
- Option 1: set `BEAM_FOOTPRINT_OFFSET` so offset + radius ≥ 9.6 + 0.5 (for example offset 6.5).
- Option 2: alternate the tower x offset per row.
- For tracking, clamp the angular speed (for example 1.2 rad/s), so a sprint can break the lock and the beam visibly swings onto the player.

**Regression test.** A node test asserting that every x in [-8.55, 8.55] can be lit by some tower angle.

**OTA-safe:** yes.

## B-6 (S4): a leashed dog cannot keep up with its handler
**Confidence:** confirmed (`e11_dog.mjs` part b).

**Evidence.** `Dog.ts:309`: in leash the dog follows at `DOG_PATROL_SPEED` = 2.2 m/s. The handler moves at 4.0 in investigate, 5.0 in chase and 2.4 in return. Repro, handler investigating: dog-to-handler distance 3.3 → 6.9 → 10.4 → 12.3 m over 10 s, while the dog stays in `leash`.

**Fix.** Leash speed should be `max(2.2, handlerSpeed + 0.5)`, or a catch-up multiplier based on distance.

**OTA-safe:** yes.

## B-7 (S4): collision resolution sticks at the fence and on round props
**Confidence:** confirmed (`e6_player_collision.mjs`, `e7_fence_pinch.mjs`, `e8b_stuck.mjs`).

**Evidence**
- `PlayerController.ts:105-120` tests obstacles at the **unclamped** `nx`. `:162` then clamps x to ±8.55, which can leave the player inside a prop that pokes past the fence.
- While the player overlaps a prop, every move is rejected and the push-out is undone by the clamp.
- Random-walk bot: penetrations up to 0.097 m, always at x = ±8.55. Pinch repro on 4 seeds, with the distance moved in each of 8 directions after pinching: `"0.02 5.19 10.5 3.71 0 0 0.02 0.02"`. Five of the eight directions are frozen until the player steers into the yard.
- Separately, axis-separated X-then-Z resolution has no tangential slide. A bot pushing straight +z against the flank of a tree (r 0.5) stayed at `p=3.46,39.32` for 280 s.
- No out-of-bounds positions and no permanent locks were found.

**Fix.** Clamp `nx` before the obstacle tests, and run the push-out after the clamp with the clamp folded in. Project the velocity onto the contact tangent so the player slides along curved and rotated surfaces.

**Regression test.** Unit test: a prop at the fence; a diagonal sprint into it must not end overlapping, and moving along the fence must keep making progress.

**OTA-safe:** yes.

## B-8 (S4): the Daily is not the "same run for everyone"
**Confidence:** confirmed (`e3_daily_determinism.mjs`).

**Evidence**
- The world is identical (`worldHash` equal: props, pickups, guard homes, weather).
- Guard traces under identical input differ: `-6.95,46.03 ...` vs `-2.45,43.58 ...`. The cause is `Math.random` in `GuardAI.ts:95-96`, `:132-133`, `:239-240` and `Dog.ts:265`.
- The weather toggle changes the rules (`Game.tsx:652`, `:1856-1861`). With weather off, a rain Daily becomes clear with ×1.10 vision instead of rain's ×0.5 noise.

**Fix.** Give each guard and dog its own PRNG seeded from (seed, id) and pass it to `rngTarget`, `pickSearchPoint`, hearing error and dog wander. Apply Daily weather modifiers regardless of the visual toggle.

**OTA-safe:** yes. Bump `DAILY_RULES_VERSION`.

## B-9 (S4, design check): the yard alarm survives a soft respawn although guards are wiped
**Confidence:** confirmed (`e2_alarm_after_catch.mjs`).

**Evidence.** `resolveCatch` (`Game.tsx:1202-1300`) resets guards, dogs and smoke but not `alarmLevel` (`:872`). Repro: alarm 0.99 before the catch and 0.99 after respawn, with every detection at 0. The next camera glimpse fills it to 1 within about 0.1 s, so every guard converges and a reinforcement is dispatched.

**Fix.** Reset or halve `alarmLevel` in `resolveCatch` and mirror it to the store. Alternatively, document it as intended.

**OTA-safe:** yes.

## B-10 (S4): perception inconsistencies (by code)
- **Cameras see through smoke.** `cameraSeesPlayer` (`Camera.ts:120-134`) has no smoke input.
- **Floodlights light through smoke.** `isPlayerLit` has no smoke input; combined with B-1, standing in smoke inside a beam still pumps every meter.
- **The crowbar ignores walls.** `applyCrowbarStun` (`Game.tsx:231-255`) picks the nearest guard within 3 m with no line-of-sight test, so it hits through a dumpster or the fork hedge wall.
- **Fix:** pass `smokeRegions` to the camera and light checks, and add `clearLine(..., 0.8)` to the crowbar targeting and its ring.
- **OTA-safe:** yes.

## B-11 (S4): a rock or radio cue does not extend an investigation already under way (by code)
`hearNoiseAt` (`GuardAI.ts`) on a guard already in `investigate` only moves the target and leaves `behaviorTimer` alone. The rock floor of 0.42 (`Game.tsx:1767`) decays below 0.4 within a frame or two. A guard 20 s into an investigation therefore abandons the rock spot about 1 s later. The same applies to the tier-3 radio call-outs.

**Fix.** Reset `behaviorTimer` in `hearNoiseAt`, for example `g.behaviorTimer = Math.min(g.behaviorTimer, INVESTIGATE_TIMEOUT_S - 6)`.

**OTA-safe:** yes.

## Balance notes (S4, data, not defects)
Guard-blind bots following A* to the win line (`e8_bot.mjs`, 3 seeds per stage, `e8_bot.out`):
- **Crouch-walk** wins stages 1-5 in 12 of 15 runs, often with 3 stars and `seen=0`. Two runs were bot snags (B-7). Crouched vision fills at about 0.04-0.08/s on stage 1, so crouching is close to invisibility early on.
- **Sprint** is not dominant. It wins 7 of 12 runs on stages 1-4 and only 4 of 66 from stage 5 on (stamina, tier-2 AI, dogs).
- **Hearts cliff:** from stage 21 every death comes at the first guard post, at z ≈ 48-60 (1 heart). From stage 11, mostly 2 hearts.
- **Boss arena** (`e4_boss_camp.out`): sitting motionless and crouched survives 60 s in 0-30% of seeds, so it is not trivially campable.

## What is solid (verified)
- **Fixed-step loop.** `Loop.ts` runs at 60 Hz with a 0.1 s clamp. `update(dt)` is step-size independent: time to investigate, aim and first shot is 2.60/8.77/10.13 s at 30 fps, 2.57/8.77/10.15 s at 60 fps and 2.57/8.78/10.18 s at 120 fps (`e12_dt.mjs`).
- **Procgen walkability.** 4050 campaign segments (stages 1-29 × 150 seeds, real density and fork plans) plus 24 Endless runs to 3700 m with `trimBefore`: **0 unwalkable segments and 0 of 34,606 pickups unreachable**, checked with an exact-collision oracle (`procgen_stress.ts`, `procgen_stress_big.out`). The guard nav grid also connects spawn to the win line in 891 of 891 segments (`narrow.ts`).
- **Guard navigation.** 1716 random investigate orders across stages 1-27 gave 0 frames inside props, 0 out of bounds and 1 order without progress (`e5_guard_nav.out`).
- **Player collision.** No out-of-bounds positions and no tunnelling; the maximum overlap is 0.1 m, at the fence only.
- **Catch and win flow.**
  - A `pendingCatch` guard stops double hits; hit-stop freezes the sim.
  - The win check comes before bullets and contact.
  - The boss clock ticks in real time and does not tick in pause or hit-stop; it re-arms on restart.
  - A failed boss round retries with fresh hearts.
- **Endless respawn and backtrack.** These cannot place the player inside props: the respawn uses the guard grid with inflate 0.7, and the backtrack line trails `maxZ` by 30 m.

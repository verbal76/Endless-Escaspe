> Read-only analysis at commit 02e13eb (OTA 131). Nothing here is implemented. Re-verify line references against the current code before acting; balance numbers predate several gameplay fixes.

# H: Balance evidence and instrumentation plan (stage 21+ difficulty, crouch-walk strength)

No balance change is proposed. Numbers below were computed from the code at HEAD 02e13eb (a one-off node script over `src/util/progression.ts` and `src/scenes/Lighting.ts`, read-only) and from `$SP/review2/B/B.md` + `B/e8_bot.out` (bots on the frozen 370a624 build, 3 seeds per stage). Some B.md findings are already fixed at HEAD (floodlight/dog feeds are now positional via `externalFeedFor`, `DetectionSystem.ts:134`; pause no longer clears bullets, `Game.tsx:1552`; alarm resets on respawn, `Game.tsx:1250`; mood hash uses `Math.imul`, `runRules.ts:14`); the bot table predates those fixes and should be re-run.

## 1. Current numbers

### 1a. Detection model (`DetectionSystem.ts`)

- Vision cone 60 degrees (`geometry.ts:19`), half-angle test in `guardCanSee` (`DetectionSystem.ts:121`). Sight is blocked by smoke or by props at least 0.3 m tall when the player is crouched, 1.0 m when standing (`:11-12`).
- Vision gain per second in view: `(0.5 + 0.6 * (1 - d^2/R^2)) * stanceScale * rateScale` (`:191-193`), `stanceScale` 0.45 crouched, 1.0 otherwise. In view there is no decay (`:211`).
- Out of view: meter decays at `decay`/s; noise and external feeds must beat decay, and cannot lift the meter above `NON_VISUAL_CAP = 0.75` (`:17, 218-220`). Only real sight pushes past 0.75 into chase (`TH_CHASE = 1.0` needs `senses.visual`, `GuardAI.ts:294`).
- Noise: only while moving (`isMoving`, `:35`). Radius = sqrt(rangeSq) x 1.35 if running x clamp(weather, 0.6..1.2) (`:42-48`). Rate at zero distance: walk 0.4/s, run 0.8/s, crouch 0.15/s, crouch+run 0.3/s (`:28-33`), falling linearly to the radius. `PlayerController.ts:227-229` turns crouch+run into standing, so crouch+run does not exist in practice.
- Thresholds (`GuardAI.ts:59-66`): alert 0.18, investigate 0.40, chase 1.0, lose chase below 0.50, fire at 0.85, aim time 0.7 s. Guard speeds (`:25-29`): wander 1.6, alert trail 1.8, investigate 4.0, chase 5.0, return 2.4 m/s. Investigate timeout 21 s (`:49`).
- Body contact: any non-stunned guard within 0.6 + `PLAYER_RADIUS` 0.45 = 1.05 m is an arrest in **any** AI state (`Game.tsx:2225-2236`). Dogs likewise (`dogHits`, `Game.tsx:2167`); razor wire touch (`Game.tsx:1705-1709`, from stage 14).
- Player speed (`geometry.ts:15-16`, `PlayerController.ts:26-31`): walk 3.5, crouch 2.275, run doubles (7.0 / 4.55). Stamina from stage 5: drain 0.30/s (full pool 3.3 s), regen 0.15/s, run re-enables at 0.3 (`:37-40`).
- Slow-mo close call (detection >= 0.8 and a guard within 8 m, `timeScale 0.5`) only below stage 12 (`progression.ts:180`, `Game.tsx:1636-1653`).

### 1b. By stage (`progression.ts`, with mood vision multiplier from `Lighting.ts`)

| Stage | Vision range m | Rate scale | Decay/s | Noise radius walk / crouch m | Hearts | Guards | Towers rows | Dogs | AI tier | Stamina | Slow-mo | Razor wire | Mood vision x |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6.00 | 0.167 | 0.150 | 9.0 / 5.0 | 3 | 2 | 3 | 0 | 1 | off | on | off | 1.00 |
| 5 | 8.94 | 0.248 | 0.111 | 11.0 / 6.0 | 3 | 2 | 3 | 0 | 1 | on | on | off | 0.82 |
| 10 (boss) | 11.23 | 0.312 | 0.080 | 12.5 / 6.7 | 2 | 3 | 4 | 1 | 2 | on | on | off | 0.82 |
| 12 | 11.72 | 0.326 | 0.074 | 12.8 / 6.9 | 2 | 3 | 4 | 1 | 3 | on | off | off | 0.88 |
| 15 | 12.00 | 0.333 | 0.070 | 13.0 / 7.0 | 2 | 4 | 5 | 1 | 3 | on | off | on | 0.82 |
| 18 | 12.00 | 0.333 | 0.070 | 13.0 / 7.0 | 2 | 4 | 5 | 2 | 4 | on | off | on | 0.82 |
| 20 (boss) | 12.00 | 0.333 | 0.070 | 13.0 / 7.0 | **1** | 5 | 5 | 2 | 4 | on | off | on | 0.82 |
| 21-30 | 12.00 | 0.333 | 0.070 | 13.0 / 7.0 | **1** | 5 | 5 | 2 | 4 | on | off | on | 0.82-0.95 |

Everything that is continuous plateaus at stage 15 (`rampConcave(..., plateauAt = 15)`: vision, rate, decay, noise; floodlight rates and light bonus at 18, segment length 1.8x at 18). **Nothing in the detection model changes between stage 15 and stage 30.** The only discrete changes after 15 are: AI tier 4 (aim lead 0.25 s, `Game.tsx:2075-2079`) at 18, guard count 5 at stage 19 (`stepCount(2, +1 per 6, cap 5)`), **hearts 2 -> 1 at stage 20** (`startingHeartsFor`, `progression.ts:97-102`) and the mood rotating (its vision multiplier is 0.82-0.95 over 21-30, never below the 0.82 already used at stage 15).

Time for vision alone to fill a meter from 0 to chase (1.0) for a player standing still in the cone (computed from the formula above):

| Stage | d = 0.25 R | d = 0.5 R | d = 0.9 R |
|---|---|---|---|
| 1 (R 6.0 m) | 5.7 s stand / 12.6 s crouch | 6.3 / 14.0 | 9.8 / 21.7 |
| 5 (R 8.9) | 3.8 / 8.4 | 4.2 / 9.4 | 6.6 / 14.6 |
| 10 (R 11.2) | 3.0 / 6.7 | 3.4 / 7.5 | 5.2 / 11.6 |
| 15+ (R 12.0) | 2.8 / 6.3 | 3.2 / 7.0 | 4.9 / 10.9 |

(Detection is a long time in the cone. A guard walking 1.6 m/s needs about 7 s to cross half of a 12 m cone, so a crouched player is rarely seen long enough to be chased; a sprinting player at 7 m/s is beside the guard in about 1.7 s.)

## 2. Why bots die at stage 21+ (evidence, not conjecture)

Data: `B/e8_bot.out`, bots follow an A* line to the win and are **blind to guards** (they never dodge), 3 seeds per stage, summed by band:

| Strategy | Stages 1-5 | 6-10 | 11-19 | 21+ |
|---|---|---|---|---|
| sprint | 7 / 15 win | 2 / 12 | 2 / 27 | **0 / 27** |
| crouch-walk | 12 / 15 win (2 timeouts = bot snags, B-7) | 3 / 12 | 0 / 27 | **0 / 27** |

At 21+ every run ends at the **first** catch: sprint dies at t = 9-16 s, crouch at t = 21-42 s, always with `hearts=1 lost=1` and at z of about 47-57 or 79-83 (identical across stages and seeds, so it is the same early encounters). `seen` is 0 or 1 and `timeDetected` is 0.1-5 s in most of those deaths (e.g. sprint stage 21 seed 502: `seen=0 det=0.4s`, arrested at z53). The same bots at stages 11-19 also die at the same z-bands but need **two** catches (`hearts=2 lost=2`, t = 21-84 s).

Reading: the 21+ "cliff" is not a detection-curve change (section 1b shows none after 15). It is (a) hearts 2 -> 1 at stage 20, which converts "died after two body-contact arrests" into "died after one", and (b) bots that cannot avoid body contact (arrest radius 1.05 m, any AI state, `Game.tsx:2225-2236`) meeting guards patrolling around z 47-83. The data therefore says nothing yet about how a *human who dodges* fares at 21+; it shows only that a straight-line player does not survive one contact there. At stage 10-19 the same bots die too, so the stage-21 boundary in the table is the hearts rule, not the AI.

Other contributors visible in the code: five guards per 216 m segment (about 1 per 43 m) plus two dogs, tier-4 lead shots at 0.85 detection, no slow-mo, and (stage 14+) fences that cost a heart on touch (`Game.tsx:1705-1709`), all of which make a single mistake terminal with one heart.

## 3. Why crouch-walk dominates early

From the code (stage 1 values):
1. **Vision x 0.45 and 2.2x longer to fill** (table above: 12.6 s vs 5.7 s at 1.5 m).
2. **Noise cannot beat decay at stage 1.** Crouch noise rate is 0.15/s at zero distance (`DetectionSystem.ts:32`) and decay is 0.15/s (`progression.ts:72`), and the rate falls linearly with distance, so crouched noise never raises the meter at stage 1 (the comment at `:24-27` says this on purpose). It starts to matter only when decay falls: at stage 10 decay is 0.080 against a crouch noise of at most 0.15 x (1 - d/6.7).
3. **Noise radius 5 m crouched vs 9 m walking**, and zero when standing still.
4. **Cover**: a crouched player is hidden by anything 0.3 m tall (`COVER_HEIGHT_CROUCHED`), including low walls; standing needs 1.0 m.
5. **The scoring does not charge for slowness.** `timeTargetsFor` gives 3 stars within 1.7 x the straight-line walking time (`scoring.ts:25-33`: `TIME_REF_SPEED 3.5`, `TIME_FACTOR_3 1.7`). Crouch speed is 2.275 m/s, i.e. 3.5 / 2.275 = 1.54 x slower, which is inside 1.7. Stage 1 (120 m): walk reference 34 s, 3-star limit 58 s, crouch-walking straight through takes 53 s (the bot measured 53 s, `e8_bot.out` stage 1 seeds 501/502, `stars=3 seen=0 det=0s`). Only a 10 % margin (1.7 / 1.54 = 1.105) remains for waiting or detours, but the metric itself never penalises crouch-walking.
6. **Slow-mo and the 3-heart buffer** at stages 1-11 absorb mistakes that crouching would already make rare.
7. **Bots confirm it:** crouch-walk wins 12 of 15 at stages 1-5 (often `stars=3 seen=0`); sprint wins 7 of 15 (`e8_bot.out`).

What weakens crouch later (also in the code): noise rate vs decay flips from stage 5-6 (decay 0.111 -> 0.070), vision range grows 6 -> 12 m (R grows 2x, cone area 4x), AI tier 2+ guards face the last-seen spot, dogs smell at close range, and the crouch bot's win rate falls to 3/12 at stages 6-10 and 0/27 at 11-19 (but again those bots are blind to guards, which a human is not).

## 4. Evidence and instrumentation plan (sketch; read-only until authorised)

Principle: get evidence from (A) the owner's playtest with zero game changes, and (B) an offline bot harness that reuses the real update code. Both measure the same things.

### 4A. Playtest evidence with logging only (needs a Game.tsx wiring note, so it goes through the single-owner protocol in F-gametsx-decomposition.md)

Extend the existing `logDebug('log', 'handleCatch', {...})` (`Game.tsx:1165`) and `handleWin` log (`:1352`) so the bug report's "current run" section carries the death story. Fields (all already available in scope at those points):
- `stage`, `mode`, `z` (`player.z`), `runTimeS` (`tracker.runTime`), `stance` (`player.stance`, `player.isRunning`), `stamina`;
- `cause` plus a new `source` argument at the four call sites (razor wire `:1707`, dog `:2168`, guard contact `:2233`, bullet `:2214`): `'wire'|'dog'|'guard'|'bullet'`. Today the store only distinguishes `arrested|killed` (ledger D-12 notes a dog bite and razor wire both show as ARRESTED), so source is the missing variable;
- nearest guard: distance, `state`, `detection[g.id]`, whether it `visual`-sensed the player this frame (the `senses` object is in scope in the guard loop), and `maxDetection`;
- count of guards within 12 m, `alarmLevel`, whether the player was lit (`lit`), `hearts` after the hit.
At win: the `RunStats` already computed (`timesSeen`, `timeDetected`, `livesUsed`, `runDurationS`) plus the fraction of run time spent crouched, walking, running (needs a three-counter addition to `RunTracker`, `src/util/runStats.ts`, which is already outside Game.tsx and testable).
Each entry is about 150 characters; the report keeps 30 per run (`support.ts:50`). Ask the owner to press the bug-report/share button after stage 21+ attempts and after a crouch-only stage 1-5 run.

### 4B. Headless bot harness (post-playtest evidence, no device)

What exists to build on: the browser harness with `__ee.update(1/60)` stepping (`review2/B/hb.mjs`, `e8_bot.mjs`: seeded `Math.random`, deterministic, step-size independent per `e12_dt.mjs`) works **today** against a build of HEAD (`$SP/web/build.sh`). A node-only harness is also feasible because `ProcgenSystem`, `createGuard`, `updateGuard`, `updateDetection`, `updatePlayer`, `LightTower` and `ProjectileSystem` run without GL under `tests/register.mjs` (stubbed native modules; `tests/procgen.test.ts`, `culling.test.ts` do this). What the node route lacks is the glue in `Game.tsx update` (lights -> tuning -> camera alarm -> dogs -> detection pass -> guard AI -> contact), which is why decomposition step E5 (`detectionFrame.ts`) is the prerequisite: bots then call the same `runDetectionPass`/`runGuardAi`/`computeFrameTuning` that the game does, so there is no second implementation to drift. Until E5 exists, use the browser route.

Design:
- **Driver**: `for seed in S, stage in {1,3,5,8,10,12,15,18,20,21,22,25,30}, policy in P`: build the segment (`ProcgenSystem` + `createGuardConfigs` + `spawnLightTowers`/`spawnCameras` as `populateSection` does), `resetSegment` equivalent, step at 1/60 until win/death/timeout 300 s of sim, record.
- **Policies** (P):
  1. `blind-walk`, `blind-crouch`, `blind-sprint` (existing e8: A* straight line, for continuity and to re-baseline after the OTA-131 fixes);
  2. `evade-crouch`: crouch-walk, plan on `NavGrid` with a cost field around every guard's cone (60 degrees x current effective vision range) and a 3 m body-contact margin, wait when blocked; reuse cover;
  3. `evade-adaptive`: walk, crouch only inside the radius `noiseRadius` of a guard or in a lit lane, sprint only while a guard is in `chase` and an exit exists;
  4. `human-lite`: `evade-adaptive` with 250-400 ms reaction delay and 15 % input noise, to estimate a plausible human rather than a perfect bot.
- **Metrics per (stage, policy)**, with 30+ seeds each, as CSV + a summary table:
  - survival (win rate) and median run time;
  - catches per run and **cause split** (`source` from 4A: guard contact, dog, wire, bullet) and whether the guard was *aware* (state not `wander`/`return`) at contact: this separates "unavoidable cliff" (blind-side contact, as in B.md's `seen=0` deaths) from "fair" deaths;
  - time and count of detections: `timesSeen`, `timeDetected`, max meter, time from first `visual` to catch (reaction window);
  - first-contact z and which guard (fork post vs patrol; the repeated z = 47-57 / 79-83 bands in `e8_bot.out` should be traced: B.md does not say whether they are the guard post at `startZ + 15` of the chunk-2 fork, `ProcgenSystem.ts:406-407`, or patrols);
  - stance usage: fraction of time crouched / walking / running; stamina empties;
  - star outcome and time versus the 3-star limit (to quantify section 3 item 5);
  - hearts-lost timeline (to see whether the 2 -> 1 transition at stage 20 alone explains the cliff: re-run `evade-*` at stage 19 with hearts forced to 1 and at stage 21 with hearts forced to 2 as **analysis-only counterfactuals**, never shipped).
- **Outputs the owner can use after the playtest**: (1) win-rate-by-stage curves for each stance policy, (2) crouch vs walk delta by stage (where, if anywhere, crouch stops dominating), (3) share of deaths that are blind-side contacts, (4) the stage at which `evade-adaptive` first drops below, say, 50 % survival (reported as data, not as a recommendation), (5) comparison of bot numbers against what the owner's logs from 4A show, to calibrate how human-like the bots are.
- **Validation of the harness**: replay one of the owner's logged catches (stage, seed, z) and confirm the bot population has a comparable death rate near that z; compare the harness's guard states with the browser run for the same seed using the golden-trace idea from E0.
- **Cost**: about 13 stages x 4 policies x 30 seeds x up to 300 s sim is 1.5 M simulated seconds; at the measured update cost (0.3-1 ms per step on desktop) that is a few hours single-threaded, minutes with a worker pool; start with 10 seeds.

### 4C. Optional, small and independent of Game.tsx

Add `stanceTime` counters to `RunTracker` (`runStats.ts`) and unit-test them. They feed 4A and 4B and need no wiring beyond a `tracker.tickStance(player, dt)` call that the owner can add with the logging wiring note.

## 5. Questions the evidence will answer after the playtest

1. Is 21+ hard because of one heart or because of the guards? (hearts counterfactual, section 4B.)
2. Does crouch-walking dominate through stage 5, 10 or 15 for a bot that avoids guards? Where does `evade-crouch` win rate cross `evade-adaptive`?
3. How many stage-21+ deaths are body contact by an unaware guard (unfair) versus shots or chases (fair)?
4. Is the 3-star time rule (1.7 x walking time) making crouch-walking free? (section 3 item 5.)

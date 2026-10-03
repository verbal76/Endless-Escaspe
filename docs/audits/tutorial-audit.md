# Endless Escape: player-instruction audit and tutorial proposal

Repo: `/home/user/Endless-Escaspe` at `c3278a7`. This is a read-only audit: no repository file was changed.
All paths below are relative to the repo root. "Stage" means a campaign stage. "Level" means the Endless/Daily difficulty level, which is `1 + floor(z / 120 m)` (`src/game/Game.tsx:611`).

---

## 1. Sources inventory (every place that teaches the player)

| # | Source | Where | Trigger | Content |
|---|---|---|---|---|
| S1 | Intro cutscene (6 beats) | `src/components/HUD/Tutorial.tsx:94-119` (text), `:86-91` (timing) | NEW RUN when the global `tutorialSeen` is false (`StartScreen.tsx:327-328`, prompt `:572-605`). Also "HOW TO PLAY" on the home screen (`StartScreen.tsx:466-470`) | 6 text cards over a 2D top-down animation. The 4 animated beats are walk, spotted, cover and caught (`Tutorial.tsx:198-252`). The last 2 cards are text only. Total 3.5+4+4+4.5+5.2+5.2 s plus a 1.3 s outro = **27.7 s**. SKIP is always available (`:325-335`). |
| S2 | Tutorial prompt | `StartScreen.tsx:575-578` | Same as S1 | "Quick demo?" / "Show you the basics in about 30 seconds, or jump straight in?" with SKIP / SHOW ME |
| S3 | HOW TO PLAY link | `StartScreen.tsx:466-470` | Home screen only | Replays S1. There is no reference text of its own. |
| S4 | Stage-start tips | `src/util/stageTips.ts:25-55`, picked by `stageStartTip` (`:61-72`) and queued in `Game.tsx:962-971` | Campaign only, 1.2 s after segment start (`Game.tsx:1001`). Shown at most once per save (`Save.tipsSeen`). Stage map: 1,2,3,4,5,6 → stage1..6; 8 → dogs; 10 → boss; 14 → razor | Toast text in `TIPS` |
| S5 | Contextual tips | `stageTips.ts:32-42` | First pickup of each kind (`Game.tsx:1619`); within 12 m of a fork (`:1536`); first guard aim wind-up (`:1962`); cameras present at segment start (`:969`); Endless/Daily start (`:967`) | crowbar / smokebomb / rock / fork / aimed / cameras / endless / daily |
| S6 | Tip delivery | `Game.tsx:936-994`, `src/components/HUD/Toast.tsx:14,29-53` | One tip at a time. There is a 4 s cooldown between tips. A tip counts as "seen" after 2 s on screen. The toast stays up 2.6 s (`HOLD_MS`). | — |
| S7 | Boss modal | `Game.tsx:1452-1470` | Campaign stage %10 == 0, when the arena starts. The game pauses. | "BOSS ROUND / Stage N is a boss arena. Survive 60 seconds inside the enclosed yard. Lose all your hearts and you retry the round - you only advance by surviving it." |
| S8 | Warn toasts | `Game.tsx:1169`, `:1831` | Boss failure; camera alarm fills | "Boss round failed - try again. Survive the timer to advance." / "ALARM! A guard has been dispatched" |
| S9 | Post-run card | `src/components/HUD/Banner.tsx:86-212` | Stage cleared / caught / Endless over | Titles YOU MADE IT! / ARRESTED / KILLED / RUN OVER / DAILY RUN OVER. Stats rows (Times spotted, Time detected, Run time, Lives used, Coins). Buttons NEXT SEGMENT / MAIN MENU / RUN AGAIN. |
| S10 | Catch flash | `src/components/HUD/CatchFlash.tsx:55` | Every heart lost | "ARRESTED" (touch / dog / razor wire) or "KILLED" (bullet) |
| S11 | Control labels | `ActionButtons.tsx:25-28` (CROUCH, WALK); `RunButton.tsx:207` (RUN, a toggle); `PickupBag.tsx:35,41,93` (CROWBAR, SMOKE, THROW, each with a count); `LookButtons.tsx:241,246` (‹ ›, hold to look 45°); Joystick (floating, left ~42% of screen, faint rest ring, `Joystick.tsx:15-30`); pause gear ⚙ (`SettingsScreen.tsx:213`) | Always during play | Labels only. The meaning of each control is never explained. |
| S12 | HUD labels | `AlarmBar.tsx:65` "YARD ALARM"; `BossTimer.tsx:28` "SURVIVE"; `Hearts.tsx:106` "BOSS PERK · N"; `DistanceHud.tsx:16-19` "N m / [DAILY day •] LEVEL N"; `StaminaBar.tsx` (no label) | Contextual | Labels only |
| S13 | Mode buttons | `StartScreen.tsx:735-757` (profile screen) | Profile screen | "ENDLESS / best N m", "DAILY RUN / today N m / new today", "OUTFITS / N coins". **No description of any mode.** |
| S14 | Outfit shop | `StartScreen.tsx:670,693`; coin modal `:369-373` | Outfits screen | "N coins · cosmetic only"; "WEARING / TAP TO WEAR / N coins"; "Not enough coins / Earn coins by clearing stages (more stars pay more) and by going the distance in Endless and Daily runs." |
| S15 | Pause panel | `SettingsScreen.tsx:236-300` | Pause | RESUME / RESTART / LOAD RUN / MAIN MENU; Volume, Music, "Weather effects: Rain / snow active \| Off (AI senses boosted) [- from the next stage]". **No controls or rules reference.** |
| S16 | Home tagline | `StartScreen.tsx:441` | Home | "Prison yard, no exits, all sirens." (flavour only) |
| S17 | README "How it plays" | `README.md:6-14, 20-40` | Store / repo readers | Mode summary, coins, and 10 rule bullets |

No other player-facing teaching strings were found. I grepped `src/components`, `src/util` and `src/game` for quoted sentences, `showToast`, `setGameModal`, `tip`, `hint`, `title:` and `body:`.

---

## 2. Mechanics table (the real behaviour, where it first appears, a class, and current coverage)

Classes: **A** = must be explained before or when first needed. **B** = better taught in context during early play. **C** = How to Play / reference. **D** = self-explanatory.

| Mechanic | Real behaviour (evidence) | First appears | Class | Current coverage |
|---|---|---|---|---|
| Movement / floating joystick | The stick centres where the left thumb lands, in the left ~42% of the screen, with a faint ring at rest (`Joystick.tsx:15-30`). Radial dead zone 15 %, rescaled (`InputSystem.ts:54-69`). Walk 3.5 m/s, crouch 2.275 m/s (`util/geometry.ts:23-25`). | Stage 1 | A (one line) / D | **None** |
| RUN toggle | A tap **toggles** RUN (`RunButton.tsx:172-176`). It doubles the *current* stance speed, so crouch-run = 4.55 m/s and walk-run = 7 m/s (`PlayerController.ts:84`). Exhaustion switches it off (`:72-76`). | Stage 1 | A | Only the button label. Intro S1 beat 5 says "RUN uses stamina". |
| Stamina | Only a sprint (RUN while moving) drains it, at 0.30/s, so a full bar lasts ~3.3 s. It regenerates at 0.15/s. At zero you are "exhausted" and RUN is locked until the bar is back to 30 % (~2 s) (`PlayerController.ts:29-32,50-79`). The bar has no label (`StaminaBar.tsx:13`). | Stage 5 (`progression.ts:161-163`); Endless level 5 (≈480 m) | B | Stage-5 tip (correct). Intro beat 5 (early). Not taught in Endless. |
| Stances CROUCH / WALK | There are 2 stances (`types/world.ts:113`). A crouched player fills a guard's meter at 0.45× the rate (`DetectionSystem.ts:155`), uses the crouch hearing range (`:44`), is hidden by props ≥ 0.3 m tall (`:114`), and lets dogs get closer before they charge (`Dog.ts:116-117`). | Stage 1 | A | Only "CROUCH to sneak quietly / move almost silently" (noise). **The visibility benefit is never taught.** |
| Guard vision cone | 60° cone (`geometry.ts:34`). Range 6 m at stage 1, rising to 12 m by stage 15 (`progression.ts:37-39`). No sight outside the cone. Stunned guards are blind (`DetectionSystem.ts:108-116`). The cone is drawn as a flashlight beam scaled to the real range (`Game.tsx:2187-2189`). | Stage 1 | A | Intro beat 0 and stage-1 tip (correct) |
| Cover (directional, stance-dependent) | Line of sight is blocked only by a prop **on the sight line** whose height is ≥ 1.0 m when standing or ≥ 0.3 m when crouched (`DetectionSystem.ts:11-12,114-115`; `collision.ts:207-226`). Low walls are 0.6 m, so they hide you **only when crouched**. Every other prop is ≥ 1.0 m (`scenes/Obstacles.ts:88-101`). The "tucked-in" pose shows only when crouched near cover and unseen (`HideSystem.ts`, `Game.tsx:1968`). | Stage 1 (1-5 cover props per chunk, `progression.ts:191-198`) | A | Intro beat 2, stage-3 tip, README. **All three omit the crouch / low-wall rule.** README and intro say "Tall props". |
| Detection meter (ring of dots) | 12 dots at the player's feet show the **highest** meter across all guards (`Game.tsx:2195-2202`). Colours: yellow < 0.5, orange 0.5-0.85, red ≥ 0.85 (`RadialMeter.ts:46-50`). Guard states by meter: alert at 0.18, investigate at 0.40, chase at 1.0 but only with eyes on, chase dropped below 0.5 (`GuardAI.ts:58-61,273-282`). Without line of sight the meter always decays: 0.15/s at stage 1, 0.07/s at 15+ (`progression.ts:71-73`; `DetectionSystem.ts:182-184`). Non-visual sources (noise, floodlights, dogs) are capped at 0.75, so they can never cause a chase (`DetectionSystem.ts:17,183`). | Stage 1 | A | Intro beat 1: "In a cone, the ring… fills" (incomplete: other sources fill it too). The "noise alone never causes a chase" rule is only in the README. |
| Threat arrows / "!" markers | Ground arrows point toward guards that are building a meter (`ThreatArrow.ts:4-8`; `Game.tsx:2216-2229`). "!" above a guard is yellow while searching, red while chasing or stunned, orange while in smoke (`GuardStateMarker.ts:19-24`; `Game.tsx:2008-2038`). | Stage 1 | B / D | Not taught (the intro shows a "!" pop without naming it) |
| Shooting | A guard fires only if it sees you, its meter is ≥ 0.85 (red), and the bullet line is clear of props ≥ 0.8 m. Each shot follows a **0.7 s laser wind-up**; breaking line of sight cancels it. Fire cooldown 1.3 s (`GuardAI.ts:65-71,51,247-264`). Bullets pass **over** low walls (0.6 m < 0.8 m, `ProjectileSystem.ts:54,71`). From stage 18 guards lead their shots (`Game.tsx:1947-1951`; `progression.ts:149-155`). | Stage 1 | A (the wind-up is too short to read a toast in time) | Intro beat 1, `aimed` tip (fires at the first wind-up, which is too late to read), README ("Props stop bullets", inaccurate for low walls) |
| Noise and the noise ring | Standing still is **silent** (`DetectionSystem.ts:42-43`). Hearing radius: walk 9 m → 13 m, crouch 5 m → 7 m (stage 1 → 15), ×1.35 when running (`progression.ts:77-84`; `DetectionSystem.ts:46`). Noise rate: walk 0.4, walk-run 0.8, crouch 0.15, crouch-run 0.3 per second (`:28-33`). Props do not muffle. A guard hears only a rough bearing (±25 % of distance) (`GuardAI.ts:79-80,236-243`). The ring shades from blue to amber with loudness (`StealthCues.ts:37-63`). Rain ×0.5 (radius clamp ≥ 0.6) (`Weather.ts:212-213`; `DetectionSystem.ts:47`). | Stage 1 | A | Intro beat 4 and stage-2 tip. "Standing still = silent" is not taught. "Almost silently" overstates later stages. |
| Floodlight towers | 3-5 rows of paired towers (`progression.ts:115-117`). Standing in a beam feeds **every** guard's meter, with no line of sight needed (standing 0.15-0.36/s, crouched 0.06-0.156/s, ×1.6), up to the 0.75 cap. It also extends guard vision by 10-35 % (`Game.tsx:1754-1797,1884`; `progression.ts:44-58`). At night guards see 5-18 % less, except when you are lit (`Lighting.ts:65-91`; `Game.tsx:1783-1788`). From stage 8, towers **track** you and after 2 s lock on for a +0.4 jolt to all meters (`Game.tsx:535,1757-1765`; `LightTower.ts:192`). | Stage 1 (tracking from stage 8) | B | **Not taught.** Intro title "Stay out of the light" is about guard flashlight cones, so the word "light" is ambiguous. README mentions floodlights only for night. |
| Guard memory / last-seen | A chasing guard runs to the last sighting, not your live position, and drops to searching after reaching it or after 4 s (`GuardAI.ts:348-361`). The guard believes whichever is newer: last seen or last heard (`:165-168`). A search covers a 6 m radius for up to 21 s (`:43-48`). From stage 6 a guard scans the last-seen spot for 1.6 s (`:72-75,232-235`). From stage 12 a chasing guard radios guards within 20 m, who investigate its last sighting (`Game.tsx:1924-1934`). | Stage 1 / 6 / 12 | B (stage 6), C | Stage-6 tip (correct). README. Stage 12 radio not taught. |
| Guard touch | **Any** non-stunned guard touching you costs a heart, even one that is just patrolling (`Game.tsx:2090-2105`). | Stage 1 | A | Intro beat 3 ("A guard's touch") |
| Hearts / respawn | Starting hearts: 3; 2 from stage 10; 1 from stage 20 (`progression.ts:97-102`). Endless/Daily always start with 3 (`Game.tsx:1099-1101`). A lost heart sends you back to the start in campaign, or 20 m back in Endless (`Game.tsx:1146-1156`). Pickups are **kept** after a catch (`Game.tsx:1225-1227`). Last heart: campaign run ends (`:1180-1188`); boss arena makes you retry (`:1164-1170`); Endless ends the run (`:1171-1174`). | Stage 1; fewer hearts at 10/20 | A (basic), B (reductions) | Intro beat 3 (basic). **The 2 / 1 heart reductions are not taught.** |
| Pickups (source) | Every chunk except the first rolls 0-2 pickups: 35 % crowbar, 40 % smoke, 25 % rock (`ProcgenSystem.ts:229-256`). A fork's danger lane always holds a rock plus a random pickup (`:449-454`). **From stage 1.** The inventory resets every segment (`store.ts:156-159,474`). | Stage 1 | B | Contextual tip on first pickup (good). The stage-4 tip claims pickups start at stage 4. |
| Crowbar | Reach 3 m for guards, 3.5 m for dogs. Stuns the **nearest** guard for **4 s**; every dog in reach flees for 4 s (`Game.tsx:214-220,229-250,1645-1665`; `Dog.ts:326-331`). **A swing into empty air still uses the crowbar** (`Game.tsx:1647`). The slot glows and a target ring appears when something is in reach (`Game.tsx:1977-1998`; `PickupBag.tsx:180`). | Stage 1 | B | Crowbar tip, intro beat 5 ("knock out", with no duration). The waste-on-miss rule is not taught. |
| Smoke bomb | Dropped at your feet: 3.5 m radius, 5 s (`SmokeCloud.ts:14-15`; `Game.tsx:1693-1697`). Blocks guard sight lines that start in, end in or cross the cloud (`DetectionSystem.ts:71-95,113`). Does **not** block noise or **cameras** (`Camera.ts:120-135`: no smoke check). Dogs lose the scent and are confused for 3.5 s (`Dog.ts:235,249-255`). | Stage 1 | B | Smoke tip ("blocks every sight line": wrong for cameras), intro beat 5 |
| Rock (THROW) | Lands 9 m ahead in your **last movement direction** (`ThrownRock.ts:9`; `Game.tsx:1665-1674`). Every non-chasing, non-stunned guard within 14 m investigates the landing spot, with its meter set to at least 0.42 (investigate, never chase) (`ThrownRock.ts:12`; `Game.tsx:1679-1691`). | Stage 1 | B | Rock tip (correct). **Missing from the intro and the stage-4 tip.** |
| Forks | From stage 3, once per campaign segment, at chunk 2 or 3 (`progression.ts:201-204`; `Game.tsx:685`). In Endless, every 10th chunk (`:689`). Danger lane: straight, with a guard post and 2 pickups. Safe lane: a hedgerow slalom about twice as long (`ProcgenSystem.ts:341-377,449-454`; `Game.tsx:500-514`). | Stage 3 | B | Fork tip (the reward is not mentioned). README. |
| Dogs | Leashed to a handler (`Game.tsx:517-528`). Within 9 m a dog's smell feeds the handler's meter (`Dog.ts:93-99,317-320`). It charges when you are ≤ 3.8 m away standing / 2.2 m crouched, or when its handler chases (`:114-117,238-242`). Speed 5.6 m/s: faster than walking or crouch-running (4.55), slower than a sprint (7) (`:101-104`). It gives up beyond 15 m or after 6 s (`:108-113,257-261`). Smoke confuses it; a crowbar makes it flee (`:249-255,326-331`). A bite costs a heart (`Game.tsx:2044-2050`). | Stage 8 (1 dog), 2 from stage 16 (`progression.ts:127-132`); Endless level 8 (≈840 m) | A (at stage 8) | Dogs tip (good, but "Sprint" should be clear that crouch-run is too slow). **Never shown in Endless.** |
| Cameras / yard alarm | 70° cone, 11 m range, blocked by cover like guard sight, **not blocked by smoke** (`Camera.ts:16-19,120-135`). The alarm fills at up to 0.10/s and drains at 0.04/s (`:18-19,140-158`). When full: 1 reinforcement guard is sent (max 2 per segment), every guard investigates your spot, and guard vision is +25 % while the alarm stays full (`Game.tsx:900-934,1826-1842`). | Stage 10 arena (≥ 4 cameras), then stage 11+: 2 / 4 from 16 / 6 from 22 (`Camera.ts:162-168`; `Game.tsx:541`); Endless level 10 (≈1080 m) | A (at first sight) | Cameras tip, queued only at **segment start** (`Game.tsx:969`), so **Endless players never get it**. The tip omits how to avoid cameras. |
| Razor wire | Touching the side fence costs a heart (`Game.tsx:1591-1599`; `Fence.ts:218-231`). From stage 14 it applies to **every** segment (`progression.ts:137-139`; the comment at `:134-136` about "a fraction of segments" is stale). Endless from level 14 (≈1560 m). | Stage 14 | A | Razor tip (campaign only). Intro beat 3 mentions it early. |
| Weather | Snow: +10 % guard vision. Rain: noise ×0.5 (`Weather.ts:209-213`). Turning weather off gives +10 % vision always (`Game.tsx:1775-1780`). From stage 15, campaign weather is always rain or snow (`Game.tsx:647-652`). Lightning and footprints are visual only. | Stage 1 (random) | C | Pause-panel sub-label only (correct) |
| Lighting mood | One mood per stage: day → deep night, darker in later blocks of 5. Vision ×1.0/0.95/0.88/0.82 (`Lighting.ts:27-106`). Endless/Daily are always daylight (`Game.tsx:610`). | Stage 3 (dusk) | C | README only |
| Slow-motion close call | Half speed when a guard with meter ≥ 0.8 is within 8 m. Off from stage 12 (`Game.tsx:1553-1567`; `progression.ts:180-182`). | Stage 1 | D | None (fine) |
| Stars | 4 metrics, each worth 0 / 0.5 / 1: times spotted (meter > 0.5), time detected (> 0.3), run time vs 1.7× / 2.8× the straight walking time, and lives used. The total is converted to 1-3 stars (`scoring.ts:3-52`; `runStats.ts:10-38`). Boss arena: run time always counts as full marks (`scoring.ts:32-34`). | Stage 1 | C (post-run) | **Not explained anywhere.** The post-run card shows the 4 inputs with no targets. |
| Boss arena | Every 10th campaign stage (`Game.tsx:621`). Enclosed ~48 m yard, survive 60 s on a real-time clock (`:622-623,2064-2078`). Extras: +3 guards, +1 dog, ≥ 4 cameras (`:470,519,541`). Meter fills 30 % faster and decays slower (`:1803-1809`). Losing means a retry (`:1164-1170`). Clearing grants **+1 heart for the next 10 stages** (`store.ts:375`; `Game.tsx:1104-1112,1325-1328`), shown as "BOSS PERK · N" (`Hearts.tsx:104-107`). A non-boss run-ending death clears the perk (`Game.tsx:1178`). | Stage 10, 20, … | A (modal) | Modal (correct). Boss tip (duplicate). **The perk is never explained.** |
| "Boss" guard (every 5th stage) | On stages 5, 10, 15, … the lead guard sees 50 % further (`Camera.ts:171-174`; `Game.tsx:755-758,1861-1864`). This guard has no distinct look in the code I checked. | Stage 5 | C | None |
| Coins | New stars pay 10 each, +5 on a first clear (`economy.ts:11-24`). Endless: 1 coin per 25 m. Daily: 1 coin per 20 m, +10 for the first run of the UTC day (`:13-15,26-33`). A run pays only once (`:43`). | — | C | Coin modal (roughly correct). README (misses the bonuses). |
| Outfits | Cosmetic only. Prices 0/0/120/180/240/400 (`outfits.ts:1-16`). | — | D | "cosmetic only" (correct) |
| Modes | Campaign: stages with a finish line. Endless: random seed, level +1 every 120 m, always 3 hearts, daylight, no boss perk (`Game.tsx:606-611,1099-1101`). Daily: Endless on a seed shared per UTC day and rules version (`daily.ts`). Daily RUN AGAIN replays the same seed (`Banner.tsx:182`). | Profile screen | C (plus an A-line at mode start) | Endless / daily tips at run start (correct). **No description on the mode buttons.** |
| Saves / continue / profiles | A save is created by naming it on NEW RUN. CONTINUE → list → profile with a stage board (replay any cleared stage), modes and outfits (`StartScreen.tsx:320-345,606-830`). Tips are per save; the intro flag is global (`storage.ts:38,54`). | — | D | UI labels only (fine) |
| Look arrows | Hold ‹ / › to turn the camera 45° (`LookButtons.tsx:196-221`) | Stage 1 | B / C | **None** |
| Pause | ⚙ button → pause panel | — | D | — |

---

## 3. Findings by category

Each finding has an ID so the proposal in §4 can reference it.

### 3.1 Correct instructions (keep, possibly shortened)
- **OK-1** `stageTips.ts:26` stage1: "Stay out of the guards' light cones and reach the green line." Matches `DetectionSystem.ts:112` and the win line (`Game.tsx:2079`).
- **OK-2** `stageTips.ts:30` stage5: "RUN now uses stamina. Run dry and you must recover before sprinting again." Matches `PlayerController.ts:32,52-76`.
- **OK-3** `stageTips.ts:31` stage6: "Guards now stop and scan where they last saw you before searching." Matches `GuardAI.ts:232-235,288-293`; `progression.ts:153`.
- **OK-4** `stageTips.ts:37` rock, `:40` endless, `:41` daily, `:42` aimed: all consistent with code (`ThrownRock.ts:9,12`; `Game.tsx:611`; `daily.ts`; `GuardAI.ts:69`).
- **OK-5** `Game.tsx:1458-1459` boss modal (60 s, retry on loss) matches `:623,1164-1170`. `Game.tsx:1169` failure toast and `:1831` alarm toast are correct.
- **OK-6** `Tutorial.tsx:97` "Guards see in a cone… Outside it they can't see you, but they can still hear you." Correct.
- **OK-7** `Tutorial.tsx:109` Hearts card is correct for campaign.
- **OK-8** `StartScreen.tsx:578` "about 30 seconds": the real total is 27.7 s (`Tutorial.tsx:86-91`).
- **OK-9** `SettingsScreen.tsx:297,300` "Off (AI senses boosted)" / "from the next stage" match `Game.tsx:644,1775-1780`.
- **OK-10** README bullets on memory, dogs, alarm, forks, lighting, boss and Endless 120 m are all correct (see M-5 and M-6 for the two exceptions).

### 3.2 Obsolete
- **OB-1** `stageTips.ts:29` stage4: "Grab pickups on the way: crowbars and smoke bombs." Pickups spawn from stage 1 in every chunk except the first (`ProcgenSystem.ts:241-256`), and each kind already gets its own first-pickup tip (`Game.tsx:1619`). The tip also omits **rocks**, which are 25 % of drops (`ProcgenSystem.ts:230`). It is redundant, late and incomplete.
- **OB-2** `stageTips.ts:35` boss: "Boss round: survive the timer. Lose and you must retry the round." This is fully covered by the pausing modal (`Game.tsx:1452-1470`) shown seconds earlier on the same stage (see D-1).
- **OB-3** (code comment, not player-facing) `Tutorial.tsx:16-18` says "Auto-plays four beats"; there are 6. `Tutorial.tsx:156-157` mentions a "first-launch hook" that doesn't exist; the intro is offered only after NEW RUN (`StartScreen.tsx:327`). `Obstacles.ts:25-30` says crouch needs ≥ 0.55 and "low walls don't" block; the code uses 0.3, so low walls do (`DetectionSystem.ts:11`). `RunButton.tsx:156-157` says the button is dimmed while exhausted; no dimming exists. `progression.ts:134-136` razor "fraction of segments" doesn't match `:137-139`. Fixing these would stop future text writers from being misled.

### 3.3 Misleading
- **M-1 Cover (highest impact).** `Tutorial.tsx:104-105` says "Tall props only hide you when they are between you and the guard…". `stageTips.ts:28` says "Cover only hides you when it is between you and the guard." README `:22-23` says "Tall props hide you only when they are **between**…". In the code, **low walls (0.6 m) hide you only when crouched**, and crouching lets any prop ≥ 0.3 m hide you (`DetectionSystem.ts:11-12,114`; `Obstacles.ts:90`). "Tall props" suggests low walls are useless, and nothing links CROUCH to hiding. Cameras follow the same rule (`Camera.ts:134`).
- **M-2 Detection ring.** `Tutorial.tsx:101` says "In a cone, the ring at your feet fills: yellow, orange, red. At red guards chase and aim." The ring also fills from noise, floodlights and dog smell, up to orange at 0.75 (`DetectionSystem.ts:17,182-183`; `Game.tsx:1884`). Red starts at 0.85, which is the **fire** threshold (`RadialMeter.ts:47`; `GuardAI.ts:65`); a chase starts only with a **full** ring and eyes on (`GuardAI.ts:60,273`). The intro animation uses thresholds 0.4 / 0.75 (`Tutorial.tsx:284-286`), which differ from the in-game 0.5 / 0.85. The key reassurance "without sight they can't chase you" is missing (it is only in README `:24-26`).
- **M-3 Two "rings".** Intro card 2 calls the 12-dot detection meter "the ring at your feet" (`Tutorial.tsx:101`). Card 5 and the stage-2 tip call the noise circle "the ring around you" / "the ring" (`Tutorial.tsx:113`; `stageTips.ts:27`). These are two different visuals: a dot ring at 1.6 m (`RadialMeter.ts:13`) and a variable-radius blue-to-amber circle (`StealthCues.ts:13-63`). Players will conflate them.
- **M-4 "Stay out of the light".** The title `Tutorial.tsx:96` means guard flashlight cones, but the yard also has floodlight towers with a different rule (they alert every guard without line of sight, `Game.tsx:1754-1797,1884`) that is never taught. The word "light" is ambiguous and the floodlight rule is missing.
- **M-5 Bullets.** README `:27-28` says "Props stop bullets." Only props ≥ 0.8 m stop bullets (`GuardAI.ts:71`; `ProjectileSystem.ts:54,71`); low walls (0.6 m) do not.
- **M-6 Smoke.** `stageTips.ts:36` says "blocks **every** sight line through the cloud". Cameras ignore smoke (`Camera.ts:120-135`; `Game.tsx:1817` passes no smoke regions).
- **M-7 Crowbar "knock out".** `Tutorial.tsx:117` and `stageTips.ts:36` say "knock out a guard". It is a 4 s stun (`Game.tsx:220`), and a miss still spends the crowbar (`Game.tsx:1647`).
- **M-8 Crouch "almost silently".** `Tutorial.tsx:113` "CROUCH to move almost silently". At stage 1 crouch noise (0.15/s) only matches decay (0.15/s), but decay falls to 0.07/s by stage 15 (`progression.ts:71-73`), so crouch-walking near a guard does raise its meter later on. The ring still shows 5-7 m. Also untaught: **standing still is completely silent** (`DetectionSystem.ts:43`).
- **M-9 Fork.** `stageTips.ts:39` "the short lane is guarded, the long way round is safe" omits the **reward**: 2 guaranteed pickups in the guarded lane (`ProcgenSystem.ts:449-454`). Without it the choice looks one-sided. "Safe" means only "no guard post"; roaming guards can still be there.
- **M-10 Dogs "Sprint away".** `stageTips.ts:32`: only a *standing* RUN (7 m/s) outruns a dog (5.6 m/s). Crouch + RUN (4.55 m/s) does not (`PlayerController.ts:84`; `Dog.ts:104`). Also untaught: crouching lets you pass closer (2.2 m vs 3.8 m, `Dog.ts:116-117`).
- **M-11 Cameras.** `stageTips.ts:33` says "a guard is sent to your position". It is approximately right: the guard spawns ~22 m ahead and heads for where the cameras saw you, and **every** guard also converges while vision is +25 % (`Game.tsx:901-934,1829-1842`). Actionable counterplay (crouch behind cover; the bar drains slowly) is missing.
- **M-12 Catch label.** Razor wire and dog bites show "ARRESTED" (`Game.tsx:1598` calls `handleCatch()` with the default 'arrested', `:1123`; `CatchFlash.tsx:55`). This is minor flavour and does not teach anything wrong.

### 3.4 Missing mechanics (no in-game instruction at all)
- **X-1 Controls.** Floating joystick, RUN as a **toggle**, CROUCH/WALK stance buttons, hold-to-look arrows, pickup buttons and their counts. The intro never shows a control.
- **X-2 Crouch hides you better.** 0.45× vision rate, low walls count as cover, and dogs react later (`DetectionSystem.ts:114,155`; `Dog.ts:116-117`).
- **X-3 Floodlight towers** raise every guard's meter and extend vision. From stage 8 they track and jolt the meter (`Game.tsx:535,1754-1797`).
- **X-4 Noise can't cause a chase; only sight can** (`DetectionSystem.ts:14-17`).
- **X-5 Standing still is silent** (`DetectionSystem.ts:43`).
- **X-6 Fewer hearts:** 2 from stage 10, 1 from stage 20 (`progression.ts:97-102`). Hearts.tsx just renders fewer slots.
- **X-7 Boss perk** "+1 heart for 10 stages" and the "BOSS PERK · N" tag (`store.ts:375`; `Hearts.tsx:106`).
- **X-8 Star criteria** (`scoring.ts`). The card shows the inputs without targets (`Banner.tsx:158-171`).
- **X-9 Mode descriptions** on the ENDLESS / DAILY buttons (`StartScreen.tsx:735-757`).
- **X-10 Endless and Daily never get dog, camera, razor or stamina tips.** `stageStartTip` runs for campaign only (`Game.tsx:966-968`), and the camera tip is checked only at segment start, when Endless sections are level 1-2 (`:969,727-732`). Dogs (≈840 m), cameras (≈1080 m) and razor wire (≈1560 m) arrive silently; razor wire is lethal. Note that `AlarmBar` does appear (`AlarmBar.tsx:111` uses `selectRuleLevel`).
- **X-11 Pickups reset each segment but survive a catch** (`store.ts:474`; `Game.tsx:1225-1227`).
- **X-12 Threat arrows and "!" colours** (`ThreatArrow.ts`; `GuardStateMarker.ts:19-24`).
- **X-13 Radio call-outs from stage 12, lead shots from 18, slow-mo off from 12, forced storms from 15.** These are low priority (C).
- **X-14 Weather / night effects** on vision and noise. Reference only (C).
- **X-15 Every-5th-stage lead guard sees 50 % further** (`Game.tsx:755-758,1861-1864`). Reference only.
- **X-16 A crowbar miss wastes it; the slot glows when a target is in reach** (`Game.tsx:1647`; `PickupBag.tsx:180`).

### 3.5 Duplicated instruction
- **D-1** Boss: modal (`Game.tsx:1458-1459`) and boss tip (`stageTips.ts:35`) on the same stage.
- **D-2** Noise: intro card 5 (`Tutorial.tsx:113`) and stage-2 tip (`stageTips.ts:27`).
- **D-3** Cover: intro card 3 (`Tutorial.tsx:105`) and stage-3 tip (`stageTips.ts:28`). Both carry the same M-1 omission.
- **D-4** Shot laser: intro card 2 (`Tutorial.tsx:101`) and `aimed` tip (`stageTips.ts:42`). This duplication is acceptable because the contextual tip fires at a 0.7 s wind-up it cannot help with (see L-2).
- **D-5** Stamina: intro card 5 "From stage 5, RUN uses stamina" and stage-5 tip.
- **D-6** Tools: intro card 6 and the per-pickup tips (crowbar / smoke).
- **D-7** Pickups: stage-4 tip and the per-pickup tips (OB-1).

### 3.6 Taught too early
- **E-1** Intro card 5 teaches stage-5 stamina before the first stage (`Tutorial.tsx:113`).
- **E-2** Intro card 4 names razor wire (`Tutorial.tsx:109`), which first appears at stage 14 (`progression.ts:137-139`). Dogs are named in cards 4 and 6; they first appear at stage 8.
- **E-3** Intro card 6 teaches smoke vs dogs 8 stages early.

### 3.7 Taught too late
- **L-1** Pickups: stage-4 tip for something present from stage 1 (OB-1).
- **L-2** The `aimed` tip is queued when the laser comes up (`Game.tsx:1960-1963`). It only shows after the 4 s cooldown and competes with other tips, while the shot follows within 0.7 s (`GuardAI.ts:69`). It cannot do its job the first time. The intro must carry this.
- **L-3** Cover and the crouch rule are needed on stage 1 (1-5 cover props per chunk, `progression.ts:196-197`) but first taught as a tip on stage 3.
- **L-4** The 2-heart drop at stage 10 coincides with the boss modal, which doesn't mention it. The 1-heart drop at stage 20 is never mentioned.
- **L-5** Endless/Daily late-level mechanics are never taught (X-10).

### 3.8 Text that refers to changed controls or behaviour, or numbers that don't match constants
- **N-1** Intro ring colour thresholds 0.4 / 0.75 (`Tutorial.tsx:285-286`) vs game 0.5 / 0.85 (`RadialMeter.ts:47-48`). The popup text "At red guards chase" vs the code (chase needs a full ring, `GuardAI.ts:60`).
- **N-2** Crouch cover height 0.55 in the comment vs 0.3 in code (`Obstacles.ts:29` vs `DetectionSystem.ts:11`). The claim that low walls don't block (`Obstacles.ts:26`, `blocksLineOfSight` at `:106-108`) is **dead code**: `blocksLineOfSight` is never called (grep finds only its definition). This matters because any writer who reads Obstacles.ts will get the cover rule wrong.
- **N-3** "Tall props" (intro, README) vs the height rule (M-1).
- **N-4** README "Props stop bullets" vs the 0.8 m threshold (M-5).
- **N-5** `util/geometry.ts:40-58` holds legacy detection constants (`NOISE_RANGE_WALK = 3`, `NOISE_RANGE_RUN = 7`, `VISION_RANGE_PER_STAGE`, `GUARD_CHASE_SPEED = 6.5`, `LIGHT_VISION_BONUS`) that no gameplay code reads (grep shows no importers). Real values are in `progression.ts` and `GuardAI.ts:24-28`. Don't quote numbers from geometry.ts in help text.
- **N-6** Terminology: "segment" (`Banner.tsx:200` NEXT SEGMENT) vs "stage" (`StartScreen.tsx:817` PLAY STAGE N, `SettingsScreen.tsx:300`, tips, modal) vs "run" (LOAD RUN, NEW RUN). One campaign stage is one segment, so the button should say "NEXT STAGE".

---

## 4. Proposed revision (not implemented)

Principles: the intro teaches only what can kill you on stage 1 and the controls. Everything with a later first appearance moves to a first-encounter tip. Everything else goes into a How to Play reference. Keep tips ≤ ~70 chars where possible, because the toast holds only 2.6 s (`Toast.tsx:14`).

### 4.1 Intro cutscene, still 6 beats and ~28 s

The animation beats 0-3 stay as they are. The beat 2 animation should show the player **crouching behind a low wall**: a smaller dot plus a "LOW WALL" label instead of "COVER".

| Beat (anim) | Title | Proposed body | Fixes |
|---|---|---|---|
| 0 (walk) | **Move** | "Left thumb: move. CROUCH / WALK set your stance. RUN is on/off." | X-1 |
| 1 (spotted) | **Guards' cones** | "Guards only see inside their cone. The dots at your feet fill as they notice you." | M-2, M-3, M-4 |
| 2 (cover) | **Hide behind props** | "Put a prop between you and the guard. Low walls only hide you if you CROUCH." | M-1, X-2, L-3 |
| 3 (caught) | **Red = danger** | "Red dots: they can shoot. A laser means a shot. Break line of sight! Touch = lose a heart." | M-2, L-2, D-4, OK-7 |
| 4 (text) | **Noise** | "Moving makes noise (blue circle). Standing still is silent. Noise alone never starts a chase." | M-3, M-8, X-4, X-5, D-2, E-1 |
| 5 (text) | **Escape** | "Grab tools on the way. Reach the green line. Stars for staying unseen, fast and unhurt." | E-2, E-3, D-6, X-8 |

Also align the animated ring thresholds with the game: `Tutorial.tsx:285-286` should use 0.5 / 0.85 (N-1).

### 4.2 Contextual first-encounter tips (replace `TIPS` and `STAGE_TIPS`)

The trigger column names an existing hook where one exists. The one new hook needed is marked **new**.

| id | Trigger | Proposed text | Chars | Fixes |
|---|---|---|---|---|
| stage1 | Stage 1 start (keep) | "Reach the green line. Stay out of guards' cones." | 49 | OK-1 |
| crouch (new id) | Stage 1, first time within ~3 m of a low wall **(new: proximity to a `lowwall` obstacle)** | "Low wall: CROUCH behind it to hide." | 35 | M-1, X-2, L-3 |
| stage2 → **floodlight** (new id) | First frame `lit === true` (`Game.tsx:1756`) **(new hook)** | "Floodlights alert every guard. Crouch or keep moving." | 53 | M-4, X-3, D-2 |
| stage3 → drop | — (the cover rule moves to the intro plus the `crouch` tip; stage 3 has the fork tip) | — | — | D-3 |
| fork | Existing (`Game.tsx:1536`) | "Fork: guarded lane has 2 pickups. Long lane has no post." | 57 | M-9 |
| stage4 → drop | — | — | — | OB-1, L-1, D-7 |
| crowbar | First crowbar pickup (existing) | "Crowbar: stuns a nearby guard 4 s. Scares dogs. A miss wastes it." | 66 | M-7, X-16 |
| smokebomb | First smoke pickup (existing) | "Smoke: guards can't see through it for 5 s. Cameras can." | 55 | M-6 |
| rock | First rock pickup (existing) | "Rock: THROW lands ahead. Guards nearby go check the noise." | 58 | OK-4 |
| stage5 | Stage 5 start (keep, shorter) | "RUN now drains stamina. Empty bar: wait before running again." | 60 | OK-2 |
| stage6 | Stage 6 start (keep) | "Guards now stop and scan where they last saw you." | 49 | OK-3 |
| searchlight (new id) | Stage 8 start, or Endless level 8 **(new hook)** | "Some floodlights now follow you. Get out of the beam fast." | 58 | X-3 |
| dogs | First dog present (stage 8, **or Endless section with a dog**) | "Dogs charge up close. Outrun them standing, smoke or crowbar them." | 66 | M-10, X-10 |
| boss → **perk** | After the first boss clear, on the next stage start while perk > 0 | "Boss beaten: +1 heart for the next 10 stages." | 45 | OB-2, D-1, X-7 |
| hearts2 (new id) | Stage 10 start (fold into the boss modal, see 4.3) | — | — | L-4 |
| cameras | **First frame a camera sees the player** (`updateCameraAlarm` returns a rising value) instead of segment start; this also fires in Endless | "Camera! Crouch behind cover to hide. Full alarm brings guards." | 62 | M-11, X-10 |
| stage12 (new id) | Stage 12 start | "Guards now radio each other when one spots you." | 48 | X-13 |
| razor | Stage 14 start **or Endless level 14** | "Razor wire: touching the side fence costs a heart." | 50 | X-10 |
| hearts1 (new id) | Stage 20 start | "From now on you have 1 heart. No mistakes." | 42 | L-4 |
| aimed | Keep as a reinforcement (first wind-up) | "Laser = shot incoming. Break line of sight!" | 44 | D-4 |
| endless | Endless start (keep) | "Endless: go as far as you can. Harder every 120 m." | 50 | OK-4 |
| daily | Daily start (keep) | "Daily: same yard for everyone today. How far can you get?" | 57 | OK-4 |

Implementation note: for Endless/Daily, run the stage-gated tips against `levelAtZ(player.z)` when a new level is reached (`Game.tsx:715-731`, `streamEndless`), not only at segment start. This addresses X-10 and L-5.

### 4.3 Modals, toasts and cards
- Boss modal (`Game.tsx:1459`): "Survive 60 s in the arena. Lose every heart and you retry. Win: +1 heart for 10 stages." At stage 10 prepend "You now start with 2 hearts." (L-4, X-7, D-1)
- Post-run card (`Banner.tsx:158-171`): show the star target per row, e.g. "Times spotted 1 (★ at 0)", "Run time 72 s (★ ≤ 58 s)". Numbers come from `scoring.ts` and `timeTargetsFor`. (X-8)
- Rename NEXT SEGMENT to NEXT STAGE (N-6).
- Mode buttons (`StartScreen.tsx:740-750`): add a one-line sub-label under the existing best/today line. ENDLESS: "No finish. Harder every 120 m." DAILY RUN: "Same yard for everyone today." (X-9)
- Pause panel: add a HOW TO PLAY row that opens the reference in 4.4 (X-1, and players can look rules up mid-run).

### 4.4 How to Play reference (new screen opened from the home screen and pause; offer "Replay intro" at the top)

Sections are short, and each line is a fact backed by the code cited in §2.

1. **Controls.** "Left thumb anywhere on the left: move. RUN: tap on/off. CROUCH / WALK: stance. ‹ › hold: look around. CROWBAR / SMOKE / THROW: use a pickup (number = how many). ⚙: pause." (X-1)
2. **Being seen.** "Guards see in a cone; outside it you're invisible. The dots at your feet show the most alert guard: yellow = noticed, orange = searching, red = can shoot, full = chase. Chases need sight: noise, lights and dogs can only make guards search." (M-2, X-4, X-12)
3. **Cover.** "A prop hides you only while it's between you and the watcher. Standing: needs a prop at least chest-high. Crouched: low walls work too. Same for cameras." (M-1)
4. **Noise.** "The blue circle is how far you're heard. Still = silent. Crouch = small circle. Running = bigger. Rain masks noise." (M-3, M-8, X-5, X-14)
5. **Lights.** "Floodlights alert every guard and let them see further. Crouch to be less obvious. From stage 8 some beams follow you. At night guards see less, except when you're lit." (X-3, X-14)
6. **Shots.** "Red dots plus a clear view means a guard aims. A laser shows the 0.7 s wind-up; break line of sight to cancel it. Low walls don't stop bullets." (M-5)
7. **Tools.** "Pickups lie around every stage and reset each stage; you keep them if caught. Crowbar: stun the nearest guard 4 s or scare dogs (a miss wastes it). Smoke: 5 s cloud guards can't see through (cameras can). Rock: lands ahead; nearby guards check the noise." (M-6, M-7, X-11, X-16)
8. **Threats by stage.** "3: forks. 5: stamina. 6: guards scan. 8: dogs, tracking lights. 10: boss arena, cameras, 2 hearts. 12: guards radio. 14: razor wire. 15: storms. 20: 1 heart." (X-6, X-13)
9. **Hearts and bosses.** "Touch, bite, bullet or razor wire = −1 heart and back to the start. Every 10th stage: survive 60 s; losing means retry. Winning gives +1 heart for 10 stages (lost if a run ends)." (X-6, X-7)
10. **Stars and coins.** "Stars rate 4 things: times spotted, time detected, speed, hearts lost. Coins: 10 per new star (+5 on a first clear), 1 per 25 m in Endless, 1 per 20 m in Daily (+10 for your first Daily each day). Outfits are cosmetic." (X-8)
11. **Modes.** "Campaign: stages with a finish line. Endless: no end, harder every 120 m, always 3 hearts. Daily: Endless on the same yard for everyone that UTC day." (X-9)

### 4.5 README (`README.md:22-40`)
- Replace the cover bullet: "Props hide you only when **between** you and the guard; standing needs ≥ 1 m props, crouching also uses low walls." (M-1, N-3)
- Replace "Props stop bullets." with "Props at least chest-high stop bullets; low walls don't." (M-5, N-4)
- Add: "Floodlights raise every guard's meter; from stage 8 some track you." (X-3)

---

## 5. Open questions (cannot be settled from code, or are design decisions)
1. **Crouch-run dominates walking.** Crouch + RUN is 4.55 m/s against a 3.5 m/s walk (`PlayerController.ts:84`; `geometry.ts:25`). It also has a smaller noise radius (5 × 1.35 = 6.75 m vs 9 m at stage 1, `DetectionSystem.ts:44-46`), a lower noise rate (0.3 vs 0.4), and 0.45× visibility. The only costs are stamina (from stage 5) and being unable to outrun dogs or guards. Is this intended? If so, teach it ("Crouch + RUN: fast and quiet"). If not, it's a balance issue, not a tutorial one.
2. **Is the every-5th-stage lead guard visually distinct?** I found no distinct model or marker in `Game.tsx:755-758`. If it isn't distinct, the X-15 rule can't be taught usefully.
3. **Should HOW TO PLAY stay a replay of the cutscene, or open the new reference screen?** My proposal is reference first, with a "Replay intro" link.
4. **Toast readability.** Is a 2.6 s hold (`Toast.tsx:14`) long enough for tips while moving? Consider a longer hold for tone `tip` (e.g. 4 s); `TIP_READ_S` (`Game.tsx:947`) marks a tip seen after 2 s.
5. **Should the intro include an interactive step** (for example "move to the wall and crouch")? The cutscene is non-interactive by design (`Tutorial.tsx:16-18`). Contextual tips carry the interactive load in this proposal.
6. **`tutorialSeen` is global but `tipsSeen` is per save** (`storage.ts:38`; `stageTips.ts:3-4`). A second profile on the same device gets the tips but not the intro. Is that intended?
7. **Razor wire and dog bites say "ARRESTED"** (M-12). Should there be a separate cause label? This is flavour only.
8. **Weather tip.** Rain and snow change noise and vision (`Weather.ts:209-213`) but are left to the reference. Is a first-snow or first-rain tip wanted?

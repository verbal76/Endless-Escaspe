# Post-playtest punch list (baseline Build 13 / 0.2.1 / OTA 116 / c424b4b)
Nothing here is implemented or published. PLAYTEST HOLD ACTIVE - OTA 116 / c424b4b FROZEN.

## Baseline - CONFIRMED ON PHYSICAL PIXEL (owner report, Android 37)
v0.2.1 - Build 13 - OTA 116; update 01a0efeb-3ebb-7ae2-9171-ef99fb80dc86; commit c424b4b;
published 2026-09-30 01:26 UTC; Launch Normal; Texture files 11/11; Display font Black Ops
One loaded (first device proof); Rendering player 6/6, guards 12/12, vehicles 18/18,
props 306/306, ground 1/1 textured, 0 flat; GPU textures 10/10 match.
Matches emulator run 11 and OTA 116 publish record exactly.

## LOCKED ITEMS (owner, at playtest start)

### L1 Settings gear (= G1) - locked, held
- G1 Settings gear image: scratchpad/settings-gear.patch (sha256 c0800049...a376),
  applies cleanly to c3278a7; tsc clean, 89/89 tests. Rebuild recipe: gear-recipe.py
  + original upload 8e1ab998-image.png.

### L2 Right-side gameplay control visibility - CONFIRMED (owner device screenshot + code)
- Observed: CROWBAR, THROW, SMOKE extremely faint against the world; other controls vary
  in readability with what's behind them.
- System: HUD controls (src/components/HUD/PickupBag.tsx, RunButton.tsx, stance buttons).
- Cause: empty pickup slot = whole button opacity 0.45 (PickupBag.tsx:131) x bg 10% white
  (:209) x border 20% (:211), icon 50% white (:150-154), muted count/label -> effective
  ~5-25% visibility; no outline/shadow. Filled slots only 45% tint (:36-43,94). RUN idle
  bg 10% / border 30% (RunButton.tsx:86-88). All contrast depends on scene behind.
- Goal (owner): consistent readability without an opaque control panel; keep positions
  unless the audit shows a reason.
- Direction for later: small dark backing disc (~35-45% black) + 1-1.5 dp light rim +
  text/icon shadow; empty = desaturated but >= ~60% legible, or hide empty slots (V10
  suggests hiding "0 CROWBAR" ghosts - decide together).
- Depends on: V8 (shared button component), V9 (icon set), V10 (HUD relayout).

### L3 Tutorial / How to Play - see section below (audit complete, read-only)
### L4 Graphics / UI - see section below (audit complete, read-only)

## CI (not gameplay)
- C1 Bound adb calls with timeouts so a lost emulator fails fast (run 10 hung 74 min).
  Lifecycle gate itself now proven: run 11 (c424b4b) LIFECYCLE CHECK OK.

## Tutorial / instruction (full evidence: tutorial-audit.md)
Summary by the owner's categories:
- Taught correctly: stage 1/5/6 tips; rock, fork*, endless, daily, aimed tips; boss modal
  + failure toast; alarm toast; "about 30 seconds" prompt. (*fork omits reward)
- Obsolete: stage-4 pickup tip; stage-10 boss tip (duplicates modal).
- Missing: controls; floodlights; heart drop at 10/20; boss perk; star scoring;
  mode descriptions; standing still = silent; Endless/Daily hazard tips.
- Misleading: cover ("tall props"); "red = chase"; "the ring" = two visuals; smoke vs
  cameras; crowbar "knocks out"; "sprint away" from dogs; README bullets.
- Keep on How to Play (C): controls, being seen, cover, noise, lights, shots, tools,
  threats by stage, hearts & bosses, stars & coins, modes.
- Teach contextually (B): dogs, cameras, razor wire, stamina, floodlights, radio,
  forks, pickups (each on first encounter, all modes).
- Needs no explanation (D): fences as boundaries, the green exit line (visible),
  weather, outfits (cosmetic).
- Proposed structure: 6-beat ~28 s intro (controls, cones, crouch-cover, red = danger,
  noise, tools/exit) + ~20 first-encounter tips + 11-section reference + mode blurbs.
- T1 Cover rule wrong everywhere (intro, stage-3 tip, README): crouch hides behind >=0.3 m
  (low walls), standing needs >=1.0 m; crouch also cuts sight gain to 0.45x.
- T2 Ring card: fills from noise/floodlights/dogs too (cap 0.75); red = can shoot,
  chase needs full ring + sight; two different visuals both called "the ring".
- T3 Floodlights never taught (raise meters without LOS; track player from stage 8).
- T4 Controls taught nowhere (floating joystick, RUN toggle, CROUCH/WALK, look arrows).
- T5 Obsolete/duplicate tips: stage-4 pickups tip; stage-10 boss tip repeats modal;
  noise/cover/stamina taught twice; intro front-loads stamina/dogs/razor wire.
- T6 Wrong details: smoke doesn't stop cameras; crowbar = 4 s stun and a miss uses it;
  dogs outrun crouch-run; fork tip omits 2 pickups on guarded lane; README
  "props stop bullets" (only >=0.8 m).
- T7 Endless/Daily: no tips for dogs/cameras/razor wire as level rises.
- T8 Never explained: heart drop at 10/20, boss perk, star scoring/targets,
  ENDLESS/DAILY buttons, standing still = silent.
- T9 aimed tip too late to help (keep laser warning in intro).
- T10 Stale code comments (Obstacles.ts cover height, unused geometry.ts constants).
- Proposal: tutorial-audit.md section 4 (6-beat intro rewrite, ~20 contextual tips,
  mode blurbs, How to Play reference in 11 short sections, README fixes).
- Open questions: crouch+RUN intended? boss guard look; toast 2.6 s long enough?
  HOW TO PLAY -> reference instead of replay?

## Graphics / UI (full evidence + screenshots: gfx-audit.md, gfx-audit/shots/)
- V1 Mountains faded/glitchy: 720 m away inside fog 70-800 (85-96% fog colour, fog
  #9cc0dd lighter than sky #88b4d8); hidden from afternoon on; lit face gets ambient
  only; snow caps buried + z-fight at tips; not mood-tinted; don't follow player in
  campaign. Fix: 2 ridge silhouettes with baked haze (fog off) + gradient sky dome,
  per-mood colour table. -25 draw calls, OTA-safe. Prototype: proto-s{1..4}-after.png.
- V2 Textures washed out: no colorSpace set (textures.ts:71-89). Try SRGBColorSpace +
  retune. NOTE reverses earlier review item R7 ("not changing") - decide on the phone.
- V3 Fog colour = horizon/sky colour per mood.
- V4 Title "ENDLEsS eSCAPE": not casing - per-letter bob (+-14 dp) and scale (+-6%)
  (StartScreen.tsx:41-66). One baseline, animate as a whole.
- V5 Lighting: night not dark (ambient 0.8 + emissive lift), floodlights barely read;
  hemisphere light + sun behind camera + mood retune (raise day ground tint).
- V6 Trees: orange trunks #cc7659 / leaves #3a7d2e, 168 identical per side ->
  #5a4032 / #2f5e3a + per-tree colour/scale variation (no extra draw calls).
- V7 Menu contrast: translucent blue pills with dark text (~2:1), tagline no shadow;
  add scrim/panel, solid secondary button with white text.
- V8 One shared button component: pause panel has 4 buttons in 4 colours; fonts mixed.
- V9 Icons: emoji/Unicode (skull, star, heart, arrows) -> one icon set (new small art).
  Gear image already prepared (G1).
- V10 HUD: 7 translucent right-side controls, "0 CROWBAR" ghost slots; tips collide
  with YARD ALARM / boss timer; hard-edged pink alarm frame -> soft vignette.
- V11 Snow: near flakes render as big white hexagons (Weather.ts:36); menu snows
  behind the title.
- V12 Endless / Daily always day mood (Game.tsx:610) - no visual variety.
- V13 Android nav bar visible: immersive mode needs expo-navigation-bar = NEW APK
  (next native build only).
- Plan: Phase 1 quick wins (V4, V2, V6, V7, V3) ~1.5-2 d; Phase 2 world (V1, V5,
  ground, weather, shadows) ~3-4 d; Phase 3 UI system (V8-V10, panels, transitions;
  V13 in next APK) ~4-5 d. All within current draw-call budget (web 443-706).

## Physical-device playtest findings
- (to be added from the owner's playtest on Build 13 / OTA 116)

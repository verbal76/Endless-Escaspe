# Endless Escape: graphics and UI release-quality audit

Read-only audit. Repo at `c424b4b`, nothing in `/home/user/Endless-Escaspe` was changed.
Paths are relative to `scratchpad/gfx-audit/` unless they start with `src/`.

- Screenshots: `gfx-audit/shots/*.png`. They are web builds, SwiftShader, 915x412 unless the name says otherwise.
- Device reference: `/root/.claude/uploads/.../602c2a56-image.png`. Crops of it: `gfx-audit/device-title-crop.png` and `gfx-audit/device-mountains-crop.png`.
- Scripts: `gfx-audit/h.mjs` (harness on port 8781), `menus.mjs`, `flow.mjs`, `play.mjs`, `states.mjs`, `proto.mjs`, `proto2.mjs`, `proto-lib.js`.
- Prototypes: `proto-lib.js` injects the proposed mountain, sky, tree, colour-space and lighting fixes into the running web build, without touching the repo. Before/after pairs are `shots/proto-s{1..4}-before.png` vs `-after.png`, plus `proto-s1-after-srgb*.png` and `proto2-*.png`.

Measured draw calls (web): 443 (s1), 477 (s2), 511 (s3), 493 (s4), 556 (s5), 706 (s12 snow), 276 (boss arena). About 94-130k triangles.

---

## 1. Executive summary: top 10 changes, ranked by impact / effort

| # | Change | Impact | Effort | OTA? |
|---|---|---|---|---|
| 1 | **Replace the backdrop mountains.** Use 2 fog-free, vertex-coloured ridge silhouettes, tinted per mood (proto: `proto-s1-after.png`, `proto-s3-after.png`, `proto-s4-after.png`) | Very high | 0.5-1 d | OTA |
| 2 | **Set `colorSpace = SRGBColorSpace` on every colour texture** (`src/util/textures.ts:71-89`, ground clone in `PrisonYard1.ts:183`). Today every Kenney texture is decoded as linear and then gamma-encoded, which washes it out (`proto-s1-after.png` vs `proto-s1-after-srgb.png`). | Very high | 1 h + retune | OTA |
| 3 | **Sky gradient dome, with fog colour = horizon colour.** Kills the flat blue sky and the hard grey ground/sky seam. | High | 2-3 h | OTA |
| 4 | **Stop the per-letter bounce/scale on the title.** It is what produces "ENDLEsS eSCAPE". | High (first impression) | 30 min | OTA |
| 5 | **Relight: HemisphereLight plus the sun moved behind the camera.** Retune ambient/emissive per mood so night is actually dark and the floodlights read (`proto2-s4-night.png`). | High | 0.5 d | OTA |
| 6 | **Tree palette.** Bark `#cc7659` → `#5a4032`, leaves `#3a7d2e` → `#2f5e3a`, plus per-instance colour and scale variation. | Medium-high | 1-2 h | OTA |
| 7 | **Menu legibility.** Add a dark gradient scrim or panel behind the title stack, make CONTINUE a solid secondary button, and give the tagline a shadow. | High | 2-3 h | OTA |
| 8 | **Unify the button system** (one Button component: primary/secondary/danger/ghost). Replaces the rainbow pause buttons and the mixed fonts on cards. | Medium-high | 1 d | OTA |
| 9 | **Replace emoji/Unicode glyph icons** (♥ ♡ ★ 💀 ‹ › ⚙) with the same drawn-View / PNG icon family as the PickupBag icons. | Medium | 0.5-1 d | OTA (PNG assets) |
| 10 | **Hide the Android navigation bar** (immersive mode). The device screenshot shows the system bar eating the right 5% of the screen. | Medium | 1 h | **needs new APK** (expo-navigation-bar) |

---

## 2. Findings by area

### 2.1 Mountains / backdrop (owner complaint #1)

**What's wrong**
- The device crop (`device-mountains-crop.png`) shows pale grey-blue triangles about as light as the sky.
  - Sampled sky: `#88b4d8`. Sampled mountain faces: about `#86a6c0`.
  - Faces are two-toned, peaks are cropped by the top of the frame, and there is no visible snow.
- Web shots:
  - `play-s1-day.png`: the same ghosts.
  - `play-s2-afternoon.png` and `play-s3-dusk.png`: pink-brown smudges.
  - `play-s4-night.png` and `play-s5-deepnight.png`: gone completely.

**Root causes (code evidence)**
1. **Fog swallows them.**
   - Mountains sit at `MOUNTAIN_Z = segLen + 600 = 720` ±40 (`src/scenes/Backdrop.ts:21,218-220`). That is about 690-770 m from the camera at stage start.
   - Day fog is near 70 / far 800 (`src/scenes/Lighting.ts:32-33`). Fog factor = (d-70)/730 ≈ **0.85-0.96**, so the mountains are 85-96% fog colour.
   - The fog colour `#9cc0dd` is *lighter* than the sky clear colour `#88b4d8` (`Lighting.ts:30-31`), so the mountains come out lighter than the sky. That is why they look like washed-out ghosts.
   - Other moods:

     | Mood | fogFar | Result |
     |---|---|---|
     | Afternoon | 700 | 100% fog |
     | Dusk | 520 | 100% fog; fog `#6e5262` ≠ sky `#7a5566`, so dark flat cut-outs |
     | Night | 380 | 100% fog, fog = sky, so invisible |
     | Deep night | 300 | 100% fog, fog = sky, so invisible |
2. **They "develop" during a stage.** In campaign the group does not follow the player; only Endless calls `followBackdrop` (`src/game/Game.tsx:2246-2251`). Over 120 m of walking the fog factor falls from about 0.9 to about 0.72, so the mountains visibly darken as you play.
3. **Backlit, flat-shaded tetrahedra.**
   - Each mountain is a 4-face pyramid with `flatShading` Lambert (`Backdrop.ts:46-49,80-114`).
   - The camera-facing face normal is about (0, 0.25, -0.97). The sun direction is (8,14,4) normalised = (0.48, 0.84, 0.24) (`src/game/Renderer.ts:194`). N·L ≈ -0.02, so the face you see gets *no* sun, only ambient.
   - The ±x side faces are lit differently, so every peak shows a hard two-tone split. With ±0.15 rad random yaw (`Backdrop.ts:221`) and heavy overlap (spacing about 69 m, halfW up to 80 m), the intersecting pyramids produce random facets. That is the "janky flat triangles".
4. **The snow caps are buried and z-fight.**
   - The cap's base half-width is `0.28·halfW` at `snowBaseY = 0.68·h` (`Backdrop.ts:118-121`). The mountain is `0.32·halfW` wide at that height, so the cap sits *inside* the mountain. It only meets the surface at the apex, where the two coincident faces z-fight at about 700 m.
   - Depth range is near 0.1 / far 1500 (`Renderer.ts:187`), so depth precision there is about 0.3 m.
   - Result: no visible snow, just flicker at the tips. That is the "glitch".
5. **Mood tinting skips them.** `applyBackdropMood` tints only clouds and birds (`Backdrop.ts:267-274`). The mountain colour `#2c3a4f` is fixed for every mood.
6. **Framing.** Heights of 70-160 m at about 700 m put the peaks above the top edge of the frame (device crop), so they read as cut-off wedges instead of a range.

**Replacement design** (prototyped in `proto-lib.js`; results in `proto-s1-after.png`, `proto-s2-after.png`, `proto-s3-after.png`, `proto-s4-after.png`)
- **Geometry.** 2 ridge layers, each one non-indexed `BufferGeometry` strip. About 90 columns across 2600 m give about 180 triangles and 1 draw call per layer.
  - The height profile is max-of-peaks (14 seeded peaks, triangular falloff ^1.15) plus a small sine wobble.
  - Far layer: z = 900 relative to the player, base 10, amplitude 150, snow line 120.
  - Near layer: z = 640, base 4, amplitude 80, no snow.
  - Tune the amplitudes so the peaks stay in the top 25% of the frame, *below* the top edge. A good target is peaks at 60-85% of the distance from horizon to the top of the frame.
- **Material.** `MeshBasicMaterial({ vertexColors: true, fog: false })`, with the atmospheric haze baked into the colours:
  - Base vertices = layer colour lerped 55% towards the horizon colour.
  - Top vertices = layer colour, or the snow colour above the snow line.
  - No lighting maths (cheaper than Lambert) and no fog dependency, so they never vanish or develop.
- **Per-mood palette.** Rewrite the colours or `material.color` in `applyBackdropMood`. Suggested hex:

  | Mood | Zenith | Horizon | Far ridge | Near ridge | Snow |
  |---|---|---|---|---|---|
  | day | `#4a7fc1` | `#cfe2ee` | `#8fa6c0` | `#5c7390` | `#f4f7fb` |
  | afternoon | `#6f8fc0` | `#f3d2a2` | `#b89a94` | `#7d6a73` | `#fff1dc` |
  | dusk | `#2e2a52` | `#e58a6a` | `#7b5670` | `#4a3a55` | `#f2c7c0` |
  | night | `#0b1226` | `#2a3a5c` | `#24324f` | `#18223a` | `#8ea3c8` |
  | deepNight | `#060a16` | `#1a2540` | `#18223a` | `#0f1628` | `#5d6f94` |
- **Placement.** Parent the ridges to the backdrop group and follow the player in *all* modes (campaign too), so the distance stays constant.
- **Cost.** Draw calls: removes 28 (14 bases + 14 caps), adds 2 ridges + 1 dome, net **−25**. OTA-safe. Keeps the low-poly style, so this is not an art replacement.

### 2.2 Sky
- **Wrong.** The sky is only `renderer.setClearColor(light.sky)` (`Lighting.ts:122`): a flat light blue (`play-s1-day.png`, device). The hard seam where the fogged ground meets the clear colour (`#83827d` ground vs `#88b4d8` sky on device) reads as "unfinished".
- **Fix.**
  - Add a hemisphere dome: `SphereGeometry(1400, 24, 12, 0, 2π, 0, π/2+0.2)`, `BackSide`, `fog:false`, `depthWrite:false`, `renderOrder -10`.
  - Give it vertex colours from horizon to zenith with t = y^0.55 (prototype included). Colours are in the table above.
  - Set **fog colour = clear colour = horizon colour** in `applyLighting` (`Lighting.ts:121-132`). The ground then melts into the base of the sky.
  - Optional: a sun/moon billboard with additive blending and `fog:false`.
- **Cost.** 1 draw call. OTA.
- Clouds (`Backdrop.ts:150-158`) are 6 translucent rectangles at 55% opacity. Either replace them with 3-5 low-poly puffs (merged icosahedra, 1 instanced draw) or drop them. Rectangles look like placeholders.

### 2.3 Colour management / tone
- **Wrong.** No texture sets `colorSpace` anywhere (`grep colorSpace src` = 0 hits; `configure()` at `src/util/textures.ts:71-89`).
  - three r166 defaults `outputColorSpace = SRGB`, so sRGB PNG data is treated as linear and gamma-encoded on output.
  - Every texture renders lighter and desaturated. Examples: grey-green ground, beige-grey prisoner, chalky concrete.
  - Compare `proto-s1-after.png` (current) with `proto-s1-after-srgb.png`. The fixed version has a saturated orange prisoner, green ground and readable concrete.
  - Hex material colours are already managed, which is why solid-colour trees look saturated while textured props look chalky. The palette is incoherent.
- **Fix.**
  - `tex.colorSpace = THREE.SRGBColorSpace` in `configure()` and on the ground clone (`PrisonYard1.ts:183`).
  - Leave the fence alpha texture (`Fence.ts:75`) and the blob-shadow/juice textures as-is (they are data/alpha).
  - Then retune: emissive lifts (`KitProps.ts:56-63` 0.11-0.14; ground 0.08 at `PrisonYard1.ts:211`), and the ground tint (the grass PNG averages `#484e39`, so use `color: #d8e6b0`-ish or raise emissive).
- **Needs on-device check.** DataTexture sRGB upload on expo-gl (GLES3 `SRGB8_ALPHA8`) should work. If a device rejects it, fall back to converting the pixels to linear in `decodePng` (pure JS, OTA).
- **Tone mapping.** None is set. Keep it off on mobile (cost). The gradient sky plus the colour-space fix gives most of the "graded" look for free.

### 2.4 Lighting & moods
- **Wrong.**
  - The sun sits at (8,14,4), *ahead* of the camera (`Renderer.ts:194`), so every camera-facing surface is backlit and lit only by flat ambient. Props, prisoner and guards read as flat.
  - Night:
    - Ambient is 0.8 × `#7288b0` plus 0.12 prop emissive plus 0.08 ground emissive (`Lighting.ts:73-75`, `KitProps.ts:56-63`).
    - The yard renders mid-grey (`play-s4-night.png`, `play-s5-deepnight.png`), so the floodlight pools barely register, and the "night = danger" mood is lost.
  - Deep night even looks brighter than dusk.
- **Fix.**
  - Move the sun to about (-7, 12, -9) (from behind-left of the camera).
  - Add `HemisphereLight(sky, ground, i)` and drop ambient to about 0.3. One extra uniform, no draw calls.
  - Per mood (ambient / hemi / sun):

    | Mood | Ambient | Hemi | Sun |
    |---|---|---|---|
    | day | 0.35 | 0.9 (`#cfe2ff` / `#6b5a44`) | 1.6 |
    | night | 0.25 | 0.55 (`#4a5f8f` / `#1a1c22`) | 0.35 |
    | deepNight | 0.18 | 0.4 | 0.25 |
  - Reduce emissive lift to about 0.04 at night.
  - Prototype: `proto2-s4-night.png`. Night is now dark blue, the floodlight pools pop, and the silhouettes read.
  - Day in `proto2-s1-day.png` came out too dark on the ground. Raise the ground tint when adopting this.
  - Add these as fields on `StageLighting` (`Lighting.ts:11-25`). Add hemi to `LightRig`.
- **Endless/Daily always use the day mood** (`Game.tsx:610` `moodStageFor` returns 1). Rotate the mood by Endless level (every 2-3 levels) for variety. Vision is already scaled per mood.
- **Cost.** OTA. Zero extra draw calls.

### 2.5 Trees
- **Wrong** (`play-*.png`, device):
  - Trunks are salmon-orange `#cc7659` and leaves saturated `#3a7d2e` (`src/scenes/KitProps.ts:62-63`). Both have emissive self-lift 0.12, so there is no shading.
  - Scale is 3.5 × (0.85-1.35) (`Backdrop.ts:298`) on the tall-trunk pine, which exposes about 1/3 of each tree as bare orange stick.
  - 168 near-identical copies per side in a uniform band (`Backdrop.ts:26-33`).
- **Fix.**
  - Bark `#5a4032` (emissive the same at 0.05), leaves `#2f5e3a` (prototype applied in `proto-s*-after.png`).
  - Per-instance `setColorAt` jitter of ±8% lightness and ±0.03 hue across 3 greens (`#2f5e3a`, `#3b6b3f`, `#27513a`). InstancedMesh colour is free.
  - Scale jitter 0.7-1.5, and sink y by -0.4·scale on half the instances to hide trunks.
  - Add a second, denser row of the *Detailed* variant closer to the fence.
  - At night the leaves should go to about `#1c3326`, driven by the mood.
- **Cost.** 0 extra draw calls. OTA. Same Kenney models, so not an art replacement.

### 2.6 Ground
- **Wrong.** The 64 px `grass.png` (average `#484e39`, olive-grey) tiles every 4 m over 800×1800 m with nearest magnification (`PrisonYard1.ts:166-218`).
  - Linear decoding (2.3) lifts it to `#777a67` on web and `#5f6859` on device.
  - It reads as grey-green static noise (device, `play-s1-day.png`), with no variation between the yard, the path, and outside the fence.
  - Under snow the ground is only re-tinted (`Game.tsx:658` `#c8d6dc`). At dusk that gives pink-brown mud (`play-s3-snow.png`).
- **Fix** (OTA, 0-2 draw calls):
  1. Apply the sRGB fix, then tint the ground colour to about `#c4d4a0` in day. Per mood, multiply by the hemi light.
  2. Add a second, cheap large-scale variation: a 128 px procedural noise DataTexture on the ground as a detail/lightmap, via `lightMap` or `aoMap` with a second UV at a 40 m repeat. That breaks the tiling.
  3. Add a worn dirt strip down the yard centre using `dirt.png` (already loaded): one 2·PLAY_HALF_W plane, `polygonOffset`, at 0.6 opacity. It makes the "yard" read as a place.
  4. Snow: use a proper snow colour `#e9eef3` with low emissive, instead of a tint over grass.

### 2.7 Fences, props, vehicles
- Chain-link (`Fence.ts:60-80`) reads well up close. The dark posts on light ground are fine.
- At distance the moiré is controlled by mipmaps. OK.
- Props look chalky only because of the colour-space issue (2.3). After the fix they gain contrast (`proto-s1-after-srgb.png`).
- The police car is good.
- **Blob shadows.** They exist (`BlobShadows.ts`) but are faint in day. Raise their opacity to about 0.45 and apply them to props too (1 instanced draw) for grounding.
- **Real shadows.** Real shadow maps are not recommended (cost on mid-range Android).

### 2.8 Characters
- Kenney blocky characters are fine stylistically.
- Linear decoding washes the prisoner to beige (`play-s1-day.png` vs `proto2-s1-day.png`, where he reads as orange).
- The dotted noise ring around the player is grey on grey and noisy. Use a single thin ring with an alpha gradient in brand gold at 35%.

### 2.9 Fog / atmosphere
- The fog colour must equal the horizon colour (2.2).
- With the mountains `fog:false`, fog can come *closer* for depth (day near 40 / far 420). This also helps performance perception, because distant chunks fade out.
- Searchlight beams become visible white pillars in the sky once the fog colour changes (`proto2-menu-day.png`, `proto2-s4-night.png`). Cap the beam height and opacity, or give the beam material `fog:true` with a lower alpha.

### 2.10 Weather
- **Snow.** Flakes are `SphereGeometry(0.05, 4, 3)` (`Weather.ts:36`). Flakes near the camera become huge white hexagons and squares (`play-s3-snow.png` bottom-left, `outfits.png` top-right, `proto2-menu-day.png` bottom-left).
  - Fix: use a camera-facing `Points` sprite with a soft round texture and `sizeAttenuation`, and clamp the minimum camera distance by culling flakes within 3 m of the camera.
  - Still 1 draw call.
- **Rain.** The lines are OK but thin and grey on grey. Use `#cfe0ee` at 0.35 and give them length variance. Add a light screen-space darkening (sky/hemi −15%) while it rains so rain is a mood, not just particles.
- The menu background uses a snowing scene (`menu-915-a.png`). It adds noise behind the title. Force `clear` on the attract scene.

### 2.11 Shadows / post
- No shadow maps and no post-processing. Keep it that way for performance.
- Cheap substitutes:
  - Blob shadows everywhere.
  - An HTML/RN radial vignette overlay (static) to focus the eye. This costs no GPU time in GL.

### 2.12 Palette coherence
- Current world: saturated solid trees, chalky linear textures, a blue-grey sky, and a yellow-gold UI. The three families do not share a key.
- Proposal: one warm-cool scheme.
  - Cool environment: the blue/teal horizon, ridges and greens from the table in 2.1.
  - Warm accents: prisoner orange, brand gold `#ffd14a`, floodlights `#ffd98a`.
  - Keep red `#ff5a5a` only for danger.

### 2.13 UI: typography & the title casing bug
- **Not a string bug.** `TITLE = 'ENDLESS ESCAPE'` is already uppercase (`src/components/HUD/StartScreen.tsx:34`).
- **Cause.**
  - Each letter is a separate `Animated.Text` with `translateY: -14·wave` and `scale: 1 + 0.06·wave`, phase-offset 0.1 per index (`StartScreen.tsx:41-66`).
  - At any instant, neighbouring letters sit up to 28 dp apart vertically and differ about 12% in size.
  - Black Ops One's stencil caps then read as small caps. On device: "ENDLEsS eSCAPE" (`device-title-crop.png`). Web shows the same: `menu-915-a.png` "ENDLESs ESCAPE", `menu-640.png`, `tutorial-prompt.png`.
- **Fix.** Render the title as ONE `Text` (or one per word) on a common baseline, with a whole-title animation: a 400 ms drop-in plus a 2-3% breathing scale, or a slow gold shimmer.
- Also:
  - Add a 1-2 px dark stroke look: stack 2 shadowed copies, or `textShadowRadius: 0` offsets (4 directions).
  - Line-height lock. Tagline font weight 700 with letter-spacing 1.5 on 14 dp over the 3D scene is hard to read; see 2.14.
- **Mixed fonts on cards.**
  - Home buttons use Black Ops One (`StartScreen.tsx:917-921`).
  - Card and pause buttons use system 800-weight (`Banner.tsx:349-354`, `SettingsScreen.tsx` bigLabel), e.g. `cleared-b.png` "NEXT SEGMENT" vs `menu-915-a.png` "NEW RUN".
  - Pick one: display font for all primary CTAs, system semibold for everything else.

### 2.14 UI: contrast / legibility over the 3D scene
- **Tagline.** `rgba(255,255,255,0.85)`, 14 dp, no shadow (`StartScreen.tsx:874-880`). It sits on busy fence, prop and car geometry (device; `menu-915-a.png` "Prison yard, no exits, all sirens.").
- **CONTINUE button.** `rgba(120,200,255,0.20)` fill with dark `#1b1206` ink (`StartScreen.tsx:907-910` + `bigBtnLabel:917`). Dark text on a 20%-translucent pill over a grey scene is about 2:1 contrast.
  - The same pattern appears on BACK (`profile.png`, `outfits.png`), SKIP (`tutorial-prompt.png`) and the name screen.
- **HOW TO PLAY / captions.** 0.72 white, no shadow, over the prisoner and noise ring.
- **Fixes.**
  - Put a bottom-to-top scrim behind the menu stack: an absolute View using `experimental_backgroundImage: 'linear-gradient(...)'` (RN 0.81, verify on device). Alternatively a stepped 3-band rgba stack, or a single `panelSoft` rounded card `rgba(20,24,32,0.72)` behind title + buttons.
  - Secondary button: solid `#1f2733` fill, 2 px `#8fd3ff` border, **white** label.
  - Give all over-scene text a `textShadow` of `rgba(0,0,0,0.85)`, offset (0,1), radius 3.
  - During menu scenes, dim the 3D by about 25% by pushing the camera up/back for an attract framing that keeps the car and props out of the text column.

### 2.15 UI: buttons & states
- **Pause panel.** 4 translucent buttons in 4 hues: green, blue, purple, olive (`SettingsScreen.tsx:424-437`, `pause.png`). This reads like debug UI.
- **HUD controls.**
  - RUN is blue translucent (`RunButton.tsx:86-94`).
  - CROUCH/WALK are white/gold translucent (`ActionButtons.tsx:122-130`).
  - Empty pickup slots are at 45% opacity (`PickupBag.tsx:131`), e.g. "0 CROWBAR" ghosts (`hud-clean.png`).
- **Pressed state.** Everywhere it is only `opacity 0.75`. There is no disabled style distinct from the empty style.
- **Fix: a `ui/Button.tsx`** with variants and tokens in `theme.ts`:

  | Variant | Fill | Border | Label |
  |---|---|---|---|
  | primary | gold `#ffd14a` | `#ffe68c` | `#1b1206`, display font |
  | secondary | `#1f2733` | `#8fd3ff` | white |
  | danger | `#c93636` | `#ff5a5a` | white |
  | ghost | transparent | none | white, underline-less |
  - Pressed: `scale 0.96` + darken 10%.
  - Min height 44 dp.
  - Pause: RESUME = primary; RESTART / LOAD RUN = secondary; MAIN MENU = danger-ghost.
- **HUD.**
  - One neutral style for the round controls: `rgba(12,16,22,0.55)` fill, `rgba(255,255,255,0.35)` 1.5 px ring, white label.
  - Only the *active* state is coloured (gold for WALK/CROUCH, cyan for RUN).
  - Empty pickups: hide the count, show a dim icon only.

### 2.16 UI: HUD layout & clutter
- `hud-clean.png`: the right side has 7 translucent controls (3 pickups, CROUCH, RUN, WALK, 2 look arrows). They overlap each other's hit halos, and the "0 THROW" ring overlaps RUN.
- Hearts are Unicode glyphs (`Hearts.tsx:15-16`).
- Toasts/tips sit at `top: 64` (`Toast.tsx:78`). They collide with the "YARD ALARM" bar and boss timer (`play-s12-snow.png`: the tip covers YARD ALARM; `play-s10-boss.png`: YARD ALARM, SURVIVE and 58 are stacked tightly).
- **Fixes.**
  - Group the pickups into one horizontal tray top-right (3 × 44 dp).
  - Stance: a 2-state segmented WALK/CROUCH plus a bigger RUN (64 dp) bottom-right.
  - Look arrows smaller and further down.
  - Tips go bottom-centre above the joystick line, or below the alarm/timer block, via a HUD layout rule: top band = alarm/timer/distance, second band = toasts.
  - Hearts: drawn PNG icons at 22 dp with a dark outline.

### 2.17 UI: iconography consistency
- Mixed sources:
  - Emoji 💀 (`Banner.tsx:18`, `CatchFlash.tsx:60`, `runover-b.png`). It renders as a platform emoji with different art per OEM.
  - ★☆ (`Banner.tsx:16-17`).
  - ‹ › (`LookButtons.tsx:69,74`).
  - ♥♡ (`Hearts.tsx`).
  - ⚙ text (`SettingsScreen.tsx:213`; replacement already prepared).
  - The drawn-View handcuffs and pickup icons are good.
  - The gear sometimes has a boxed border (`endless.png`, `cleared-b.png`) and sometimes not (`menu-915-a.png`).
- **Fix.** One icon set: small PNGs at 3x in `assets/ui/` (OTA-safe; bundled assets ship with the OTA), or drawn Views like the PickupBag icons. Same stroke weight, gold/white only.

### 2.18 UI: panels / cards
- The cards (`cleared-b.png`, `runover-b.png`, `daily-over.png`) are decent: dark panel, gold/red border.
- Issues:
  - The stats block is a plain two-column list in monospace digits. There is no hierarchy between the hero stat (stars/distance) and the minor stats.
  - "Coins earned +0 (0)" is confusing.
  - Buttons use the system font (2.13).
- **Fix.**
  - Hero stat at display 40 dp.
  - Minor stats as 3 small tiles (icon + value + caption).
  - Stars animate in, 120 ms apart, with scale overshoot (reanimated is already present).
- **Profile screen** (`profile.png`):
  - Elements float over the scene with no panel.
  - The "1 NEXT" stage tile sits mid-screen, disconnected.
  - "0 coins" gold on gold.
  - Wrap it in a single panel with a left column (avatar, name, coins) and a right column (stage grid, modes).
- **Outfits** (`outfits.png`): swatch circles only, with no preview of the prisoner wearing the outfit. Show the 3D prisoner (already in scene) centred with the camera zoomed, and the grid at the side.

### 2.19 Motion / transitions
- Mode switches on the start screen are hard cuts.
- The tutorial overlay fades while the title is still visible behind it (`tutorial-2.png` shows a ghost "ESS ESCAPE").
- **Fix.** `FadeIn`/`FadeOut` + 8 dp slide (reanimated `entering`/`exiting`, 180 ms) on every panel. Hide the title while the tutorial is up.
- The alarm overlay is a hard-edged pink frame of 14/30 px borders (`AlarmOverlay.tsx:70-75`, `EdgeVignette.tsx:31-34`, `alarm-80.png`). It reads as a debug rectangle. Use a feathered vignette PNG (1 image, tinted) instead.

### 2.20 Safe areas / small screens
- **Nav bar.** The device screenshot shows the Android navigation bar visible on the right (not immersive). `edgeToEdgeEnabled: true` in `app.json:22` and `StatusBar hidden` (`App.tsx:64`) hide only the status bar. Needs `expo-navigation-bar` `setVisibilityAsync('hidden')` + `setBehaviorAsync('overlay-swipe')` (**needs new APK**).
- **640×360** (`menu-640.png`): the title wraps tightly, and the NEW RUN button overlaps the prisoner. Acceptable.
- **Name screen at 915×412** (`name-typed.png`): the keyboard covers the lower half and the text is legible.
- **Pause at 640×360** (`pause-640.png`): fits.

### 2.21 Web vs device notes
- The web ground renders lighter (`#777a67`) than on device (`#5f6859`). The device is darker because of display gamma and driver differences, but the washed-out character is the same on both.
- Mountain behaviour is identical on both (fog maths).
- The web shows "Version unavailable"; the device shows the real build line.
- Nearest filtering by design is fine.

---

## 3. Constraints per fix

| Fix | Draw calls | OTA? | Art replacement? |
|---|---|---|---|
| Ridge mountains + sky dome | −25 | yes | no (new procedural geometry, same style) |
| sRGB textures + retune | 0 | yes (verify on device) | no |
| Hemi light / sun move / mood retune | 0 | yes | no |
| Tree palette + instance colour | 0 | yes | no |
| Ground tint + dirt strip + variation | +1-2 | yes | no |
| Snow as Points sprite | 0 | yes | no |
| Title animation | n/a | yes | no |
| Button system / scrim | n/a | yes | no |
| Icon set PNGs | n/a | yes (bundled assets ride OTA) | minor new icon art |
| Feathered alarm vignette PNG | n/a | yes | minor |
| Hide nav bar | n/a | **needs new APK** | no |
| Outfit 3D preview | +0 | yes | no |

---

## 4. Phased plan

**Phase 1: quick wins (about 1.5-2 days, all OTA)**
1. Title: single-baseline text with a whole-word animation (30 min).
2. sRGB `colorSpace` on textures, retune emissive and ground tint (half a day, including a device check).
3. Tree palette + per-instance colour/scale (2 h).
4. Menu scrim, solid secondary button, text shadows; force a clear-weather menu scene (3 h).
5. Fog colour = sky colour in all moods (15 min). It already fixes the mountains' "lighter than sky" ghosting, pending Phase 2.

**Phase 2: world look (about 3-4 days, OTA)**
1. Replace the mountains with 2 vertex-coloured ridges + a gradient sky dome, with a per-mood palette (1 d).
2. Lighting rig: HemisphereLight, sun behind the camera, per-mood ambient/hemi/sun/emissive table; a real dark night; Endless mood rotation (1 d).
3. Ground: dirt path strip, large-scale variation, snow colour (0.5 d).
4. Weather: sprite snow, rain tint/darkening, beam cap (0.5 d).
5. Blob shadows under props; clouds as low-poly puffs or removed (0.5 d).

**Phase 3: UI system polish (about 4-5 days; OTA except nav bar)**
1. `ui/Button.tsx` + tokens; migrate the pause, cards, profile and start screens (1.5 d).
2. Icon set (hearts, stars, skull, arrows, gear) replacing emoji/Unicode (1 d).
3. HUD relayout: pickup tray, stance segmented control, toast band below alarm/timer (1 d).
4. Panels: profile and outfits layout with a 3D outfit preview, stat tiles and star animation on the cards (1 d).
5. Transitions + feathered alarm vignette (0.5 d).
6. Next APK: `expo-navigation-bar` immersive mode.

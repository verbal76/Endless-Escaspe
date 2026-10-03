> Read-only analysis at commit 02e13eb (OTA 131). Nothing here is implemented. Re-verify line references against the current code before acting; balance numbers predate several gameplay fixes.

# G: Performance preparation for real mid-range Android (read-only, HEAD 02e13eb / OTA 131)

No gameplay changes are proposed. Everything marked "sketch" is a design, not a patch. `Game.tsx:N` means `src/game/Game.tsx` line N at HEAD.

## 0. What the evidence says (and does not say)

Sources: `$SP/review2/C.md` (measurements on 370a624), `$SP/review2/C-integration.md`, the OTA-131-equivalent measurements in `$SP/webC2/out-*/result.json` and `c3-scenes.log`, and one extra measurement I ran for this report (the draw-call band script `$SP/webC2/bands.mjs` against `$SP/webC2/dist-all`, read-only, SwiftShader on desktop V8).

Draw calls now (after batching + far-chunk culling), from `webC2` results:

| Scene | Before (base) | After (`all`) |
|---|---|---|
| Campaign stage 1, z=40 | 366 | 361 (254 in the `c1` build before the later change) |
| Campaign stage 29, z=40 | 865 | 846 in c3 log; **349** in the `dist-all` run I just made |
| Campaign stage 29, z=150 | 519 | 509 (253 in `c1`) |
| Endless, 26 samples to 2.6 km | 1388-1784 (C.md) | median **655**, range 418-919, last 784; desktop worst `update` median 7.8 ms, max 18.5 ms |

Note the spread between builds `c3`/`all`: the numbers in `c3-scenes.log` do not match the `dist-all` band run for stage 29. I could not determine which build equals OTA 131 from the scratchpad. **Treat call counts as "about 350-850 campaign, about 400-900 Endless" until a device overlay (section 2) reports them.**

Where the remaining calls are (my band run, `dist-all`):
- Campaign stage 29, 349 calls: guard figures 36 (6 per guard), box/cylinder/sphere/ring/cone props 120+, dogs 16, guard/tower beam cones and floor circles 30, only about 19 calls (5 %) are farther than 140 m.
- Endless level 1, 388 calls: about **97 calls (25 %) are for objects more than 140 m ahead** (cylinders 14, guards 18, cones 20, circles 10, spheres 13, boxes 6, rings 3, planes 7, ...), all of it section-root content (guards, towers, cameras, fences, tree lines) that the chunk culling does not touch.
- Total scene objects (Endless, pre-batching m9 run): 785 at 100 m up to 1527 at 1.2 km. `render` is about 90 % of JS frame cost on desktop (C.md C-15: update p50 0.3 ms vs render p50 3.5 ms).

Mid-range Android translation: C.md states Hermes is about 5-15x slower than desktop V8 for this kind of JS. Desktop `render` after the batching/culling work is 1.5-4.0 ms (c3 log `renderMs`). On Hermes that is **about 8-60 ms of JS per frame**, i.e. the render submission alone can exceed the 16.7 ms budget on a weak phone; the game would then be JS-bound regardless of GPU. This is the main uncertainty, and the diagnostics in section 2 resolve it with real data.

Two more facts that shape the ranking:
- expo-gl runs GL commands on a separate thread. JS-side `render` time measures only command recording, so **JS ms cannot tell GPU-bound from JS-bound by itself**. The rAF interval (display period) compared with JS ms can: JS ms close to the interval means JS-bound; JS ms far below the interval means GPU- or vsync-bound.
- The EGL config in expo-gl asks for `EGL_DEPTH_SIZE 16` and `EGL_STENCIL_SIZE 8` (`node_modules/expo-gl/android/src/main/java/expo/modules/gl/GLContext.java:393`). Depth and stencil are not changeable from JS.

## 1. Remaining items, ranked by likely real-device payoff

Legend for "needs device before deciding": **DEVICE** = a go/no-go that real hardware must inform.

### Rank 1: (i-1) freeze static matrices (cheap, probably large on Hermes). DEVICE to size it, safe to build now.

- **What.** three.js recomputes local and world matrices for every object in the scene every frame (`renderer.render` calls `scene.updateMatrixWorld()`, which recurses into every child, visible or not, `node_modules/three/src/core/Object3D.js:586-622`). Nothing in `src/` sets `matrixAutoUpdate = false` (`grep -rn matrixAutoUpdate src` is empty). Fences, tree lines, the ground, win line, chunk roots, instanced batches, shadows, tower/camera bases are static, and culled chunks (`root.visible = false`) are still traversed.
- **Why it likely matters.** On the m9 CPU profile (Endless, 785-1527 objects, desktop V8), `updateMatrixWorld` + `multiplyMatrices` self time was 20 ms against 29 ms for `renderBufferDirect`, the per-draw submission (`$SP/review2/C/m9.out` TOP line). That is about 40 % of three's JS render path on a build that had more objects than OTA 131; on an interpreter the per-object compose + multiply loop is relatively worse.
- **Expected benefit.** Unknown on device; plausibly 15-35 % of render JS time in Endless. Not measured on the current build.
- **Risk.** Low to medium. Anything that moves after being frozen stops updating. Must not be applied to: guards, dogs, player, pickups (`animatePickup` writes `position.y`/`rotation.y` every frame, `Pickup.ts:85`), light-tower beams and camera heads (rotate), weather, backdrop clouds/birds, effects pools.
- **Sketch.** New helper `freezeStatic(obj)` in `src/util/dispose.ts` (or a new `src/util/staticMatrix.ts`): `obj.updateMatrixWorld(true); obj.traverse(o => { o.matrixAutoUpdate = false; })`. Apply right after creation to: `createGround()` result (`Game.tsx:621`), `createWinLine` (666), `spawnFences` output (`Game.tsx:538, 755`), `createTreeLine` (539, 756), `spawnChainLinkWall` (679), each chunk's static batch root in `ProcgenSystem.spawnChunk` (`ProcgenSystem.ts:693-747`; the instanced meshes created by `StaticBatch.ts`), and prop shadows (`createPropShadows`). The chunk root itself keeps `matrixAutoUpdate = false` too (it only toggles `visible`).
- **Measure on device.** Count objects with `scene.traverse` (cheap, once per scene build) and time `renderer.render` with the freeze on/off in a debug build; compare JS render ms p50/p95 from the overlay (section 2). On desktop, add a micro-benchmark that times `scene.updateMatrixWorld()` alone over the Endless scene (`$SP/webC2` harness can do this with `__ee.renderer.scene`).
- **Recommendation: GO (build, behind a flag, measure).** No gameplay effect; reversible. Do it after the diagnostics land so its effect is measurable.

### Rank 2: (f) cull Endless section roots. Desktop evidence exists; DEVICE to confirm payoff.

- **What it is.** `populateSection` (`Game.tsx:459-542`) puts guards, dogs, light towers, cameras, fences and a tree line under one `secRoot` per 120 m section. `ProcgenSystem.updateVisibility` (`ProcgenSystem.ts:750`, called at `Game.tsx:2388`) hides far *chunks* only. Section roots are never hidden.
- **Why it likely matters.** Measured above: 25 % of Endless L1 draw calls (97 of 388) are more than 140 m ahead; Endless median 655 calls versus 349 for the heaviest campaign stage, and the difference is almost all section content. Each guard costs about 6 draw calls for the figure alone plus beam cone, marker, laser, shadow, arrow. In a campaign it does not help (one section spans the whole stage: 5 % far calls).
- **Expected benefit.** About 25 % fewer calls in Endless; scales with level (more guards/towers per section later). Draw-call count translates to per-call JS cost on Hermes.
- **Risk.** Low-medium. A hidden guard must still simulate (it does: sim does not read `visible`), and a chasing guard must not pop. `Object3D.updateMatrixWorld` ignores `visible`, so `getWorldPosition(pistol)` (`Game.tsx:2067, 2330`) is unaffected. The one real hazard: a section that is "busy" (any guard not in `wander`/`return` or a dog chasing, `sectionBusy` at `Game.tsx:565`) must stay visible.
- **Sketch** (in the render path, right after `scene.procgen.updateVisibility(player.z)` at `Game.tsx:2388`; after decomposition step E8 this lives in `renderFrame.ts`):
  ```ts
  if (scene.endless) for (const sec of scene.sections) {
    const near = sec.zStart - 5 <= player.z + CULL_AHEAD && sec.zStart + sec.len + 5 >= player.z - CULL_BEHIND;
    const v = near || sectionBusy(scene, sec);
    if (sec.root.visible !== v) sec.root.visible = v;
  }
  ```
  Use `CULL_AHEAD`/`CULL_BEHIND` from `ProcgenSystem.ts:543-544` (140/40). Reinforcement guards live on `scene.root` (`Game.tsx:926`) and are not in any section; leave them alone. A finer variant culls per guard/tower `group` instead of per section (a 120 m section always has some part within 140 m, so section-level culling only saves the farthest section; per-object culling is what recovers the 97 calls). Prefer per-object: for each `guardEntry`, `dog`, `lightTower`, `camera`, set `group.visible = dist < 150 || busy`.
- **Measure on device.** Overlay draw calls in Endless at 500 m and 1 km before/after; look for pop-in near the culling boundary (C-1 notes the ~40x16 px pop area behind fog for chunks; LEDGER section 4 lists "far-chunk culling pop" as an open device check).
- **Recommendation: GO after device draw-call numbers confirm Endless is in the 600+ range on the phone.** If the phone runs Endless at 60 fps already, skip.

### Rank 3: (a) render-scale option. DEVICE decides the default; build the option only if the overlay says GPU-bound.

- **What.** Render at a fraction `s` of the physical resolution and let the OS scale it up. Today `Renderer.ts:21-40` sizes everything from `gl.drawingBufferWidth/Height`, which on Android is the full physical surface (C-8 estimates 2400x1080 = 2.6 MP). There is no pixel-ratio or quality setting.
- **Why it might matter.** Fill-rate on mid-range Mali/Adreno with 105-174 transparent drawables, an 800x1800 m ground plane, translucent floors, floodlight cones and weather (C-8). Pixel count scales with s squared: 0.75 -> 56 % of pixels, 0.67 -> 44 %.
- **Why it might not.** If frames are JS-bound (Rank 1/2), scaling pixels does nothing. Evidence either way is absent: SwiftShader cannot measure GPU time. Cost of the trick: bilinear upscaling blur on a TextureView; the HUD (RN views) stays sharp.
- **Expected benefit.** 0 to large; entirely device dependent.
- **Risk.** Medium, because of context re-creation (below).
- **What exists now in the code (checked, since the brief asked).**
  - `Game.tsx:235-239`: `onContextCreate` begins with `disposeRef.current?.()`, which stops the old loop and releases audio (`2473-2480`: `loop.stop()`, `unsubVolume()`, `music.dispose()`, `sfx.dispose()`, `siren.dispose()`). `useEffect` cleanup at `230-233` does the same on unmount.
  - It does **not** call `tearDownScene(scene)`, `r.renderer.dispose()` or `disposeSubtree(r.worldRoot)`. After a GLView remount the old context is destroyed natively (`GLView.kt` `onSurfaceTextureDestroyed` calls `glContext.destroy()`); the JS objects become garbage once the closure is released. Shared textures survive: `util/textures.ts:110-130` (`releasePixelsAfterUpload`) re-decodes the PNG on demand when a new renderer uploads a texture again (covered by `tests/textureRelease.test.ts`).
  - `onContextCreate` rebuilds the world from the store: `scene = buildScene(initialStage, segmentSeed, gameMode)` (`Game.tsx:802-805`), but `lastRunState = st.runState` (872) means **no `resetSegment()` runs**. If the context is re-created in the middle of a run, the player is at `createPlayer()`'s start position, guards are at their homes, `tracker` and Endless `maxZ` restart at zero, hearts/stage/inventory stay as in the store. So a scale change must not be applied mid-run. Rule: the setting applies from the idle menu (Settings is reachable there) or at the next run start.
- **Sketch.**
  1. Store field `renderScale: number` (default 1), added in `store.ts` (next to `weatherEnabled`/`hapticsEnabled`, lines 91-93, 266-275, 367-369), `storage.ts` (`DEFAULT_SETTINGS` and the parse at 58-108, validate to {0.6, 0.75, 1}), `settingsAutosave.ts` (`AutosaveFields` at 12-16, `pick`/`same` at 29-40), and a row in `SettingsScreen.tsx` (next to the Vibration toggle at 350-357).
  2. In `Game()`: `const s = useStore((st) => st.renderScale)`, `const { width: W, height: H } = useWindowDimensions()`. Render `<View style={StyleSheet.absoluteFill} pointerEvents="none"><GLView key={s} style={{ position: 'absolute', width: W*s, height: H*s, left: (W - W*s)/2, top: (H - H*s)/2, transform: [{ scale: 1/s }] }} onContextCreate={onContextCreate} /></View>` (C-integration section 7). `Renderer.ts` needs no change because it reads the drawing buffer size, so the camera aspect stays correct.
  3. Input is unaffected: `Joystick`, `RunButton`, `ActionButtons` etc. are siblings of the GLView in `Game.tsx:2486-2506`, not children (verify no HUD component measures the GLView).
  4. Alternative without remount: render to a `WebGLRenderTarget` of size `s*W x s*H` and blit with a full-screen quad. Adds a pass and memory (and is worse on tilers); only worth it if remount-on-change is unacceptable.
- **Measure on device.** The A/B is the decisive experiment: same scene, scale 1.0 vs 0.75, compare rAF interval and dropped frames in the overlay. If the display period does not improve, it is JS-bound and the option is pointless.
- **Recommendation: NO-GO for a default change; GO to build the option behind a hidden/experimental Settings row only after the owner's device test shows the game is below target fps with low JS ms (GPU-bound).** Needs a physical device.

### Rank 4: (b) shader prewarm for the first rain/snow stage. DEVICE to size, low risk.

- **What.** The first stage with rain or snow compiles programs on the first rendered frame: `RAIN_MAT` is a `LineBasicMaterial` (`Weather.ts:27`), `SNOW_MAT` a `PointsMaterial` (58), and the snow ground swaps `emissiveMap` to null (`Game.tsx:646-660`), a new program variant. C-6 measured 3 new programs and a 55 ms first render on desktop; driver-side compile and link on a phone is usually much slower than the JS cost (tens to hundreds of ms per program on Mali/Adreno).
- **Expected benefit.** Moves a one-time hitch (roughly 0.1-0.5 s on a phone, unmeasured) from the first rain/snow stage start to boot, where the splash is already up. Does nothing for later frames.
- **Risk.** Low. Needs the compile to use the same light set and fog as the real scene so the cache key matches. three r166 supports this directly: `renderer.compile(scene, camera, targetScene)` uses `targetScene`'s lights and fog for the program key (`node_modules/three/src/renderers/WebGLRenderer.js:927-1010`, `prepareMaterial(material, targetScene, object)`). The C-integration sketch (section 5b) used clones of the lights in a throwaway scene, which is more fragile. Better:
  ```ts
  // after the first buildScene + applyStageLighting (Game.tsx ~819)
  const warm = new THREE.Group();
  warm.add(createWeather('rain', 0, 0).group, createWeather('snow', 0, 0).group);
  const g = createGround(); (g.material as THREE.MeshLambertMaterial).emissiveMap = null; (g.material as THREE.Material).needsUpdate = true;
  warm.add(g);
  try { r.renderer.compile(warm, r.camera, r.scene); } finally { disposeSubtree(warm); }
  ```
  Weather materials are module-shared (`Weather.ts:79` `markShared`), so `disposeSubtree` skips them; the per-instance ground is freed.
- **Verify.** Log `renderer.info.programs.length` before and after compile and again at the first rain stage start; it must not grow at the stage start. Expo-gl has no `KHR_parallel_shader_compile`, so `compile` blocks (do it behind the splash, not during play).
- **Needs device?** Yes for sizing, no for correctness.
- **Recommendation: GO (cheap), but gated behind the boot screen only; skip if the overlay's "first frame after rebuild" for the first rain stage is already under about 100 ms.**

### Rank 5: (d) defer `rebuildScene` by a rendered frame so the tapped button paints first. DEVICE.

- **What.** The three rebuild paths all run inside `update()`: seed/stage/mode change (`Game.tsx:1438-1457`), restart (1469-1484), fresh start from idle (1492-1519). `rebuildScene` costs a median 23 ms and up to 96 ms (Daily) on desktop (C-6) plus a 20-55 ms first render; on Hermes that is a 0.3-1.5 s frozen frame right after tapping NEXT STAGE / START, with the button's pressed/dismiss state not yet committed by React.
- **Expected benefit.** Perceived responsiveness at every stage start; no change to gameplay time. Magnitude on device unknown.
- **Risk.** Medium. Changes a delicate state machine. While a rebuild is pending, the store already holds the new stage/seed but the world is the old one, so `update` must return early (no sim) until the rebuild runs. `lastSegmentSeed/lastStage/lastMode` cursors, `rebuiltNow` and `bossIntroPending` must keep their meaning. Counting must use **rendered frames**, not sim steps (`update` can run twice per rAF after a stall), i.e. count in `render` or compare `performance.now()` since the request.
- **Sketch.** Implement inside the transition planner from decomposition step E3 (a `pendingRebuild: { framesLeft: number } | null` in the executor) rather than patching the 83-line block in place. C-integration section 5a has a first draft; adopt it only after E3 exists, or the diff collides with every other change to `update`.
- **Measure.** On device log tap-to-first-new-frame: timestamp in `Pressable.onPress` for NEXT STAGE, then `logDebug` the first `render` after `rebuildScene`. Overlay shows the rebuild ms.
- **Recommendation: HOLD until the overlay shows rebuild time over about 150 ms on the phone. If it does, GO, after E3.**

### Rank 6: (c) frame-spread Endless `populateSection`. DEVICE.

- **What.** Chunk generation is already spread (`streamEndless` calls `procgen.prefetch(..., 1)` once per frame, `Game.tsx:794`; the banded NavGrid flood made generation about 6 ms median). `populateSection` (guards, dogs, towers, cameras, fences, tree line: `Game.tsx:459-542`) and `removeSection` (`disposeSubtree`, 575-594) still run in one frame inside `streamEndless` (767-795).
- **Evidence.** Desktop worst `update` per 100 m step after the changes: median 7.8 ms, max 18.5 ms (`out-all/result.json`; average 0.2-0.5 ms). Before the changes it was 30-72 ms (C.md C-2). On Hermes, 8-18 ms x 5-15 = about 40-280 ms, once every 120 m (about every 25-35 s of running).
- **Why the slack exists.** `streamEndless` builds section k when `k * 120 < player.z + 240` (`Game.tsx:769-770`), i.e. about 240 m before the player reaches its start, so a queue spread over many frames is safe.
- **Sketch.** In the future `EndlessStreamer` (decomposition step E7): replace the inline `populateSection(s, k, ...)` with a job queue `[{k, part:'guards'|'towers'|'fences'|'trees'}]` processed one part per frame; run `removeSection` on a different frame than any populate; add a "catch-up" rule that completes all jobs synchronously if `player.z > sec.zStart - 100` (covers the teleport-style scenarios `review.mjs advance()` uses, `player.z += 60`). Splitting `populateSection` into parts requires that part B does not depend on part A's guard list except `sectionGuards` for dogs.
- **Risk.** Medium (parallel arrays `guardEntries/guards/threatArrows` and `s.nextSection` ordering; see F-gametsx E7 traps).
- **Needs device?** Yes: do nothing unless the on-device section-build ms (section 2) exceeds about 30 ms.
- **Recommendation: HOLD; do E7 first; decide from the overlay's `streamEndless` ms. If p95 > 30 ms, GO.**

### Rank 7: (g) overlapping visual/audio feedback. No device needed for the plan; effect on frame cost is small but real. GO as a design merge, after the playtest.

Current signals driven by the same quantity (code):

| Signal | Driven by | Threshold | Where |
|---|---|---|---|
| Red feathered edge ring (8 nested Views, pulsing) | max over `store.detection` quantised to 0.1 | shown above 0.2 | `AlarmOverlay.tsx:16-63` |
| Amber then red edge tint (4 edges x 3 bands x 2 colours = 24 Views) | `dangerLevel` (= max detection, `Game.tsx:2175`) | none below 0.3; red share from 0.6 | `EdgeVignette.tsx:41-62`, `util/feel.ts:4-8` |
| Siren audio | max detection | plays from 0.25, fade-in span 0.1 | `scenes/Siren.ts:28-30` |
| Music tension | max detection and `anyChase` | alert from 0.45, chase 0.95 or any chasing guard | `util/musicIntensity.ts:24-27` |
| "spotted" sting | rising edge of `anyChase` | | `Game.tsx:2182` |
| In-world: radial meter, threat arrows, "!" markers | detection / state | | `Game.tsx:2335-2376, 2124-2158` |

On a catch: hit-stop 0.14 s + camera shake 0.28 s (`Game.tsx:1155, 886`), sfx (`hurt`/`caught`), haptic, `CatchFlash` badge (1.1 s: 140 ms in, 700 ms hold, 240 ms out), `EdgeVignette` hit pulse (0.9 opacity, 60 ms + 650 ms, `EdgeVignette.tsx:45-52`), and on the **run-ending** catch also `EventFlash` (0.55 opacity red flash, `EventFlash.tsx:27-33`) and the `Banner`. So the final catch stacks six visual/audio events within about one second.

Costs: two independent full-screen animated overlays for the same value (32 translucent Views composited over a TextureView every frame while pulsing) and two quantisations of the same signal (0.1 steps in `AlarmOverlay`, 0.04 in `dangerLevel`), plus four different thresholds (0.2, 0.25, 0.3, 0.45) for "the player is in danger".

**Merge plan: one owner per signal.**
1. **Continuous danger (screen edge): `EdgeVignette` is the single owner.** Remove `AlarmOverlay` from `Game.tsx:2486`. Port its pulse (period tightening with level) into `EdgeVignette` as an optional shared value; keep the amber to red colour ramp (colour is useful beyond red-only; ledger D-25 notes colour-only indicators). Reduce its band count from 12 Views per colour to the 4 it needs (a feathered border can be one `View` with a RN `borderWidth` ring or a pre-rendered image). Source: `dangerLevel` only (already quantised in the store); drop the per-update loop over `detection` in `AlarmOverlay`'s selector.
2. **Catch event: one visual owner.** `CatchFlash` (information: ARRESTED/KILLED + icon). Drop the `EdgeVignette` hit pulse and the `EventFlash` red variant for the `caught` state (keep `EventFlash` gold for `cleared`, it is the only celebratory flash). Impact feel is already carried by hit-stop, camera shake, sfx and haptic in the sim (`Game.tsx:1169-1182`), not by overlays.
3. **Audio danger: Siren owns the continuous level; Music owns the mood state; the sting owns the edge.** Concretely: keep the siren threshold at 0.25 (it is documented to match the overlay, `Siren.ts:23-27`), keep music alert/chase, and suppress the `spotted` sting when the siren is already audible (`maxDetection >= 0.25`) so a chase onset is not three simultaneous cues. This changes feel, so the owner must listen before accepting.
4. **One mapping function.** New pure `threatSignals(maxDetection, anyChase, runState) -> { edge: {color, opacity, pulseHz}, sirenVol, musicState, sting }` with one set of thresholds, unit-tested; each sink (EdgeVignette, Siren, MusicIntensity, sting) reads from it.
- **Risk.** Low-medium; pure presentation but it changes the look/sound the owner is about to playtest, so it belongs after the playtest and with their sign-off.
- **Measure.** Count of animated full-screen Views at the worst case (before: 3 overlays x up to 12 Views; after: 1-2); overlay frame period in a chase.
- **Recommendation: GO after the playtest, as one change; not performance-critical, mostly clarity.**

### Rank 8: (e) interpolate guards and dogs. DEVICE (display refresh rate).

- **What.** Player and camera are interpolated (`Game.tsx:2247-2249, 2389-2391`); guards and dogs are drawn at their latest sim position (`setFigurePosition(fig, g.x, g.z)` at 2307, `placeBlobShadow` at 2280-2308; dogs are positioned inside `update` by `setDogTransform(d)` at 2166).
- **Why it might matter.** Only on displays above 60 Hz (or when render and step phases drift). `Loop.ts` already snaps vsync jitter so at 60 Hz each render sees exactly one step. On a 90/120 Hz phone, guard motion is quantised to 60 Hz steps: at the 5 m/s chase speed (`GuardAI.ts:28`) that is 8.3 cm per step. Not measured on a device (LEDGER section 4 lists "90 / 120 Hz smoothness").
- **Cost/risk.** Low risk, moderate effort: per-guard `prevX/prevZ` written at the start of `update`, a draw-position lerp in render, and the animation `moving` test at `Game.tsx:2287-2289` (`fig.group.position.x !== g.x`) must change to compare sim positions, otherwise the walk cycle stops whenever the drawn position equals the sim position. Dogs: move `setDogTransform` from `update` (2166) into render, keep one-step-old state for the lerp. All guards need the same one-step latency as the player (already accepted).
- **Measure.** Overlay reports the actual display period (rAF median interval). If it is about 16.7 ms, this is pointless.
- **Recommendation: NO-GO until the overlay shows a >60 Hz display and the owner notices guard stutter.** Needs a physical device.

### Rank 9: (h) 16-bit depth / near plane. Free; do the near plane, verify bits.

- **Evidence (C-11, `C/m7`).** Same frame in 24-bit vs 16-bit depth: 764 px differ (0.2 %), mostly far ridge/cloud/tree-line edges; with `near = 0.5` the difference falls to 236 px; near 0.1 vs 0.5 at 24-bit differs by 3 px. Camera near is still 0.1, far 1500 (`Renderer.ts:50`, unchanged at HEAD).
- **Camera geometry check.** Camera is 7 m high and 8 m behind (`CameraRig.ts:6-7`) and within the playfield (|x| <= 8.55); towers stand at x = +-9.6 (B.md B-5), so nothing comes within 1 m of the camera; near = 0.5 is safe. The Backdrop dome radius 1400 requires far >= 1400, so far cannot drop without redoing the dome.
- **Un-protected decals (C-11):** win line y=0.02 (`PrisonYard1.ts:263`), footprints 0.012, rings/arrows 0.035-0.04; they have no polygonOffset. At near=0.5 in 16-bit they are fine near the player; only distant decals alias.
- **Verify first on device.** Log `gl.getParameter(gl.DEPTH_BITS)` and `gl.getParameter(gl.STENCIL_BITS)` in the Build/Update Info (many devices return 24 even when 16 is requested). If 24, the whole item is moot.
- **Risk.** Very low. One constant change plus a rebuilt projection (already done by `PerspectiveCamera` ctor).
- **Recommendation: GO for `near = 0.5` (one line); do not touch far.** Needs a device only to learn the real depth bits.

### Rank 10: (i) other cheap render-path items found while reading

| # | Item | Evidence / location | Benefit | Risk | Go? |
|---|---|---|---|---|---|
| i-1 | freeze static matrices | see Rank 1 | high (Hermes) | low-med | GO (measure) |
| i-2 | cap idle-menu rendering to 30 fps | `isStatic` only throttles a paused run (`Game.tsx:2437-2440`); the idle splash demo renders at full rate (`Loop.ts` has `RENDER_THROTTLE = 4`, only used when `isStatic()` is true). A 2-frame throttle for `runState === 'idle'` halves menu GPU/CPU and heat. The demo is a slow crouch walk; 30 fps is not visible. | battery/thermal in menus | very low | GO |
| i-3 | skip pose/laser/arrow/marker work for far guards | `Game.tsx:2284-2333` runs `updateFigurePose`, `poseGuardArms`, `updateAimLaser`, `updateGuardStateMarker` for every guard including ones 200 m away, and `updateThreatArrow` for all (2363-2376); pairs with Rank 2 | small CPU, scales with guard count (up to 15 in Endless, `m9.out`) | low (pose pops on re-entry if phase is not time-based; `time: animTime` is, so it is continuous) | GO after Rank 2 |
| i-4 | per-frame allocations (C-15) | `tuning` object (`Game.tsx:1920`), `updateDogs` options (1971), per-guard fire closure (2062), rock callback (1793), `seenTips()` array spread, `forks()` returning a new array (`ProcgenSystem.ts` per C-15) | less GC churn on Hermes (young-gen) | low | GO opportunistically, inside decomposition E1/E5 |
| i-5 | `sortObjects` | default three sorts ~400-900 objects each frame; transparent decals rely on `renderOrder` (`StealthCues.ts:34,83`, `BlobShadows.ts:73,107`, `Backdrop.ts:150`, `PrisonYard1.ts:245`) | small | **high if disabled** | NO-GO |
| i-6 | GPU/driver facts in diagnostics | `DEPTH_BITS`, `STENCIL_BITS`, `SAMPLES`, `drawingBufferWidth/Height`, `RENDERER`/`VENDOR` (via `WEBGL_debug_renderer_info`), `MAX_TEXTURE_SIZE`, `getSupportedExtensions()` (ledger D-22 "GPU diagnostics in player-facing Build / Update Info") | answers (a), (h), and the GPU class of the phone | none | GO (part of section 2) |
| i-7 | `LightTower` / guard beam shader colour space and fog (C-12) | `LightTower.ts:29-80`, `GuardEquipment.ts:31` | correctness, not speed | low | out of scope here |
| i-8 | pickups animate even when culled | `Game.tsx:2253` iterates all pickups; Endless keeps a few hundred | negligible | none | NO |

## 2. On-device diagnostics (no gameplay change): perf overlay + frame ring buffer in the bug report

Goal: real numbers from the owner's phone that decide Ranks 1-6, delivered through the existing bug-report path, so the owner does one normal playtest and presses the existing bug-report/share-info button.

Existing hooks to reuse (verified): `util/support.ts:20-26` (`infoRows()` assembles Build/Update Info rows and the bug report), `util/renderAudit.ts` (`getRenderAudit()` + `formatAuditRows()` is exactly the pattern: module-level cache + formatter), `util/debug.ts` (120-entry persistent ring log; error entries flush at once), `components/HUD/BuildInfo.tsx` (the panel), `Loop.ts` (`now`, rAF timestamps), `GameRenderer` (`r.renderer.info`).

### 2a. `src/util/perfStats.ts` (new, pure, testable under `npm test`)

```ts
export type PerfSnapshot = {
  frames: number; periodMs: { p50: number; p95: number; max: number };      // rAF-to-rAF
  updateMs: { p50: number; p95: number; max: number };                       // sum of sim steps in the tick
  renderMs: { p50: number; p95: number; max: number };                       // JS time inside render()
  stepsPerFrame: { zero: number; one: number; two: number; more: number };   // counts
  drawCalls: { p50: number; max: number }; triangles: { p50: number; max: number };
  objects: number;                                                           // scene.traverse count at build
  longestFrame: { ms: number; phase: 'update' | 'render' | 'gap'; atZ: number | null; mode: string };
  events: Array<{ kind: 'rebuild' | 'section' | 'firstFrameAfterRebuild' | 'auditFrame'; ms: number; detail?: string }>; // last 12
  displayHzEstimate: number | null;
  gc: { count: number; ms: number } | null;                                  // only if the runtime exposes it
};
export function createPerfRecorder(capacity = 600): { record(f: FrameSample): void; event(kind, ms, detail?): void; snapshot(): PerfSnapshot; reset(): void };
```
Preallocated `Float32Array(600)` rings (10 s at 60 Hz), percentile by copy + sort at snapshot time only (not per frame). Per frame cost: three `performance.now()` calls and a few array writes.

### 2b. Instrumentation points (all additive, no logic change)

- `Loop.ts` tick: `framePeriod = t - last` (before the 0.1 s clamp) and the number of `update` steps executed this tick; pass to the recorder via a new optional `onFrame?(sample)` option, so `loop.test.ts` can test it.
- `Game.tsx` (or `renderFrame.ts` after E8): `const t0 = performance.now()` around `update` call sites is awkward inside the closure, so time them in `Loop.ts` (it calls both) and let `Game` supply `r.renderer.info.render.calls/triangles` and `scene` object count via an `onFrame` callback.
- `streamEndless` (`Game.tsx:767`), `rebuildScene`+`resetSegment` (`1448-1449`, `1481-1482`, `1515-1516`): wrap with `performance.now()`; call `recorder.event('section', ms)` / `event('rebuild', ms)`. The frame after a rebuild: `event('firstFrameAfterRebuild', renderMs)`. `logDebug('warn', 'slow frame', ...)` only when a frame exceeds 50 ms (at most one per second, same throttle idea as `lastFrameErrorAt`, `Game.tsx:2431`), so the persistent log carries the evidence even if the app is killed.
- GC: probe once at start `typeof (globalThis as any).HermesInternal?.getInstrumentedStats === 'function'`. If present, sample `numGCs`/`gcTime` deltas every second; otherwise record `gc: null` ("not exposed by this runtime"). Unverified: I could not confirm from the repo whether the release Hermes build exposes it, so the overlay must print "unavailable" instead of assuming.

### 2c. How it reaches the owner

- **Bug report/Share info** (primary): `formatPerfRows(snapshot)` appended in `support.ts:infoRows()` after `formatAuditRows(getRenderAudit())`, rows like `Frame period p50/p95/max: 16.7/21.4/68 ms`, `Update p50/p95`, `Render JS p50/p95/max`, `Draw calls p50/max`, `Slow frames (>50 ms): n`, `Longest frame: 142 ms (render, Endless z=1840)`, `Section build (last 5): 22, 31, 18, ...ms`, `Rebuild (last 3): ...`, `Display Hz est.: 59.9`, `Depth bits / samples / drawing buffer / GL renderer`.
- **Optional overlay.** Hidden toggle (e.g. tap the version text 5 times in `BuildInfo`, or a `perfOverlay` boolean not shown in normal Settings) that renders a 3-line RN `Text` in a corner updated at 2 Hz from `recorder.snapshot()`. It must be RN, not drawn into GL, to avoid affecting the render path. Persist the toggle in the existing settings record only if wanted; otherwise session-only.
- **The interpretation key** (put it next to the rows so the owner/dev can read them without guessing):
  - period about equal to JS (update + render) -> JS-bound (Ranks 1, 2, i-3);
  - period >> JS and period > 16.7 ms -> GPU or compositor bound (Rank 3, render scale);
  - period about 16.7 with p95 spikes -> hitches: look at `events` (Rank 4-6);
  - period about 8.3 ms or 11.1 ms -> 120/90 Hz display (Rank 8 becomes relevant).

### 2d. A second, lighter on-device experiment set (all behind the hidden toggle, session-only, none change gameplay)

1. **A/B of render scale** (after Rank 3 exists): same scene, 1.0 vs 0.75, compare the interpretation key above.
2. **Draw-call probe**: toggle `sec.root.visible=false` for far sections (Rank 2) and `freezeStatic` (Rank 1) at runtime and read call/ms deltas.
3. **"No-draw" baseline**: skip `r.draw()` for 120 frames and read the rAF period to measure the JS+compositor floor.

### 2e. Cost and safety

Overhead is a few microseconds per frame; the recorder lives outside `Game.tsx`'s closure state except for the single callback hookup (so it is compatible with the Game.tsx lock in F-gametsx-decomposition.md: the hookup is a one-line wiring note). Nothing in the gameplay path reads recorder values.

## 3. Summary ranking by likely real-device payoff

| Rank | Item | Payoff | Needs device before deciding |
|---|---|---|---|
| 1 | Freeze static matrices (i-1) | likely largest JS win on Hermes | to size it; safe to build |
| 2 | Cull Endless section content (f, i-3) | about 25 % of Endless draw calls | confirm Endless is draw-call bound |
| 3 | Render scale option (a) | 0 to large, GPU-bound devices only | **yes**, decides GPU vs JS bound |
| 4 | Shader prewarm (b) | one-time hitch at first rain/snow | size it |
| 5 | Defer rebuild a frame (d) | stage-start responsiveness | **yes** (tap to first frame) |
| 6 | Frame-spread populateSection (c) | removes a 120 m hitch in Endless | **yes** (section ms) |
| 7 | Feedback signal merge (g) | clarity, small cost | no |
| 8 | Interpolate guards/dogs (e) | only >60 Hz screens | **yes** (display Hz) |
| 9 | near plane 0.5 (h) | tiny, free | verify depth bits |
| - | Diagnostics (section 2) and idle 30 fps cap (i-2) | enables all decisions / battery | no |

**Build first (before the owner's next device session): the diagnostics (2a-2c) and the GPU facts (i-6).** They are additive, do not change gameplay, and turn every "needs device" above into a data point from one playtest. The Game.tsx hookup is minimal (one `onFrame` option and two `performance.now()` pairs) and should go through the single-owner protocol.

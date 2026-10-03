# Review C: rendering correctness, performance, memory, frame pacing

Reviewer: C (graphics/perf). Scope: the frozen web build of **370a624**, served on port 8803 and rendered with SwiftShader. Source reads are from the same tree.
Note: the repo has since moved. HEAD is now 1fc8815 and the working tree has an uncommitted change to `src/util/geometry.ts` that someone else made. The file:line references below are for 370a624. This review changed nothing in the repo.

Scripts and raw output are in `review2/C/`:

| Script | What it measures |
|---|---|
| `m1.mjs` | Rebuild cost, draw calls and programs per stage |
| `m2.mjs` | Render-audit cost, draw-call breakdown, first-use shader compiles |
| `m3.mjs` | Draw calls by distance band |
| `m4.mjs` | 20 s of play: frame-time distribution, store notifications, allocation sampling |
| `m5.mjs` | 30 rebuilds and 30 restarts with lifecycle counts |
| `m6.mjs` | Program re-resolution per frame, and the effect of a fix |
| `m7.mjs` | 16-bit vs 24-bit depth |
| `m8.mjs` / `m9.mjs` | 3 km Endless run, with a CPU profile in m9 |
| `loopsim.mjs` | Replays Loop.ts frame pacing at different display rates |
| `js/run.mjs` | Embedded PNG decode timing |

How to read the numbers:
- Timings are desktop V8 with JIT, or `--jitless` where noted. Hermes on a mid-range Android phone is roughly 5-15x slower for this kind of JS, so treat the ms values as relative. The counts (draw calls, programs, readPixels, store updates, geometries) are exact.
- For most measurements the real loop was stopped (rAF set to a no-op) and frames were driven by calling `__ee.update(1/60)` and then `__ee.render(0)`.

---

## Findings (sorted by severity)

### C-1 (S2) Draw-call count is very high and grows with stage and Endless distance — measured
**Evidence (m1, m3, m8)** — `renderer.info.render.calls` after one frame:

| Scene | Calls |
|---|---|
| Stage 1 | ~405 |
| Stage 5 | 534 |
| Stage 9 | 607 |
| Stage 15 | 751 |
| Stage 25 | 861 |
| Stage 29 | **948** |
| Boss arenas (10/20/30) | 277-337 |
| Endless start | 697 |
| Endless at 1.1 km | 1388 |
| Endless at 2.3 km | **1784** |
| Endless at 2.9 km | **1768** |

Triangles: about 95 k at stage 1 and about 310 k at stages 15/25/29.

Breakdown at stage 29 (m2):
- 323 of the 577 visible drawables are **kit props built as individual multi-material Meshes**: `createKitProp`, `src/scenes/KitProps.ts:137-156`, called once per obstacle from `ProcgenSystem.spawnChunk` (`src/systems/ProcgenSystem.ts:627-631`).
- Multi-material groups add **+341 calls** at stage 29 (+123 at stage 1).
- Transparent DoubleSide materials draw twice, adding +28 calls (see C-3).

By distance band (m3, z-distance from the player):

| Scene | <30 m | 30-60 | 60-120 | 120-250 | >250 / unculled |
|---|---|---|---|---|---|
| Stage 29 | 226 | 100 | 191 | 287 | 131 |
| Endless L1 | 124 | 53 | 86 | 241 | 172 |

So **44-58 % of the calls are for objects more than 120 m away**. Fog does not hide them: fogFar is 520-560 m (`src/scenes/Lighting.ts:46,67`).

**Root cause and defect class.** Static per-chunk scenery is built as one Mesh per sub-mesh per prop. Only trees and prop shadows are instanced. Nothing culls by distance. The same pattern affects guard equipment, threat arrows, markers and lasers, which are separate meshes and materials per guard.

**Fix (OTA-safe: yes).**
1. **Distance-cull per chunk.** Group each chunk's meshes under one Group (or tag them) and set `visible = false` for chunks more than ~140 m ahead or more than 30 m behind the camera. Optionally lower yard fogFar to about 250 m so distant props fade in. Cheapest change; roughly −45 % calls.
2. **Batch static props per chunk.** For each (kit kind, sub-mesh) use one `InstancedMesh` per chunk. The OBJ templates are already shared (`parseTemplate`). Alternatively, `mergeGeometries` the chunk's props per material. That gives ≤ ~15 calls per chunk instead of ~60-120.
3. Combine with C-3.

**Regression check.** A harness assert that `info.render.calls` stays ≤ 450 at stage 29 and at Endless 2.5 km, using m3/m8 as the template. Also compare screenshots before and after (props within 120 m must be pixel-identical).

### C-2 (S2) Endless section streaming does all generation work in one frame (mid-run hitch every ~120 m) — measured
**Evidence (m8).** The worst `update()` time in each 100 m step of a 3 km run was **30-72 ms** (desktop V8 JIT) whenever a section streamed in. Steps with no streaming took 1.5-2.2 ms. The average update was 0.6 ms.

CPU profile (m9, ~1.2 km): the top app-code self times are:
- `NavGrid.flood` (bundle 867:2200): 267 ms
- its per-cell closure `c` (867:2493): 192 ms
- `bufferData`: 52 ms (first upload of the new section's buffers)

`streamEndless` (`src/game/Game.tsx:767-791`) runs `procgen.extendTo()`, `populateSection()` and `removeSection()` synchronously inside the fixed-step `update`. `generateChunk` (`src/systems/ProcgenSystem.ts:404-470`) calls `grid.flood()` up to 9 attempts plus 2 fork checks plus 1 capped flood per chunk, for 5 chunks per section. Each flood:
- allocates two whole-grid typed arrays
- creates a closure per visited cell (`src/systems/NavGrid.ts`, `flood`)

On Hermes (no JIT) this is a several-hundred-ms freeze while the player is being chased.

**Defect class.** Unbounded synchronous work in the frame loop. The same applies to `rebuildScene` (C-6) and the render audit (C-4).

**Fix (OTA-safe: yes).**
- Time-slice the stream. Generate and populate at most one chunk (24 m) per frame, starting about 2 sections ahead. The trigger is already `player.z + 2*LEN`, so there is ample lead.
- In `flood`, reuse scratch `Uint8Array`/`Int32Array` buffers and replace the per-cell closure with inline neighbour checks. Expect 3-5x faster on an interpreter.
- Optionally pre-warm GPU buffers with `renderer.initRenderTarget`/`compile` on the new section root.

**Regression check.** m8 assertion: worst update ≤ 8 ms on desktop across a 3 km run. Add a unit test that the flood result is unchanged after the refactor (compare masks for seeded chunks).

### C-3 (S3, perf) Three.js re-resolves 48 programs per frame: transparent DoubleSide two-pass, plus materials shared by Mesh and InstancedMesh — measured
**Evidence (m6, stage 12).** `material.customProgramCacheKey` was wrapped to count calls. three calls it from `getProgram → getProgramCacheKey`, which runs `getParameters` and joins a ~100-entry string array.

| | Program resolves/frame | MeshBasicMaterial(T) | MeshBasic+map(T) (blob shadows) | Tree leaves/bark |
|---|---|---|---|---|
| As shipped | **48** | 36 | 8 | 4 |
| Instanced/plain materials split | 36 | 36 | 0 | 0 |

The allocation profile (m4) confirms the cost. Over 20 s, `getParameters` allocated 37 MB, the program-key push array 23 MB, and `join` 29 MB: about 75 KiB/frame of garbage from this path alone.

Causes:
1. **three r166 renders every `transparent && side===DoubleSide && !forceSinglePass` object twice and sets `material.needsUpdate=true` before each pass.** See `node_modules/three/src/renderers/WebGLRenderer.js:1602-1612`. That forces a full program lookup and doubles the draw calls. The materials affected in src:
   - `Weather.ts:74`, `GuardEquipment.ts:31`, `SwingArc.ts:14`, `GuardStateMarker.ts:85`
   - `StealthCues.ts:27,125`, `Camera.ts:36`, `LightTower.ts:39,67`, `Pickup.ts:28`
   - `Backdrop.ts:84`, `ThreatArrow.ts:39`, `Juice.ts:139`, `PrisonYard1.ts:161`, `Fence.ts:104`

   Almost all of these are flat ground decals or billboards, where the back-face pass is pointless.
2. **A shared material is used by both Mesh and InstancedMesh.** `BLOB_MAT` (`src/scenes/BlobShadows.ts:39-55`) is used by `createBlobShadow` (Mesh) and `createPropShadows` (InstancedMesh). KitProps `materialFor` (`KitProps.ts:80-104`) is used by `createKitProp` and `createKitPropInstances`. three flips `materialProperties.instancing` and re-resolves on every switch (`WebGLRenderer.js:1852-1872`).

**Fix (OTA-safe: yes).**
- Add `forceSinglePass: true` to those materials. Keep two-pass only where a closed transparent volume really needs it (smoke spheres use FrontSide already).
- Keep separate material instances for the instanced and plain paths: `blobMaterial(instanced)` and `materialFor(name, instanced)`.

**Regression check.** m6 asserts `programResolvesPerFrame === 0` in steady state. Add a unit test that scans exported materials for `transparent && DoubleSide && !forceSinglePass`.

### C-4 (S3) The render audit blocks the JS thread on every scene build and skin change — measured
**Evidence (m2).** The frame 3 after a rebuild (`RENDER_AUDIT_DELAY_FRAMES = 3`, `src/game/Game.tsx:145,2355-2371`) did:
- **60 `gl.readPixels`** calls
- **10 framebuffer create/bind/delete** cycles (`glTexelReader`, `src/util/renderAudit.ts:84-101`)
- one full scene traverse plus a JSON.stringify'd console line

That frame took **803 ms** in SwiftShader against 3-6 ms for neighbouring frames. Chrome reports "GPU stall due to ReadPixels". The m9 profile shows `readPixels` with 365 ms self time for a single audit. On expo-gl every readPixels is a synchronous JS→GL-thread round trip that first flushes the queued frame.

The audit also re-arms on every `rebuildScene`, every Endless restart and every skin/outfit change (`Game.tsx:1446-1450`). When it finds problems it re-runs 3 more times, 60 frames apart.

**Root cause.** A diagnostic does GPU readback in the gameplay frame, every time, although the textures are created once at boot and never change.

**Fix (OTA-safe: yes).**
- Cache GPU-check results per `textureKey` for the session, since the textures are immutable. After the first successful check, later audits run only the cheap scene walk with no readPixels.
- Alternatively, run the GPU probe only from Settings > Build/Update Info, or once at boot on the menu.
- Batch the probes: one readPixels of a small rectangle per texture, not one per point.
- Drop the `console.log(JSON.stringify(...))` in release builds.

**Regression check.** Count readPixels across 5 consecutive rebuilds with the m2 wrapper: the expected total is ≤ 1 audit's worth (≤ 60).

### C-5 (S3) Fixed 60 Hz step with no interpolation causes judder at 60, 90 and 120 Hz; the camera smoothing assumes 60 fps — measured (simulation) + code
**Evidence.** `src/game/Loop.ts:18-29` runs `update(STEP)` 0..n times per rAF and then calls `render(alpha)`. `render` ignores `_alpha` (`Game.tsx:2194`). Every transform is the latest sim state.

`loopsim.mjs` replays the accumulator with 0.3 ms vsync jitter:

| Display rate | Renders with 0 steps | Renders with 1 step | Renders with 2 steps | Total renders |
|---|---|---|---|---|
| **60 Hz** | 33 | 55 | 32 | 120 |
| 90 Hz | 61 | 119 | 0 | 180 |
| 120 Hz | 120 | 120 | 0 | 240 |

Because the frame period equals STEP exactly, jitter flips the accumulator. About half the 60 Hz frames show either a repeated position or a double step, which is visible stutter. Many mid-range Android phones run at 90 or 120 Hz.

In addition, `updateCameraRig(r.camera, player, 1 / 60)` (`Game.tsx:2333`, `src/game/CameraRig.ts:15-35`) uses a constant dt per *render*. At 120 Hz the camera converges twice as fast, and it keeps moving on frames where the player does not. At 30-45 fps it lags.

**Fix (OTA-safe: yes).**
- Keep the previous sim positions of the player, guards and dogs and lerp by `alpha` in render. Pass the real render dt (`renderDt`, already computed at `Game.tsx:2195-2197`) to `updateCameraRig`.
- Minimum fix: add a 1-2 ms hysteresis. When `|frame-STEP| < 0.002`, treat the frame as exactly one step (snap the accumulator).

**Regression check.** A unit test on Loop with jittered 60 Hz timestamps: no render has 0 or 2 steps (minimum fix), or interpolated positions are monotonic (full fix).

### C-6 (S3) Scene rebuild runs synchronously on the frame that starts a stage — measured
**Evidence (m1, m5).**

| | rebuildScene + resetSegment (desktop JIT) |
|---|---|
| 30 consecutive rebuilds | median ~23 ms, max 78 ms |
| Stage 25 | 60 ms |
| Stage 30 | 66 ms |
| Daily start | 96 ms |

The first render after a rebuild costs another 20-55 ms. The first rain stage compiles 3 new programs (55 ms first render), and the snow ground swaps `emissiveMap` to null (`Game.tsx:665-670`), which is another program variant. On Hermes this is a 0.3-1.5 s frozen frame right after tapping NEXT/START. The rebuild runs inside `update()` on the next frame, so the button press appears to hang.

**Fix (OTA-safe: yes).**
- Show the transition (banner or fade) for one rendered frame, then rebuild.
- Pre-compile likely program variants at boot with `renderer.compile(scene, camera)` on a throwaway scene that has rain, snow and ground variants.
- Combine with C-1 (fewer objects to build) and C-2 (faster flood).

**Regression check.** Time `update` on stage change in m1. Count programs created after boot (should be 0 on later stage starts).

### C-7 (S3) Embedded PNG decode at boot is ~0.9 s of interpreted JS on the critical path, and retains 13 MiB of RGBA — measured
**Evidence (`js/run.mjs`).** Decoding all 11 embedded PNGs (`src/util/png.ts`, called from `preloadAllTextures`, awaited in `App.tsx:48` before the GLView mounts):

| Decoder run | Total time |
|---|---|
| V8 with JIT | 201 ms |
| V8 `--jitless` (interpreter, comparable to Hermes) | **941 ms** |

Per texture (jitless):

| Texture | Size | Decode |
|---|---|---|
| character-d | 1024² palette | 351 ms |
| character-g | 1024² palette | 250 ms |
| character-j | 1024² palette | 295 ms |
| vehicle-colormap | 512² RGBA | 298 ms |
| props | 64² each | ≤3 ms each |

On a mid-range phone that is likely 2-4 s added to the splash screen. The decoded `Uint8Array`s stay referenced by `DataTexture.image.data` forever: 13.1 MiB of JS heap on top of the same amount in GPU memory.

The three character sheets are 1024² but have ≤256 colours. A 2x nearest downscale changes only 3 % of pixels, at edges, so a 512² version is probably visually identical. That needs an art check.

**Fix (OTA-safe: yes; textureData.ts is JS).**
- In the decoder, hoist the filter switch out of the per-byte loop and specialise by filter type. Use `Uint8Array.set` for filter 0 and direct indexing for 1-4. Expect 2-3x faster.
- Decode character sheets lazily on first `getCharacterTexture(kind)`. The guard sheet 'j' is not needed on the menu.
- Consider 512² sheets.
- After the first upload, release CPU pixels: `tex.onUpdate = () => { tex.image.data = null }` for textures that are never re-uploaded. Not for grass and dirt, which are cloned with new sampler params; and note this precludes context-loss restore.

**Regression check.** Unit-test that decoded RGBA equals the reference (tests already compare probes). Add a timing budget test with `--jitless` (≤ 300 ms total).

### C-8 (S3, suspected) Full native-resolution rendering with no render-scale control — code
`Renderer.ts:21-40` sizes the renderer to `gl.drawingBufferWidth/Height`. On Android, expo-gl's TextureView surface is at physical pixels, for example 2400×1080 (2.6 MP), and there is no pixel-ratio or quality setting.

The fragment load is significant:
- 105-174 transparent drawables per frame (m1), with depthWrite off and blended
- an 800×1800 m ground plus an 1800 m translucent yard floor
- floodlight cones
- weather

On mid-range Mali/Adreno parts that is a likely GPU fill-rate limit. This could not be measured here (SwiftShader).

**Fix (OTA-safe: yes).** Add a "render scale" option, defaulting to about 0.75 on low-end. Render a smaller GLView and scale it up with an RN transform (`width: W*s`, `transform:[{scale:1/s}]`), or render to a WebGLRenderTarget at scale and blit. Expose it in Settings.

**Regression check.** On-device fps with the setting at 1.0 vs 0.75 (perf HUD or logcat frame stats).

### C-9 (S3, suspected) No GL context-loss or re-create handling; `onContextCreate` is not re-entrancy safe — code
`Game.tsx:260` `onContextCreate` builds a whole new game: renderer, scene, store subscriptions and `startLoop`. It never stops a previous `loopRef.current`, and there is no `useEffect` cleanup to stop the loop on unmount (`Game.tsx:2374`).

expo-gl's `GLView.onSurfaceTextureDestroyed` destroys the context and re-fires `onSurfaceCreate` when a new surface arrives (`node_modules/expo-gl/android/.../GLView.kt:59-65`). If that happens (view detach, some OEM multi-window or fold transitions), the old loop keeps calling into a dead context and a second game instance starts. The store subscriptions also double up (`Game.tsx:326`).

**Fix (OTA-safe: yes).** At the top of `onContextCreate`, call `loopRef.current?.stop()`. Return a cleanup from a `useEffect` that stops the loop and disposes the renderer. Keep the unsubscribe from `useStore.subscribe`.

**Regression check.** Device test: toggle multi-window or fold, and check logcat for duplicate `rebuildScene` logs.

### C-10 (S4) The pause menu and other non-playing states still render the full scene at display rate — code
`Loop.ts:28` calls `render` every tick. When paused, `update` returns early (`Game.tsx:1508-1553`), but `render` still draws the whole scene (400-950 calls) under the opaque pause panel. That costs battery and heat while paused.

**Fix (OTA-safe: yes).** While `paused` and the scene is static, render at most every 4th rAF, or skip `r.draw()` entirely when nothing changed.

### C-11 (S4) Depth precision: expo-gl asks for 16-bit depth; near plane is 0.1 with far 1500 — measured (emulated)
- expo-gl's EGL config requests `EGL_DEPTH_SIZE 16` (`node_modules/expo-gl/android/.../GLContext.java:393`), and EGL sorts smaller depth first.
- The camera uses near 0.1 and far 1500 (`Renderer.ts:50`).

m7 rendered the same frame into 24-bit and 16-bit depth targets:
- **764 px differ** (0.2 %), mostly far ridge, cloud and tree-line edges (`C/depth-compare.png`).
- With near = 0.5 the difference drops to 236 px. Near 0.1 vs 0.5 at 24-bit differs by only 3 px.

Decals are mostly protected by polygonOffset: yard floor, blob shadows, snow caps. Not protected:
- the win line (y = 0.02, `PrisonYard1.ts:263`)
- footprints (0.012)
- rings and arrows (0.035-0.04)

**Fix (OTA-safe: yes).** Set the camera near plane to 0.5. The camera is always 7 m above ground and 8 m back, so nothing comes that close. Add `polygonOffset` to the ground decals that lack it.

### C-12 (S4) Floodlight beam and foot ShaderMaterials skip colour-space conversion and fog — code
`LightTower.ts:29-80`: raw `gl_FragColor = vec4(uColor, a)`. `uColor` is a `THREE.Color` (linear working space). It is written to the sRGB output without `#include <colorspace_fragment>`, so the beams render darker and more saturated than the hex suggests. They also ignore fog. The same applies to `GuardEquipment.ts:31` (beam cone).

**Fix.** Add `#include <colorspace_fragment>` (and the fog chunks with `fog: true`), or set the uniform with `color.convertLinearToSRGB()`. OTA-safe.

### C-13 (S4) Props between the camera and the player are not faded — observed
In m7 (stage 3) a police car directly behind the player fills the lower third of the view (`C/depth-compare.png`). The camera rig (`CameraRig.ts`) has no occluder fade or raycast, which is a readability issue in a stealth game. Fix: each frame, raycast or segment-test the obstacles near the camera-to-player line and set `material.opacity` on a per-instance clone, or hide those within 2 m of the segment. OTA-safe.

### C-14 (S4) Viewport and aspect are fixed at context creation — code
`Renderer.ts:40,49` are the only size and aspect writes. There is no `onLayout` or resize path. Orientation is locked to landscape (`app.json`), but a change in drawing-buffer size (split-screen, fold, edge-to-edge insets) would leave the aspect and viewport stale and stretch the image. Fix: on `GLView onLayout`, call `renderer.setSize` with the new drawing buffer and set `camera.aspect`.

### C-15 (S5) Small per-frame allocations and store writes in the update loop — measured
m4 (stage 12, 20 s): **30.6 store notifications/s**:

| Key | Updates/s |
|---|---|
| stamina | 19 |
| detection | 9.6 |
| dangerLevel | 1.1 |
| other | < 1 |

The HUD selectors are well quantised (AlarmOverlay rounds to 0.1, dangerLevel to 0.04, stamina coalesced at 1 %), so React re-renders are bounded (StaminaBar ≈ 19/s while sprinting).

Per-frame JS allocation in Chrome is about 276 KiB/frame. Most of it comes from three internals tied to C-1 and C-3: uniform matrix uploads at 69 MB/20 s, getParameters, and the program key. App-level allocations are present but small:
- a new `tuning` object (`Game.tsx:1919`)
- `smokeRegions.push({...})` (`Game.tsx:1786`)
- a closure per guard for `updateGuard`'s fire callback (`Game.tsx:2013`)
- the `updateRocks` closure (`Game.tsx:1749`)
- the `updateDogs` options object
- per-figure pose option objects (`Game.tsx:2210,2241`)
- `procgen.forks()` returns a new array every frame (`ProcgenSystem.ts:697`)
- `seenTips()` spreads arrays while near a fork (`Game.tsx:1574-1576`)

Frame-time distribution over 20 s (desktop JIT):

| | p50 | p95 | p99 | max |
|---|---|---|---|---|
| update | 0.3 ms | 0.7 ms | 1.4 ms | 5.4 ms |
| render | 3.5 ms | 7.8 ms | 12.5 ms | 608 ms |

The render max is one GC- or compile-type spike. Render is about 90 % of the JS frame cost.

**Fix.** Hoist the scratch objects and the callbacks. Cache `forks()`. Throttle `setStamina` to 10 Hz or 2 % steps. OTA-safe.

---

## Already solid (verified)
- **No GPU or JS leak across rebuilds or restarts (m5).** From stage 5 first, to after 30 rebuilds of stages 1-30, to after 30 more restarts:
  - geometries 97 → 99 → 99
  - textures 13 → 14 → 14
  - programs 17 → 20 → 20 (rain and snow variants)
  - scene objects 577 → 577 → 577
  - heap after GC 12.6 → 14.3 → 14.5 MiB

  `disposeSubtree` plus `markShared`, and `ProcgenSystem.despawnChunk`, are effective. Ground texture clones share the Source and the three texture cache, so they cost no new GPU textures.
- **Endless memory is bounded (m8, 3 km).** Sections stay at 3-4, and geometries and objects follow the content density per level (geo 159 → 448 as the level rises). Heap after GC went 14.3 → 17.2 MiB over 2.5 km, tracking content rather than leaking monotonically. Nothing crashed. Watch the trend in a 10 km soak.
- **No mid-game shader compiles for effects (m2).** First smoke bomb, crowbar swing, rock throw and catch created 0 new programs, because the effects reuse module-level materials.
- Weather Points/Lines set `frustumCulled = false`, so the moving column is never culled wrongly.
- Dome radius 1400 is inside far 1500, and the camera stays within 9 m of the dome centre.
- Texture handling is correct:
  - sRGB `colorSpace` is set
  - ground and fence textures use mipmaps and anisotropy
  - nearest filtering is only on palette atlases
  - NPOT is not an issue: all textures are POT
- The dt clamp (0.1 s) prevents a spiral of death after a background stall.
- Hit-stop freezes sim time only.
- Slow-mo uses `effDt` for the world, but real dt for the boss clock and music.
- The app pauses on AppState change (`SettingsScreen.tsx:150-170`).
- HUD selectors are quantised, so per-frame store writes do not re-render React at 60 Hz.

## Summary list (severity order)
1. C-1 S2 measured: 950 draw calls at stage 29 and up to 1788 in Endless at 2.3 km. Kit props are per-instance multi-material meshes and there is no distance culling (44-58 % of calls are more than 120 m away). Fix: per-chunk distance cull, then instance or merge props.
2. C-2 S2 measured: Endless section streaming does 30-72 ms (JIT) of synchronous work every 120 m, dominated by `NavGrid.flood` allocations and per-cell closures. Fix: time-slice one chunk per frame and make flood allocation-free.
3. C-3 S3 measured: 48 program re-resolutions per frame. Causes are two-pass transparent DoubleSide (17 materials) and BLOB_MAT/KitProps materials shared between Mesh and InstancedMesh. Fix: `forceSinglePass` and split materials.
4. C-4 S3 measured: the render audit does 60 synchronous readPixels and 10 FBOs on every rebuild and skin change (803 ms frame in SwiftShader). Fix: cache results per texture key and run the GPU check once.
5. C-5 S3 measured (sim): the fixed step with no interpolation shows 0 or 2 steps on 54 % of 60 Hz frames and 0 steps on 50 % of 120 Hz frames. The camera rig uses a constant 1/60 dt. Fix: alpha interpolation, real render dt, or accumulator hysteresis.
6. C-6 S3 measured: stage start takes 23-96 ms (JIT) for the rebuild plus a 20-55 ms first render, and the first rain stage compiles 3 programs. Fix: defer the rebuild one frame behind the transition and pre-compile variants.
7. C-7 S3 measured: boot PNG decode takes 941 ms jitless (three 1024² character sheets plus a 512² colormap) and retains 13 MiB of RGBA in JS. Fix: optimise the decoder, decode lazily, use 512² sheets, free data after upload.
8. C-8 S3 suspected: native-resolution rendering with no render scale on mid-range GPUs. Fix: a render-scale option.
9. C-9 S3 suspected: no context-loss handling; `onContextCreate` starts a second loop without stopping the first, and there is no unmount cleanup.
10. C-10 S4: the full scene renders at display rate while paused.
11. C-11 S4 measured: 16-bit depth from expo-gl with near 0.1 gives minor far z-fighting. Fix: near 0.5 and polygonOffset on decals.
12. C-12 S4: beam ShaderMaterials skip colour-space conversion and fog.
13. C-13 S4: props between the camera and the player are not faded.
14. C-14 S4: no resize/aspect handling.
15. C-15 S5 measured: 30 store notifications/s (stamina 19/s) and small per-frame allocations. The HUD quantisation is good.

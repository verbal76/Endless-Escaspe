# Review C: Game.tsx integration notes

These are the Game.tsx parts of the C fixes. The system-side code is already committed on the C branch (see the commit list in the report). Each item below gives the exact code and where it goes. Line numbers refer to `src/game/Game.tsx` at 6a84afd; re-locate the code by the quoted anchors.

Nothing here changes the look. Each item stands alone, so they can be landed in any order.

---

## 1. C-1: distance culling of far chunks (one line, required to get the draw-call win)

`ProcgenSystem.updateVisibility(playerZ)` hides whole chunks (props, pickups, prop shadows) beyond `CULL_AHEAD` = 140 m ahead and `CULL_BEHIND` = 40 m behind. Until it is called once, everything is drawn as before. The cost is one compare per chunk.

In `render`, just before the camera rig update (~line 2335):

```ts
      updateBackdropFar(backdrop, player.x, player.z);
      scene.procgen.updateVisibility(player.z);          // <- add
      updateCameraRig(r.camera, player, 1 / 60);
```

Notes:
- Static prop batching (`batchStaticMeshes`) is already active inside `ProcgenSystem.spawnChunk`. It needs no integration and gives most of the draw-call drop on its own.
- Endless section roots (guards, towers, cameras, fences, trees) are **not** culled. A chasing guard from a far section can come within view while its section root would be hidden, so culling them needs per-object handling. Their share of far draw calls is small (about 60 at stage 29 / Endless).

## 2. C-2: spread Endless chunk generation over frames (one line)

`ProcgenSystem.prefetch(z, maxChunks)` generates up to `maxChunks` of the chunks that a later `extendTo(z)` would add. It uses the same RNG sequence, so the level is identical; a unit test checks this. The section that is needed next is then generated one chunk per frame, starting right after the previous section was populated, which is about 120 m (roughly 17 s of running) before it is needed. `extendTo` then finds the chunks already built.

At the end of `streamEndless` (~line 776), after `s.procgen.trimBefore(keepFrom);`:

```ts
      s.procgen.trimBefore(keepFrom);
      // Build the next section's chunks a chunk per frame, well before
      // they are needed, instead of all at once on the frame they are.
      s.procgen.prefetch((s.nextSection + 1) * ENDLESS_SECTION_LEN + CHUNK_LEN, 1);   // <- add
```

`populateSection` (guards, towers, fences, trees) still runs on the frame the section is needed. It is now the remaining spike. To spread it as well, split `populateSection` into two calls on consecutive frames:
- guards + dogs
- towers + cameras + fences + trees

Use a `pendingPopulate` queue in `streamEndless` that runs one part per call. The trigger is already 2 sections (240 m) ahead, so there is ample lead.

## 3. C-10: throttle rendering while paused (Loop option, one line)

`startLoop` takes an optional `isStatic()`. While it returns true, only every 4th frame is drawn; drawing goes back to full rate on the first frame after it turns false. Pass it in the `startLoop({...})` call (~line 2376):

```ts
    loopRef.current = startLoop({
      update,
      render,
      // Paused over a frozen scene (pause panel / modal): redraw at 1/4 rate.
      isStatic: () => {
        const st = useStore.getState();
        return st.paused && st.runState === 'playing' && shakeRemaining <= 0;
      },
      onError: ...
```

Only use `paused && playing`. In the idle menu the splash demo animates and must keep full rate.

## 4. C-5: smooth motion at 60/90/120 Hz

The Loop side is done: the accumulator snaps vsync jitter, so at 60 Hz every rendered frame now runs exactly one sim step (unit-tested). The rest is in Game.tsx.

### 4a. Camera rig uses the real render dt (required)

In `render` (~line 2335), replace the constant with the `renderDt` that is already computed at the top of `render`:

```ts
      updateCameraRig(r.camera, player, renderDt);
```

Today, at 120 Hz the camera converges twice as fast, and it keeps moving on frames where the player does not.

### 4b. Interpolate the player (and optionally guards / dogs) by alpha (recommended)

`render(alpha)` receives `accum / STEP` in [0, 1). Keep the previous sim position and lerp between it and the current one:

```ts
    // next to `const player = createPlayer();`
    let prevPX = player.x;
    let prevPZ = player.z;
```

At the very top of `update(dt)`, before anything moves the player:

```ts
      prevPX = player.x;
      prevPZ = player.z;
```

After any teleport (`resetSegment`, the respawn in `handleCatch` / Endless respawn, the idle-demo wrap at `player.z >= scene.segmentEndZ - 4`), also set `prevPX = player.x; prevPZ = player.z;` so the lerp does not streak across the map.

In `render`, rename `_alpha` to `alpha`. Compute the drawn position once at the top, and use it wherever the player figure / shadow / noise ring / camera are positioned:

```ts
      const drawX = prevPX + (player.x - prevPX) * alpha;
      const drawZ = prevPZ + (player.z - prevPZ) * alpha;
```

The camera rig takes a `Player`. Pass a lightweight view object instead of `player`, hoisted once so there are no per-frame allocations:

```ts
    const playerView = { ...player };            // once, next to createPlayer()
    // in render:
    playerView.x = drawX; playerView.z = drawZ;
    updateCameraRig(r.camera, playerView as Player, renderDt);
```

Guards and dogs can get the same treatment with a `prevX/prevZ` per entry. The player and camera are what the eye tracks, so do them first.

## 5. C-6: stage-start freeze

### 5a. Show the transition before rebuilding

`rebuildScene` runs inside `update()` on the frame after the store change, so the tapped button appears to hang for the whole rebuild plus first render (0.3-1.5 s on Hermes). Defer the rebuild by one rendered frame so the banner / fade paints first:

```ts
    let rebuildPending = 0;   // frames to wait before rebuilding
```

In the change-detection block (~line 1404), instead of calling `rebuildScene(...)` / `resetSegment()` immediately, set `rebuildPending = 2` and `return` from `update`. At the top of `update`:

```ts
      if (rebuildPending > 0 && --rebuildPending === 0) {
        const st0 = useStore.getState();
        rebuildScene(st0.stage, st0.segmentSeed, st0.gameMode);
        resetSegment();
        if (scene.endless) grantStartingHearts(st0.stage);
        bossIntroPending = st0.gameMode === 'campaign' && scene.isBossArena;
      }
```

Keep the existing `lastSegmentSeed/lastStage/lastMode` bookkeeping where it is.

### 5b. Pre-compile weather / snow program variants at boot

After the first `buildScene`, compile the variants that otherwise compile on the first rain / snow stage (3 programs, ~55 ms first render):

```ts
    // after `let scene: Scene = buildScene(...)` and lighting setup:
    try {
      const warm = new THREE.Scene();
      warm.fog = r.scene.fog;
      for (const k of ['rain', 'snow'] as const) warm.add(createWeather(k, 0, 0).group);
      const snowGround = createGround();
      const sm = snowGround.material as THREE.MeshLambertMaterial;
      sm.emissiveMap = null; sm.needsUpdate = true;
      warm.add(snowGround);
      warm.add(r.ambient.clone(), r.hemi.clone(), r.sun.clone());
      r.renderer.compile(warm, r.camera);
      disposeSubtree(warm);   // weather / ground meshes are per-instance; shared mats are skipped
    } catch (e) { logDebug('warn', 'precompile failed', e); }
```

Then check with m1/m5 that `renderer.info.programs.length` no longer grows on the first rain / snow stage. If the lights differ in count from the real scene, the programs will not match; the lights must mirror the real scene's set.

## 6. C-9: GL context re-creation safety (required for robustness)

At the very top of `onContextCreate`:

```ts
  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    // expo-gl re-fires onContextCreate when the surface is re-created
    // (view detach, some multi-window / fold transitions). Stop the old
    // game's loop first so two games never run on one (or a dead) context.
    loopRef.current?.stop();
    loopRef.current = null;
```

Add an unmount cleanup to `Game()`:

```ts
  useEffect(() => () => {
    loopRef.current?.stop();
    loopRef.current = null;
  }, []);
```

Keep the `useStore.subscribe` unsubscribe handles that `onContextCreate` creates and call them in the same cleanup, and at the top of a second `onContextCreate`, via a `cleanupRef`:

```ts
  const cleanupRef = useRef<(() => void)[]>([]);
  // in onContextCreate, first lines:
  for (const f of cleanupRef.current.splice(0)) f();
  // wherever onContextCreate subscribes:
  cleanupRef.current.push(useStore.subscribe(...));
  // also: cleanupRef.current.push(() => { music.stop?.(); r.renderer.dispose(); });
```

Texture pixels are no longer kept after upload (C-7), but a new context still works: `releasePixelsAfterUpload` decodes a texture again on demand when a new renderer uploads it. This is unit-tested.

## 7. C-8: render scale (optional, device test needed)

Render a smaller GLView and scale it up. Touch input goes to the HUD overlays, not to the GLView, so input is unaffected. In the Game component JSX (~line 2393):

```tsx
  const { width: W, height: H } = useWindowDimensions();
  const s = useStore((st) => st.renderScale ?? 1);   // new setting, 0.75 default on low-end
  ...
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <GLView
      key={s}                                   // the drawing buffer size is fixed at context creation
      style={{
        position: 'absolute',
        width: W * s,
        height: H * s,
        left: (W - W * s) / 2,
        top: (H - H * s) / 2,
        transform: [{ scale: 1 / s }],
      }}
      onContextCreate={onContextCreate}
    />
  </View>
```

Remounting on a scale change re-creates the context, so this depends on item 6. It needs a store field and a Settings row; both are outside C's files.

## 8. Already active without integration

- **C-2:** the banded flood plus allocation-free NavGrid, inside `extendTo`. Section generation went from ~38 ms to ~6 ms median on desktop V8.
- **C-3:** 0 program re-resolutions per frame.
- **C-4:** the render audit GPU check runs once per texture per session. It reads 0 texels after the first audit.
- **C-7:** the faster PNG decoder, and pixels freed after GPU upload.

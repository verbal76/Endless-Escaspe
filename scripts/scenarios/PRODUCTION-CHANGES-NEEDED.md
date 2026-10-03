# Production changes that would help (none are required)

All scenarios are deterministic today without touching `src/`. These optional
changes would remove the workarounds; they are listed, not made, because
`src/` is frozen for this workstream.

1. **First-class test hook instead of anchor injection.** `build.mjs` patches a
   temp copy of `Game.tsx` at the line `    loopRef.current = startLoop({`. A
   guarded export in `Game.tsx` (for example assigning `globalThis.__ee` only
   when `process.env.EXPO_PUBLIC_EE_TEST_HOOK === '1'`, including a
   `stopLoop()` that calls `loopRef.current?.stop()`) would let the scenarios
   run against an unpatched tree. Until then a refactor of that call site makes
   `build.mjs` fail loudly with the anchor message, which is the intended
   failure mode.
2. **Injectable wall clock in `render()`.** `render` derives `renderDt` from
   `Date.now()` (Game.tsx, `lastRenderMs`). The scenarios replace `Date.now`
   with a virtual clock so the noise ring and similar smoothing are stepped
   deterministically. Passing `renderDt` into `render(alpha, dt)` from the
   loop would make that replacement unnecessary.
3. **Visual randomness.** `Weather.ts` and `Obstacles.ts` still call
   `Math.random` (particle spawn, prop yaw, tree variant). It does not affect
   the simulation (the sim uses the seeded `simRng`), so no scenario depends on
   it. Routing it through a seeded generator would make rendered frames
   reproducible if screenshot comparison is ever added. The scenarios seed
   `Math.random` anyway as a safeguard.

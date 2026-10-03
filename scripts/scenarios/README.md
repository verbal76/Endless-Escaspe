# Browser scenario suites

Deterministic, repository-controlled integration scenarios for the whole game
(stealth, combat, campaign, Endless, Daily, economy, UI state). They run the
real game code in headless Chromium against a web export. Nothing under `src/`
is changed and nothing here is part of the app or OTA bundle.

## Quick start

```sh
npm i --no-save playwright            # NOT saved: package.json / lock stay untouched
node scripts/scenarios/run.mjs --pack all
```

The first run builds the web bundle (about 25 s, see below); later runs reuse
it. Use `--build` after changing `src/`.

Playwright is resolved, in order, from `$EE_PLAYWRIGHT_DIR` (a dir containing
`node_modules/playwright`), the repo's `node_modules`, and
`<tmp>/ee-scenarios-webdeps`. Chromium comes from `$EE_CHROME`, else the
newest `chromium-*/chrome-linux/chrome` under `$PLAYWRIGHT_BROWSERS_PATH`
(default `/opt/pw-browsers`), else Playwright's own install
(`npx playwright install chromium`).

## Runner

```
node scripts/scenarios/run.mjs [--pack review|pack2|pack5|regressions|all]
                               [--only id,tag,...] [--dist dir] [--build]
                               [--port n] [--json file] [--list]
```

- `--only` matches a scenario id, `<pack>/<id>`, or any tag, e.g.
  `--only endless`, `--only combat,stealth`, `--only b3-restart-pickup-farm-daily`.
  A scenario's result does not depend on which others ran before it.
- `--list` prints every scenario with its tags.
- `--json` writes every check (`pack, scenario, name, ok, detail`). `detail` is
  a pure function of the scenario, so two runs can be compared with `cmp`.
- Exit code: 0 all passed, 1 a check failed or a scenario threw, 2 usage/setup
  error (no Playwright, port busy, build failed).
- Ports: `--port` / `$EE_SCENARIO_PORT` (default 8830). The runner starts and
  closes its own static server and Chromium and never kills other processes.
- Packs open one browser each (about 3 s) and run their scenarios in order.

Runtime on a 4-core box: about 35 s for `--pack all` (51 checks), build excluded.

## Build (`build.mjs`)

Copies `src`, `assets`, `App.tsx`, `index.ts`, `app.json`, `app.config.js`,
`babel.config.js`, `tsconfig.json`, `package.json` into a temp dir
(`$EE_SCENARIO_BUILD_DIR`, default `<tmp>/ee-scenarios-build`), injects the
`globalThis.__ee` debug hook into the temp copy of `src/game/Game.tsx` only
(the repo file stays byte-identical), and runs `expo export --platform web`.
It fails loudly when the anchor `    loopRef.current = startLoop({` is missing or
ambiguous. The hook exposes: `input, useStore, player, THREE, scene (getter),
handleCatch, handleWin, noiseRing, crowbarMarker, projectiles, update, render,
renderer (getter)` plus `stopLoop()` (halts the real rAF loop via
`loopRef.current.stop()`).

The repo is an Android app and does not depend on the web runtime, so the build
installs `react-dom`, `react-native-web`, `@expo/metro-runtime` once into
`<tmp>/ee-scenarios-webdeps` (`$EE_SCENARIO_WEBDEPS_DIR`) and links them next
to the repo's `node_modules` in the temp dir. This needs registry access once.

## How determinism works

All of it lives in `lib/runtime.mjs` / `lib/ctx.mjs`; scenarios never wait on
the wall clock.

1. The game's own requestAnimationFrame loop is stopped (`__ee.stopLoop()`)
   before any scenario runs, so nothing races with the scenario.
2. Scenarios advance the simulation synchronously with `__h.tick(n, render?)`
   and `__h.run(maxFrames, pre, stop, render?)`, which call
   `__ee.update(1/60)` (and `__ee.render(0)` when a scenario needs drawing,
   e.g. the noise ring). Waits are frame counts; "hold positions every 4 ms"
   became a per-frame pin (`__h.hold`).
3. `Math.random` is a seeded PRNG, reseeded from the scenario seed by
   `ctx.start()`. `Date.now` is a virtual clock advanced 1000/60 ms per frame
   (the render path derives its smoothing delta from it).
4. `ctx.start({stage, seed, mode, day})` zeroes input, resets the run and
   settles it by stepping; if the requested world is already live it first
   builds a throwaway one, so every scenario starts from a clean rebuild.

Proof: every pack run 3 times, once with 4 CPU burners running; the `--json`
output (all 51 checks with their measured values) was byte-identical across the
three runs, and a `--only endless,combat` subset matched the full run check for
check.

Known residual: visual-only randomness (weather particles, prop yaw) still uses
`Math.random`; it does not touch the simulation. See
`PRODUCTION-CHANGES-NEEDED.md` for optional src changes.

## Layout

- `packs/review.mjs`, `packs/pack2.mjs`, `packs/pack5.mjs`: the three ported
  suites (original check names such as `A1`, `C1`, `E3`, `P4` are kept).
- `regressions/*.mjs`: one file per fixed defect, each asserting the FIXED
  behaviour: B-1 (floodlight freezes every guard), B-2 (pause deletes bullets),
  B-3 (restart pickup farm, daily/endless/campaign), B-9 (alarm survives
  respawn), A-2 (retry respawns pickups), A-13 (single scene build per clear).
  They fail against a build with the fix reverted (checked for B-2, B-3, B-9).
- `lib/runtime.mjs` (Playwright, server, in-page stepping layer),
  `lib/ctx.mjs` (per-scenario helpers).

## Writing a scenario

```js
export default [{
  id: 'my-scenario', title: '...', tags: ['stealth'], save: 12 /* optional: active save at that stage */,
  async run({ page, check, start, tick }) {
    await start({ stage: 3, seed: 101 });
    const r = await page.evaluate(() => {
      const E = globalThis.__ee, H = globalThis.__h;
      H.run(600, H.hold({ player: [0, 30], guard: [0, 23], parkOthers: true }), () => E.useStore.getState().hearts < 3);
      return { hearts: E.useStore.getState().hearts };
    });
    check('X1 something', r.hearts < 3, JSON.stringify(r)); // detail must be deterministic
  },
}];
```

Tags in use: `stealth, combat, campaign, endless, daily, economy, ui`. Keep `detail`
free of wall-clock values. Do not wait with `setTimeout`.

## Deliberate differences from the old scratch suites

- The ported scenarios drive the store and `__ee` directly, as the originals
  did; no DOM clicking.
- Screenshots were dropped (they were debugging aids).
- pack5 E1 uses the retention-window invariant (derivation in the file).
- The old pack5 shared one save across scenarios; each scenario now re-creates
  its own (`save:`), so coin totals do not leak between scenarios.
- R6 now runs inside the busy-section scenario (it needs that Endless run) and
  R2 starts its own stage.

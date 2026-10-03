# CI job for the browser scenarios (not wired up here)

No workflow was added; `.github/` is owned by someone else. This describes the
job to add.

```yaml
scenarios:
  name: Browser scenarios
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22', cache: 'npm' }
    - run: npm ci --no-audit --no-fund
    - run: npm i --no-save --no-audit --no-fund playwright      # never saved to package.json / lock
    - run: npx playwright install --with-deps chromium           # skip if the runner image has Chromium; then set EE_CHROME
    - run: node scripts/scenarios/build.mjs                      # expo web export of a temp copy, ~25-60 s
    - run: node scripts/scenarios/run.mjs --pack all --json scenarios.json
    - if: always()
      uses: actions/upload-artifact@v4
      with: { name: scenario-results, path: scenarios.json }
```

- The build step needs registry access once for `react-dom`, `react-native-web`,
  `@expo/metro-runtime` (installed into a temp cache, not the repo).
- Expected duration: build 25-60 s, `--pack all` about 35 s (51 checks) on 4
  cores, plus Chromium install. The whole job is a few minutes.
- `npm i --no-save` changes only `node_modules`; run it after `npm ci` and
  before nothing else depends on a pristine tree. It does not touch
  `package.json` or `package-lock.json`, so the native fingerprint gate is
  unaffected.
- Ports: default 8830, override with `EE_SCENARIO_PORT`. Chromium path:
  `EE_CHROME` or `PLAYWRIGHT_BROWSERS_PATH`.
- Failure = non-zero exit (1 a check failed, 2 setup problem). The runner prints
  `FAILED <pack>/<scenario>: <check>` lines and writes every measured value to
  the JSON file.

## Targeted runs by changed path

`run.mjs --only <tag>[,<tag>...]` runs every scenario carrying any of the tags.
Suggested mapping (a change to `src/game/Game.tsx`, `src/state/store.ts` or
`src/game/Loop.ts` should run `--pack all`):

| Tag | Scenarios guard | Run when these change |
| --- | --- | --- |
| `stealth` | line of sight, cover, decay, noise ring, cameras/alarm, dogs, rock distraction, floodlights | `src/systems/DetectionSystem.ts`, `GuardAI.ts`, `HideSystem.ts`, `Navigator.ts`, `NavGrid.ts`, `src/scenes/Camera.ts`, `LightTower.ts`, `Dog.ts`, `StealthCues.ts`, `ThrownRock.ts`, `SmokeCloud.ts` |
| `combat` | guard shooting/telegraph, projectiles and pause, razor wire, dogs, boss rounds | `src/systems/ProjectileSystem.ts`, `Crowbar.ts`, `GuardAI.ts`, `PlayerController.ts`, `src/scenes/Fence.ts` |
| `campaign` | forks, stage clear/coins, boss arena, restart/retry, camera alarm | `src/systems/ProcgenSystem.ts`, `src/game/runRules.ts`, `src/state/store.ts`, `src/components/HUD/Banner.tsx` |
| `endless` | streaming window, difficulty ramp, respawn, backtrack clamp, forks | `src/systems/ProcgenSystem.ts`, `NavGrid.ts`, `src/game/Game.tsx` (streamEndless) |
| `daily` | same-day layout, restart freshness, restart pickups | `src/util/rng.ts`, daily seed code, `src/state/store.ts` |
| `economy` | coin payout, best distance, outfits, pickup/inventory bookkeeping | `src/state/store.ts`, `src/systems/ProcgenSystem.ts` (pickups), shop/outfit code |
| `ui` | modal/popup flow (BOSS ROUND), pause semantics, banner/scene-build sequencing, outfit render | `src/components/HUD/*`, `src/ui/*`, `src/state/store.ts` |

Examples: `--only endless,daily` after a procgen change;
`--only stealth,combat` after an AI change; `--pack regressions` as a fast
(about 6 s) guard for the fixed review defects.

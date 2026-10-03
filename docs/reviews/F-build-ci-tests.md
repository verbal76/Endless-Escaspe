# Review F: build, release, OTA integrity, configuration, test quality and codebase health

Repo `/home/user/Endless-Escaspe` @ `370a624` (branch `claude/game-review-suggestions-cjxiqh`). The review was read-only and nothing in the repo was modified by this reviewer.
Note: at 19:45 UTC, after all of my measurements had run on a clean tree, another process modified `src/game/Loop.ts` and added `tests/loop.test.ts` in the working tree. Every number below is from clean HEAD `370a624`.
Supporting outputs are in `review2/F/`: `unused.txt`, `graph.txt` (import graph, test reachability and unused exports), `graph.cjs`, `fp.mjs` (fingerprint probe) and `androidout/` (offline Android export).

## Measurements

| Check | Result |
|---|---|
| `npx tsc --noEmit` (strict: true) | **0 errors** (~10 s) |
| `npm test` | **91 tests, 91 pass**, 0 skip/todo, ~15 s |
| `tsc --noUnusedLocals --noUnusedParameters` | 12 errors in 6 files (list in F-17) |
| `tsc --verbatimModuleSyntax` / `--erasableSyntaxOnly` | **0 errors** each, so both can be enabled for free (F-21) |
| `tsc --noUncheckedIndexedAccess` | 321 diagnostics (png.ts 46, Game.tsx 41, NavGrid 22, …). Not recommended wholesale |
| Escape hatches in `src/` | `as any` 0, `: any` 0, `@ts-ignore` 0, `@ts-expect-error` 1 (untyped RN registry import), `as unknown as` 4 (GL/asset shims), postfix `!.` 8 (6 in Banner.tsx) |
| Import graph | 99 src files, all reachable from `index.ts` (**no orphan files**). **48/99 src files are never loaded by any test**, including Game.tsx and every `.tsx` |
| Node coverage (loaded files only) | 92.6% lines. This is misleading because the 48 unloaded files are excluded |
| SDK 54 alignment (installed vs `expo/bundledNativeModules.json`) | All direct deps OK. **`react-native-worklets` 0.8.1 vs expected 0.5.1** (transitive) |
| Lockfile duplicates | 65 packages with more than one version. Notable: `@react-native/{babel-preset,codegen,…}` 0.81.5 **and 0.85.2** (pulled by worklets 0.8.1) |
| `npx expo export --platform android` (offline) | OK: 5.48 MB HBC, 26 assets (11 png, 14 mp3, 1 ttf) |
| `npx expo export --platform web` | **Fails**: "Install react-dom@19.1.0, react-native-web@~0.21.0" |
| `@expo/fingerprint` (android) | Works offline. CLI hash `bb978cea…`, changing to `a0f6f6f2…` when `EE_GIT_SHA`/`EE_BUILD_NUMBER` are set. With source skips (see F-1) the hash is stable at `df1f0f4d…` |
| Native config diff since runtime 0.2.1 (`0defe73..HEAD` over package*.json, app.json, app.config.js, babel, eas, icons) | **empty**, so the current OTA stream is compatible with 0.2.1 APKs |
| Remote tags | `build-9/10/12/13` → `df65081` (main), `build-2/4/5/7` → `934391b`. **No tag points at the commit it was built from** (F-3) |
| ESLint / Prettier / .nvmrc / engines | none |

---

## Findings

Severity scale: S1 can ship a broken release or corrupt data · S2 release/process risk · S3 defect · S4 test/diagnostic gap · S5 maintainability.

### F-1: No guard against an OTA that needs native code missing from the installed APKs (S1, confidence high)
**Evidence**
- The only protection is `eas-update.yml` `paths-ignore` (l.15-32) plus human discipline (README l.125-128). A `paths-ignore` list only skips a run when *every* changed file matches it.
  - (a) A push changing `package.json` (new or upgraded native module) **plus** any `src/` file runs both workflows. The OTA goes to runtime `0.2.1`, i.e. to every installed 0.2.1 APK that lacks the module.
  - (b) A push changing only `package.json` builds an APK and no OTA. The **next** `src/`-only push then publishes JS bundled against the new `node_modules` to all old 0.2.1 APKs. The filter offers no protection at all in this case.
- History shows the hazard is real:
  - `0defe73` had to bump 0.2.0→0.2.1 because hoisting changed which native `expo-asset`/`expo-constants` were compiled (SDK 55 modules against SDK 54 core gave `NoSuchMethodError`).
  - `3f639e0` (Pack 4) added `expo-font` as a direct dependency and changed `src/` (32 files) and `app.json`, but did not bump the runtime. It was safe only because `expo` already depends on `expo-font@14.0.12`. Nothing verified that.
- Native drift can also come from the lockfile alone. `react-native-worklets` is not in package.json (F-5), so `npm install` can move it within 0.5–0.8.

**Root cause / class:** the runtime version (`policy: appVersion`) is a manually maintained compatibility key with no machine check. Defect class: *missing invariant check in the release pipeline*.

**Fix** (CI only, OTA-safe): add a fingerprint gate.
1. Add `fingerprint.config.js`:
   ```js
   const { SourceSkips } = require('@expo/fingerprint');
   module.exports = {
     platforms: ['android'],
     sourceSkips:
       SourceSkips.ExpoConfigVersions |
       SourceSkips.ExpoConfigExtraSection |
       SourceSkips.PackageJsonScriptsAll |
       SourceSkips.GitIgnore,
   };
   ```
   Verified: without these skips the hash changes per commit because `app.config.js` stamps `EE_GIT_SHA` / `versionCode`. With them it is stable across env values.
2. Commit `native-fingerprints.json`, e.g. `{ "0.2.1": "df1f0f4d…" }` (computed at HEAD).
3. Add `scripts/check-native-fingerprint.mjs`. It computes the hash with `createFingerprintAsync('.', config)` and fails unless `recorded[app.json version] === hash`. The error message says: "native inputs changed: bump app.json version and record the new hash".
4. Run it in **both** `eas-update.yml` (before `eas update`) and `apk-build.yml` (before prebuild), and in a new PR CI (F-4).
5. Optionally print `npx fingerprint fingerprint:diff` against the recorded fingerprint JSON so the failure names the changed module.

The alternative is `runtimeVersion: { policy: "fingerprint" }`. That needs `verify-ota.mjs` l.14 (which reads `app.version`) and the menu/README to change. I prefer the gate because it keeps the human-readable runtime.

### F-2: OTA goes live before (and regardless of) the emulator render check; no rollback path (S2, high)
**Evidence**
- `eas-update.yml` publishes in ~5 min and has no `needs`/`workflow_run` link to `android-render-check.yml`, which builds for ~30–40 min and only reports.
- `verify-ota.mjs` runs *after* publishing (l.94-95). A failure there leaves the update live.
- README has no rollback procedure (`eas update:rollback` / `eas update:republish --group <prev>`).
- The render check exists precisely because "browser checks can't catch Android-only asset/GL paths" (header of android-render-check.yml). Past breakages of that kind: `9036d2d`, `fd9ccab`, `4f87f99` (a crash introduced by render audit code).

**Class:** gate ordering. **Fix** (CI only):
- (a) Run the render check on PRs/pushes, and make `eas-update.yml` trigger on `workflow_run: [Android render check] types: [completed]` with `if: conclusion == 'success'` for the same `head_sha`.
- Or (b) publish to a `staging` channel first and promote with `eas channel:edit preview --branch …` after the render check passes. The render-check APK would need a `staging` header for that.
- In either case, document rollback in README and add a `workflow_dispatch` "rollback OTA" job that runs `eas update:republish --group <id> --channel preview`.

### F-3: GitHub release tags `build-N` point at `main`, not at the built commit (S2, high, verified on remote)
**Evidence:** `git ls-remote --tags origin` shows `build-9,10,12,13` → `df65081` (= `origin/main`). `apk-build.yml` l.168-183 (`softprops/action-gh-release@v2`) passes no `target_commitish`, so GitHub creates the tag on the default branch. The body text has the right SHA, but `git checkout build-13` gives the wrong source.

**Class:** release provenance. **Fix:** add `target_commitish: ${{ github.sha }}`. Existing tags can be corrected with `git tag -f build-N <sha from release body>` (needs a human).

Related doc bug: the comment at l.164-167 says manual (`workflow_dispatch`) runs skip the release. The step has no `if:`, so they publish too. Either add `if: github.event_name == 'push'` or fix the comment.

### F-4: No CI on pull requests or other branches; validation happens only at publish time (S2, high)
**Evidence:**
- None of the 3 workflows has a `pull_request` trigger. Typecheck and tests run only inside the publish/build jobs on 3 named branches.
- `tests/**` is not in `paths-ignore`, so a tests-only push republishes an identical OTA as a new update id and sequence. Devices download it for no reason.
- Metro bundling is never checked before `eas update`. Bundling is cheap: offline `expo export --platform android` succeeded here.

**Fix:** add `ci.yml` on `pull_request` + `push` (all branches) running:
`npm ci && npm run typecheck && npm test && node scripts/check-native-fingerprint.mjs && npx expo export --platform android --output-dir /tmp/x`
Then add `tests/**` to `eas-update.yml` `paths-ignore`. OTA-safe.

### F-5: Dependency drift: `react-native-worklets` is a phantom transitive dep outside the SDK version (S2, high)
**Evidence:**
- `npm ls` shows `react-native-reanimated@4.1.7 → react-native-worklets@0.8.1`. bundledNativeModules expects `0.5.1`.
- `babel.config.js` l.10 `require`s `react-native-worklets/plugin`, but the package is not in package.json.
- worklets 0.8.1 pulls `@react-native/metro-config@0.85.2` and a second RN 0.85 babel/codegen toolchain.
- It is within reanimated's declared range (`compatibility.json` 4.1.x: worklets 0.5–0.8), and the device check passes, so this is not broken today. But it is not the combination Expo tested, and it can move silently on any lockfile regen (native change).

**Fix (at the next runtime bump):** `npx expo install react-native-worklets` (direct dep 0.5.1), then bump `version`.
- Add a CI check equivalent to `expo install --check`. Offline version: a script comparing `node_modules/*/package.json` versions to `node_modules/expo/bundledNativeModules.json` with semver (the snippet used for this review is ~10 lines).
- Also drop the explicit plugin from `babel.config.js`: `babel-preset-expo@54.0.10` already adds `react-native-worklets/plugin` (index.js l.286-289), so it currently runs twice. That is harmless today, but redundant. This removal changes the bundle only, so it is OTA-safe.

### F-6: The release APK declares microphone and activity-recognition permissions it never uses (S2, high)
**Evidence:**
- `expo-audio`'s library manifest declares `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.
- `expo-sensors` (0 imports in src/App) declares `ACTIVITY_RECOGNITION`.
- `app.json` has no `android.blockedPermissions`.
- The game never records audio. Installers see a mic permission, and Play review would flag it.

**Fix:**
- `app.json` → `"android": { "blockedPermissions": ["android.permission.RECORD_AUDIO", "android.permission.ACTIVITY_RECOGNITION", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"] }`. Background playback isn't used; verify that before blocking the FGS permission.
- `npm uninstall expo-sensors`.
- This needs a new APK, and F-1's gate will (correctly) require a runtime bump. **OTA-safe: no.**

### F-7: APKs are signed with the public Expo template debug keystore (S2, high)
**Evidence:** README l.119-121 and apk-build.yml l.125-130. That key ships in every Expo template.
- Anyone can build an APK with package `com.verbal76.endlessescaspe` that installs *over* a tester's app (same signature) and reads its AsyncStorage (saves, logs).
- Moving to a real key later forces an uninstall, which **wipes every tester's saves**. That is the data-integrity consequence.

**Fix:**
- Before wider distribution, generate a project upload keystore, store it as secrets (`ANDROID_KEYSTORE_B64`, passwords), and write `signingConfigs.release` after prebuild (a small config plugin or a `sed` step).
- Announce the one-time reinstall, and provide an export/import of saves first (e.g. through the existing share sheet).
- CI-only plus a new APK. Not OTA.

### F-8: Workflow hardening (S5, high)
- `expo/expo-github-action@v8` uses `eas-version: latest` (l.72). An eas-cli release that changes `--json` output would break `verify-ota.mjs` *after* the publish. Pin it, e.g. `eas-version: 16.x`, matching `eas.json` `cli.version`.
- `eas-update.yml` has no `permissions:` block, so it uses the repo-default token scope. Add `permissions: contents: read`.
- The third-party `softprops/action-gh-release@v2` runs with `contents: write`. Pin it by SHA.
- `upload-artifact` uses the default 90-day retention for ~APK-sized artifacts that duplicate the release asset. Set `retention-days: 7`. Another branch already needed a `prune-artifacts.yml`.
- Re-running a job reuses `run_number`: two OTAs get the same "OTA nnn", and APK reruns get the same versionCode. Accept or document this, or append `github.run_attempt` to the OTA message.
- Renaming or recreating `apk-build.yml` resets `run_number`, so versionCode would go backwards and installs would fail with `INSTALL_FAILED_VERSION_DOWNGRADE`. Document it, or add an offset (`EE_BUILD_NUMBER: ${{ github.run_number + N }}`).

### F-9: Publish concurrency and branch topology (S3, medium)
- `cancel-in-progress: true` on the publish job (eas-update.yml l.34-36) can cancel a run between `eas update` and the verify/summary steps. The update is then live but unverified and unrecorded. Use `cancel-in-progress: false` for the publish job; GitHub still keeps only the newest pending run.
- All three trigger branches publish to the **same** `preview` channel, but the concurrency group is per-ref, so two branches can publish concurrently and `verify-ota` can fail spuriously.
- `claude/endless-escape-game-android-gRlFH` is an ancestor of HEAD and is listed as a trigger. Fast-forwarding it to an intermediate 0.2.1-era commit would **roll every device back**. Its current head is runtime 0.1.0, so it is harmless today.
- **Fix:** keep a single publishing branch (drop the two legacy entries) and use `group: eas-update-preview` (channel-wide).

### F-10: Boot chain has no error path (S3, medium)
**Evidence:**
- `App.tsx` l.47-58: `Promise.all([preloadAllTextures(), loadDisplayFont()]).then(… setTexturesReady(true))` has no `.catch`/`.finally`. Any throw in the `then` (or an unexpected rejection) leaves a permanent blank screen. The components are individually guarded today: `getReleaseInfo` try/catch, fonts "never throws" (tested), textures catch per key.
- `loadSaves().then(m => setSaves(m))` (l.45) is not part of the gate. If it resolved after the player had created a character (slow storage), `setSaves` would replace the in-memory map and the next `writeSaves` would persist without the new save. Low likelihood, because texture decoding normally outlasts the read.

**Fix** (OTA-safe):
- Use `.finally(() => setTexturesReady(true))` with a `.catch(e => logDebug('error', …))`.
- Gate on `Promise.all([textures, font, loadSaves().then(setSaves), loadSettings().then(apply)])`.

### F-11: `writeSaves` can overwrite a good backup with a corrupt primary (S3, medium)
**Evidence:** `src/util/storage.ts` `writeSaves` (≈l.307-327) copies whatever string is in the primary key to `…v1.bak` before writing. `loadSaves` falls back to the backup when the primary fails to parse.

Failure sequence:
1. The primary gets corrupted (partial write or crash).
2. `loadSaves` correctly restores from the backup.
3. The next `writeSaves` copies the **corrupt** primary over the good backup.
4. If that write then fails (storage full, process killed), both slots are bad and the roster is lost.

**Fix** (OTA-safe): `if (existing != null && parseSaves(existing)) await setItem(BACKUP, existing)`. Add a unit test with a corrupted primary followed by a failing second `setItem`, using the async-storage stub.

### F-12: Bug-report mailto body is unbounded, and the "fits in 8 KB" comment is false (S4, medium)
**Evidence:**
- `src/util/support.ts` l.42-48 joins the last 30 + 30 log entries with no per-entry or total cap.
- Entries include full JS stacks (`debug.ts` l.33, l.138-142) and every `console.warn/error` from libraries.
- At ~1.5 KB per stack, that is ≈90 KB before `encodeURIComponent` (≈1.3–3x). Mail apps truncate or reject URLs that size.
- `SettingsScreen.tsx` l.195 swallows `openURL` failures silently, so the user gets no feedback.

**Fix** (OTA-safe):
- Cap each entry at ~300 chars and the encoded body at ~6 KB, dropping the oldest entries first.
- On rejection, fall back to the existing COPY/SHARE INFO share sheet (with the full log).
- Unit-test `composeBugReportUrl` length with 60 long entries. `support.ts` is not loaded by any test today.

No personal data was found in logs: `logDebug` calls carry stage, seed and cause only, and character names are never logged or sent.

### F-13: Game has no teardown; `loopRef` is written and never read (S3/S5, medium)
**Evidence:**
- `src/game/Game.tsx` l.258 and l.2374 are the only references to `loopRef`. There is no `useEffect` cleanup in Game.
- `useStore.subscribe` (l.326) is discarded with `void`. Music, siren and audio players are never released.
- This is harmless while `<Game/>` mounts exactly once (App never unmounts it). But if `onContextCreate` fires again (GLView remount or context recreation), a second loop, subscription and music player would run alongside the first.

**Fix** (OTA-safe): add `useEffect(() => () => { loopRef.current?.stop(); unsub(); music.dispose(); siren.dispose(); }, [])`, with the handles hoisted into refs.

### F-14: Test suite has large gaps, and the regression tests commit messages promise are not in the repo (S4, high)
**Evidence (import-graph analysis):**
- 48/99 src modules are never loaded by any test. This includes `Game.tsx` (2407 lines), every `.tsx` (the loader handles no TSX/JSX), `SmokeCloud.ts` (smoke blocks vision, a core rule), `Camera.ts` (camera-alarm logic), `ThrownRock.ts`, `siren.ts` (pure WAV synth), `support.ts`, `releaseRuntime.ts`, `Music.ts`/`Sfx.ts`, `haptics.ts`.

**Fixed bugs (git log) with no committed regression test.** All of this logic lives in closures inside `onContextCreate` and is therefore untestable:
- `efd3582`:
  - Endless respawn landing in streamed-out ground (`respawnPoint`, l.1194)
  - Daily restart reusing the old world (coin farm)
  - sections dropped by guard home Z, leaving zombie guards and stuck meters
  - reinforcements never removed
  - backtrack clamp (l.1661)
  - fork side alternation (l.706, previously `(i/10)%2`)
  - boss popup shown twice
  - boss perk charged twice (`perkChargedStage`, l.1136-1149)
  - restart not clearing meters
- `dbeb84b`:
  - Volume as master for music (`musicLevel`, l.318)
  - tips marked seen too early (`TIP_READ_S` / `tickTips`, l.973-1033)
  - tutorialSeen flag never read
  - AlarmOverlay re-render quantisation
- `bf3ab45`: sliders inside the Modal need `GestureHandlerRootView`.
- `0defe73`: dependency hoisting. No automated guard (F-1/F-5).

The commit messages for `efd3582`, `dbeb84b`, `c9c44cf` and `370a624` cite "browser scenarios/checks" as the tests. **None of these are in the repo, and the web build cannot even run from a clean install (F-23).** They are not reproducible and do not run in CI.

**Already covered** (good): Pack-1 bugs 1-7 (bug 5 in procgen.test), belief recency, rule level, stamina drain, low-wall cover, sprint stance, the render-audit `resetState` crash (`4f87f99`), pause layout (`19d28d3`), embedded source commit, emergency launch, and generated-file staleness.

**Fix** (OTA-safe, test-only plus pure refactors): extract the closures listed in F-20 into pure modules and test them. Commit the browser scenarios, e.g. Playwright against `expo export --platform web`, once F-23 is fixed.

### F-15: Brittle or decoupled tests (S4, high)
- `tests/pack2-stealth.test.ts` l.19, 192, 202 assert `DOG_CHASE_SPEED < PLAYER_RUN_SPEED` and move the player by `PLAYER_RUN_SPEED*DT`. But `PLAYER_RUN_SPEED` (`geometry.ts` l.24) is **dead in the app**: the controller computes `base * 2` (`PlayerController.ts` l.94). Changing the sprint multiplier would leave the "player outruns the dog" test green. **Fix:** export a `moveSpeed(stance, running)` from PlayerController and use it in both places, or drive `updatePlayer`.
- `tests/uiIcons.test.ts` l.34-38 greps SettingsScreen.tsx source for `'SETTINGS_GEAR'` / `'>⚙<'`. That is an implementation-detail test. `textureProbes.test.ts` l.13 also greps `textures.ts` for keys. **Better:** export the key list from `textures.ts` and compare it to `TEXTURE_FILES`.
- Coverage reporting excludes unloaded files. If coverage is added to CI, use `--test-coverage-include='src/**'` so the 92.6% figure reflects reality.

### F-16: Render-check robustness (S4, medium)
- `scripts/ci/android-render-check.sh` uses fixed sleeps (90 s, 120 s, 8 s, 15 s) instead of polling logcat for `[render-audit] {`. That is slow, and flaky on slow emulators.
- `check-render-audit.mjs` l.34 checks `gitSha` only for OTA launches. The embedded config also carries `EE_GIT_SHA` (`release.gitSha` via app.config.js), so it could assert it for embedded launches too.
- The render check has no unit test, even though it already needed a truncation fix (`41e61a0`).
- It triggers only on `claude/game-review-suggestions-cjxiqh`.

**Fix:** a `until grep -q '\[render-audit\] {' …; do sleep 5; done` with a timeout, an embedded SHA assertion, and a fixture test for the parser.

### F-17: Dead code (S5, high)
Each item below was confirmed with `tsc --noUnusedLocals` and the TS-checker unused-export scan (`graph.txt`).
- `src/scenes/SnowCaps.ts` (94 lines): `buildCap` always returns `null`. Yet `Game.tsx` l.551 still calls `dustObstaclesWithSnow(s.procgen.obstacles().filter(…))` for every section, allocating an array per call. `CAP_MAT`, `T`, `box`, `cyl` and `sphereCap` are unused. Delete the module and its call.
- `src/util/geometry.ts`: 13 exports are referenced nowhere in the app: `LANES`, `LANE_WIDTH`, `OBSTACLE_RADIUS`, `PLAYER_RUN_SPEED` (tests only, see F-15), `PLAYER_PRONE_SPEED`, `PLAYER_LATERAL_SPEED`, `GUARD_PATROL_SPEED`, `GUARD_CHASE_SPEED` (6.5), `VISION_RANGE`, `LIGHT_VISION_BONUS`, `NOISE_RANGE_RUN/WALK`, `DETECTION_DECAY`, `getVisionRange`. They are misleading tuning values that the real systems don't use.
- `src/scenes/PrisonYard1.ts`: `BlockyFigure` type, `PLAYER_COLOR`, `GUARD_COLOR`, `skinHex`, `createFacingMarker` (≈l.17-32, 144). Also, the file name no longer describes its contents (figure factories).
- `StartScreen.tsx` l.122 `FigurePickButton` and l.262 `onPickSkin` (skin picker removed in `fcd3f63`).
- `Game.tsx` l.903 `DEMO_PERIOD`, and `loopRef` (F-13).
- Unused imports: `LightTower.ts` l.2 `CHUNK_LEN`, `CHUNKS_AHEAD`; `Weather.ts` l.2 `PLAY_HALF_W`; `ProcgenSystem.ts` l.7 `COVER_RADIUS`; `EventFlash.tsx` l.11 `import {  } from '../../ui/theme'` (empty import).
- Unused exports: `Lighting.moodByName` (l.161), `Fence.spawnArenaFences` (l.234), `SmokeCloud.pointInAnySmoke` (l.121), `Obstacles.blocksLineOfSight` (l.106), `theme.white` (l.12).

All of these removals are OTA-safe.

### F-18: Stale compatibility path: textures are shipped twice (S5, high)
**Evidence:**
- `textures.ts` l.95-121 always tries the embedded base64 PNGs first (`textureData.ts`, 131 KB). Tests prove all 11 keys are embedded (`textureProbes.test.ts` "probes cover every preloaded texture").
- The `require('../../assets/…png')` calls (l.162-186) still bundle the 11 PNGs as assets (confirmed in the Android export: 11 png), plus `textureSource.ts` (168 lines, 3 native routes via `ExpoAsset.downloadAsync`) and its 137-line test.
- That fallback exists for an expo-asset native failure which `0defe73` fixed.
- `AlarmOverlay.tsx` l.13 says it is a "stand-in for a siren until expo-audio is wired". The siren has existed since `scenes/Siren.ts`, so the comment is stale.

**Fix (OTA-safe):** keep the fallback only if you want belt-and-braces. Otherwise drop the `require`s and `textureSource.ts`, and pass `key`→data only. Diagnostics stay via `STATUS.details`.

### F-19: Overlapping feedback systems (S5, high, design review recommended)
- **Two edge-tint systems** both read max guard detection and render together (Game.tsx l.2380-2381):
  - `AlarmOverlay` pulses a red feathered edge above 0.20.
  - `EdgeVignette` builds an amber→red tint above 0.30, plus a catch pulse.
- **Four catch effects** fire on the same transition: `EventFlash` (full-screen red), the `EdgeVignette` catch pulse, `CatchFlash` (handcuffs/skull), and the `Banner` card.
- **Two danger audio layers:** the `Siren` (above 0.20) and the `Music` alert/chase layer.

Pick one owner per signal, e.g. EdgeVignette for the edge, with AlarmOverlay folded into it. There is only **one** toast system (store.toast plus Toast.tsx), and tips route through it, which is good.

### F-20: Game.tsx (2407 lines): safe extraction seams (S5, high)
`onContextCreate` (l.260-2375) is one ~2100-line closure, and `update()` alone is l.1411-2194 (~780 lines).

Seams, in order of value and safety. Each depends only on values passed in and is unit-testable:
1. **TipDirector** (l.957-1033: `queueTip`, `offerTip`, `markTipSeen`, `tickTips`, `sessionSeen`, `TIP_READ_S`). Pure state plus callbacks `{showToast, persistSeen}`. This covers the `dbeb84b` regression.
2. **Run economy and progression** (l.1302-1410: `payRun`, `finishEndlessRun`, the save mirroring in `handleWin`). Move to `util/runFlow.ts` with an injected store and `writeSaves`.
3. **Hearts/perk ledger** (l.1130-1158 `grantStartingHearts`, `perkChargedStage`). Class `PerkLedger`, covering the `efd3582` perk double-charge.
4. **Endless streaming** (l.459-807: `populateSection`, `dropGuardAt`, `sectionBusy`, `removeSection`, `streamEndless`, `levelAtZ`, `moodStageFor`, the fork side at l.706, `respawnPoint` l.1194, the backtrack clamp l.1661). Class `SectionStreamer` over the procgen and scene interfaces. Tests: respawn on live ground, section retention while chased, fork alternation.
5. **Reinforcements** (l.915-955) and **render-audit scheduling** (l.814-815, 2350-2370).

Leave the three.js mesh plumbing in Game. Each extraction is JS-only and OTA-safe.

### F-21: Tooling and type-checking gaps (S5, high)
- **No linter.** There is no ESLint config, yet `Tutorial.tsx` l.195 and `PickupBag.tsx` l.128 carry `eslint-disable-next-line react-hooks/exhaustive-deps`, so hook dependency bugs are unchecked. Add `eslint-config-expo` (flat) with `react-hooks`, and `npx expo lint` in CI.
- **tsconfig:** add `"verbatimModuleSyntax": true` and `"erasableSyntaxOnly": true`. Both pass today with 0 errors. They lock in what the Node type-stripping test loader needs: a type imported without `type`, or an enum, would crash `npm test` at link time while tsc stays green. Also add `noUnusedLocals`/`noUnusedParameters` after fixing F-17's 12 sites.
- **Node version:** tests rely on unflagged TS stripping (Node ≥ 22.18, per `tests/loader.mjs` header). There is no `engines`/`.nvmrc`. Add `"engines": {"node": ">=22.18"}` and `.nvmrc`.

### F-22: Config hygiene (S5, high)
- `eas.json` is stale for this pipeline (EAS Build is no longer used):
  - the `production` channel is never published to
  - `development` sets `channel: development`
  - `appVersionSource: remote` would conflict with run-number versionCodes if anyone ran `eas build`

  Trim it to `cli` only, or mark it unused.
- `package.json` `"version": "0.1.0"` vs app 0.2.1. Unused, but confusing.
- `@types/three` belongs in `devDependencies`.
- `expo-dev-client` is in `plugins` for release APKs. The dev launcher activates only in debug, but it adds config and native code. Fine for an internal tester build; reconsider before store release.
- The `babel.config.js` "build-trigger marker" comment (l.1-5) documents an abuse of the path filter. A `workflow_dispatch` already exists for that.

### F-23: The web build path is broken from a clean install (S4, high, verified)
**Evidence:**
- `npm run web` and `npx expo export --platform web` fail with "Install react-dom@19.1.0, react-native-web@~0.21.0". Neither is in package.json or node_modules.
- Several commit messages rely on "browser checks", so those checks ran on an uncommitted dependency set. README doesn't mention web at all.

**Fix:** `npx expo install react-dom react-native-web @expo/metro-runtime` as devDependencies (JS-only; F-1's fingerprint is unaffected by non-native packages), plus a README "Web (testing only)" section. Alternatively, remove the `web` script.

### F-24: README accuracy (S5, high)
- **Accurate:** branches, the runtime 0.2.1 explanation, the channel, the verify step, the embedded texture path, and the expo-asset history.
- **Missing or misleading:**
  - no rollback procedure (F-2)
  - "Each runs typecheck and the unit tests first and refuses to publish on failure" is true, but the render check does not gate publishing (F-2)
  - nothing about the web path (F-23)
  - "Bump `version` whenever a change adds or alters native code" is the only safeguard (F-1)
  - nothing about the public debug keystore's implications (F-7)

---

## What is solid
- **Type checking:** strict TypeScript with zero errors and essentially no `any` or ignores (see the escape-hatch counts above).
- **Tests:** a fast (15 s), deterministic node:test suite with small, honest stubs. The 7 pack-1 bugs and most recent AI/stealth fixes have real regression tests.
- **Generated files:** `textureData.ts`, `textureProbes.ts` and `iconData.ts` have staleness tests that regenerate them from the PNGs and compare byte-for-byte. The decoder is cross-checked against a reference decoder.
- **Release identification:** `app.config.js` stamps CI metadata (tested). `verify-ota.mjs` checks the served manifest id, runtime, sequence and SHA as a device would. The Build/Update Info and bug reports read real metadata.
- **Runtime discipline is currently intact:** no native-input change since the 0.2.1 bump (`0defe73`), and all direct deps match SDK 54.
- **Repo hygiene:** no secrets or keystores committed. `.gitignore` covers `/android`, `/ios`, keys and `.env`. Secrets are used only via `secrets.EAS` / `GITHUB_TOKEN`.
- **Storage:** AsyncStorage use is defensive (schema-validated `parseSaves`, clamped settings, per-key serial write queue, backup slot). Logs contain no player names.
- **Emulator check:** the render check is a genuinely strong device-level gate (texels read back from the GPU, plus a lifecycle background/foreground check). It just needs to gate publishing (F-2).

## Summary by severity
| ID | Sev | Title | OTA-safe fix |
|---|---|---|---|
| F-1 | S1 | No native-compat (fingerprint) guard; OTA can ship to APKs missing native code | yes (CI) |
| F-2 | S2 | OTA live before the render check; verify is post-hoc; no rollback runbook | yes (CI/docs) |
| F-3 | S2 | `build-N` tags point at main, not the built commit; dispatch also publishes releases | yes (CI) |
| F-4 | S2 | No PR/branch CI; no Metro bundle check before publish; tests-only pushes republish | yes (CI) |
| F-5 | S2 | worklets 0.8.1 phantom dep off-SDK (expects 0.5.1); RN 0.85 toolchain duplicated | no (native) / babel part yes |
| F-6 | S2 | RECORD_AUDIO + ACTIVITY_RECOGNITION declared; expo-sensors unused | no (APK + runtime bump) |
| F-7 | S2 | Public debug keystore; later key change wipes tester saves | no (APK) |
| F-8 | S5 | eas-cli `latest`, default token perms, unpinned 3rd-party action, retention, run_number reuse | yes (CI) |
| F-9 | S3 | cancel-in-progress on publish; 3 branches share a channel with per-ref concurrency | yes (CI) |
| F-10 | S3 | Boot promise has no catch; saves load not gated | yes |
| F-11 | S3 | writeSaves backs up a corrupt primary over a good backup | yes |
| F-12 | S4 | Bug-report mailto unbounded; silent failure | yes |
| F-13 | S3/S5 | No Game teardown; `loopRef` dead; leaked subscription | yes |
| F-14 | S4 | 48/99 modules untested incl. Game.tsx; efd3582/dbeb84b fixes lack committed tests; "browser scenarios" absent | yes |
| F-15 | S4 | Test uses dead `PLAYER_RUN_SPEED`; source-grep tests | yes |
| F-16 | S4 | Render-check sleeps, embedded SHA unchecked, parser untested | yes (CI) |
| F-17 | S5 | Dead code: SnowCaps no-op per section, 13 dead geometry constants, etc. | yes |
| F-18 | S5 | Texture fallback path and PNGs shipped alongside embedded base64 | yes |
| F-19 | S5 | Two edge-tint systems, four catch effects, siren plus music chase | yes |
| F-20 | S5 | Game.tsx extraction seams (TipDirector, RunFlow, PerkLedger, SectionStreamer) | yes |
| F-21 | S5 | No ESLint; enable verbatimModuleSyntax/erasableSyntaxOnly (0 errors); engines | yes |
| F-22 | S5 | Stale eas.json, version mismatch, @types/three placement, dev-client in release | mostly yes |
| F-23 | S4 | Web build fails from clean install; browser checks not reproducible | yes (JS devDeps) |
| F-24 | S5 | README gaps: rollback, web, keystore | yes |

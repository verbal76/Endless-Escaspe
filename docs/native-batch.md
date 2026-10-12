# Native batch (next APK cycle): prepared, NOT released

Everything here is config and docs on branch `claude/hold-native-batch`
(from 02e13eb / OTA 131). Nothing has been built, published or pushed.
It changes the native layer, so it can only reach players as a new APK.

## What is on the branch

| file | change |
| --- | --- |
| `app.json` | `version` 0.2.1 -> 0.3.0; `android.blockedPermissions` (3); plugin `["expo-navigation-bar", {"visibility": "hidden"}]` |
| `package.json` / `package-lock.json` | + `react-native-worklets` 0.5.1; + `expo-navigation-bar` ~5.0.10; - `expo-sensors`; `@types/three` -> devDependencies; `engines.node >=22.18` |
| `babel.config.js` | removed the duplicate `react-native-worklets/plugin` |
| `eas.json` | trimmed to `preview`, `production`, `production-apk` |
| `app.config.js` | `EE_UPDATE_CHANNEL` (validated) overrides the baked-in channel header; unset = `preview` as before |
| `scripts/native-fingerprint.json` | + `"0.3.0"` hash |
| `.github/workflows/production-build.yml` | new, manual only |
| `src/util/saveExport.ts`, `tests/saveExport.test.ts`, `tests/productionWorkflow.test.ts` | pure save export/import logic and guards; no UI |
| `docs/signing-migration.md` | what the key switch does to Build 13 installs |

`src/` existing files, `storage.ts` and `Game.tsx` are untouched.
Checked: `npx tsc --noEmit`, `npm test` (204 pass), `actionlint`, and, in
a clean `npm ci`-style copy with the new lockfile, the fingerprint gate
and `expo export --platform android` (see "Verification" below).

## Permissions (F-6)

Evidence from this tree (grep of `src/`, `App.tsx`, and the installed
library sources):

| permission | declared by | used by the game? | decision |
| --- | --- | --- | --- |
| `RECORD_AUDIO` | expo-audio library manifest | No: no recorder, no `useAudioRecorder`, no audio sampling (`AudioPlayer.kt` needs it only for `setAudioSamplingEnabled`; not called). Only `createAudioPlayer` in `scenes/Music.ts` and `scenes/Siren.ts`. | block |
| `ACTIVITY_RECOGNITION` | expo-sensors library manifest | No: `expo-sensors` has 0 imports. The package is also removed. | block (and uninstall) |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | expo-audio library manifest | No. The service it serves, `AudioControlsService`, is only started by `setActiveForLockScreen`, which is never called, and `App.tsx` sets `shouldPlayInBackground: false`. | block |

Kept (declared by libraries and needed): `INTERNET` (updates),
`VIBRATE` (haptics), `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`
(harmless, normal-level).
Verified by running `expo prebuild --platform android` on a clean install:
the merged manifest carries `tools:node="remove"` for the three blocked
permissions. If the game ever adds lock-screen controls or background
music, unblock `FOREGROUND_SERVICE_MEDIA_PLAYBACK` first (starting that
service without it throws on Android 14+).

Seen in the prebuilt manifest and NOT changed (not in the brief, source
not traced): `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`,
`SYSTEM_ALERT_WINDOW`. The last is the React Native / dev-client debug
overlay. Consider blocking them too after tracing which package adds
them.

Not verified: that Gradle's release lint (`lintVitalRelease`) accepts the
manifest with the FGS permission removed while the library still declares
the service. It could only be tested by a Gradle build, which was not
run. If the first build fails there, unblock only that permission and
keep the other two.

## Navigation bar (V13/F)

Native module `expo-navigation-bar` `~5.0.10` (the version Expo SDK 54's
`bundledNativeModules.json` lists; peers are `*`). Its config plugin
accepts `visibility: "hidden"` and writes `expo_navigation_bar_visibility`
into `strings.xml` (verified in the prebuild); at start-up
`NavigationBarReactActivityLifecycleListener.onCreate` calls
`WindowInsetsControllerCompat.hide(navigationBars())`. That needs no JS
call. It works with `edgeToEdgeEnabled: true`: the edge-to-edge
restriction in the package applies to `setBackgroundColorAsync`,
`setBehaviorAsync`, `setPositionAsync` etc., not to visibility.

Not verified (needs a device): that the bar stays hidden after the app is
backgrounded or a system dialog steals focus. Android may bring bars back
as transient on swipe (expected, and the usual game behaviour). If it
re-shows after resume, add a one-line
`NavigationBar.setVisibilityAsync('hidden')` on AppState `active`: that is
a JS change, deliverable by OTA once the module is in the APK.

## Backup behaviour

`android:allowBackup="true"` (Expo default; the prebuilt manifest shows
it). Left unchanged: it is what lets Android restore a reinstall in the
best case. See `docs/signing-migration.md`. To opt out later:
`android.allowBackup: false` (native change).

## Dependencies

- `react-native-worklets` **0.5.1**, exact. Verified: Expo SDK 54's
  `bundledNativeModules.json` (installed `expo` 54.0.x) lists
  `"react-native-worklets": "0.5.1"`; installed `react-native-reanimated`
  4.1.7 declares `peerDependencies.react-native-worklets: "0.5 - 0.8"`, so
  0.5.1 is in range. Before this change the lockfile held a phantom 0.8.1
  (a transitive of reanimated), which can drift on any lockfile
  regeneration; it also pulled a second RN 0.85 toolchain.
- `babel-preset-expo` 54 adds `react-native-worklets/plugin` by itself
  when the package is installed (`build/index.js` l.285-289), so the
  explicit entry ran the transform twice. Removed. Verified by a successful
  `expo export --platform android`.
- `expo-sensors` removed (0 imports). `@types/three` moved to
  devDependencies (types only). `engines.node >=22.18`: `npm test` runs the
  TypeScript sources through Node's native type stripping
  (`node --import ./tests/register.mjs`; `tests/loader.mjs` header says
  22.18+); `engines` only warns on older Node unless `engine-strict` is set.
  CI uses Node 22 (resolves to >= 22.18).
- All Expo packages checked against `bundledNativeModules.json` with
  semver after the change: all in range.
- `package.json` `"version": "0.1.0"` is unused and left as is (the app
  version lives in `app.json`).

## eas.json profiles

The tester line is built by `apk-build.yml` (Gradle on GitHub runners)
and does not read `eas.json`. `eas.json` is only used by EAS cloud builds
and by `eas update`.

| profile | what it does | credentials | channel |
| --- | --- | --- | --- |
| `preview` | EAS cloud APK, internal distribution. Not used by CI; kept for the tester line (same channel as the GitHub-built APKs). Note an EAS-built preview APK is signed with the EAS-managed key, NOT the debug key, so it cannot update a GitHub-built install in place. | EAS-managed | `preview` |
| `production` | EAS cloud **AAB** for Play (`autoIncrement`, remote versionCode) | EAS-managed (create once, owner-only) | `production` |
| `production-apk` | `production`, but an APK, for sideloading the production-signed build | EAS-managed | `production` |

Removed: `development` (dev client; `channel: development` was never
published to) and the empty `submit` section. No profile sets
`credentialsSource: local`, so no `credentials.json` and no secrets live
in the repo. `appVersionSource: remote` stays because the production
profiles use `autoIncrement`; it only affects EAS builds (GitHub builds
get their `versionCode` from the run number via `app.config.js`).

## Channels: which APK follows what

| APK | built by | channel header | runtime | receives OTAs from |
| --- | --- | --- | --- | --- |
| Build 13 and earlier | apk-build.yml | `preview` | 0.2.1 | eas-update.yml, only while the live branch is at 0.2.1 |
| next tester APK (this batch) | apk-build.yml | `preview` (from `app.json`) | 0.3.0 | eas-update.yml after the version bump |
| production-signed | production-build.yml | `production` (`EE_UPDATE_CHANNEL`) | 0.3.0 | nothing yet |

`eas-update.yml` publishes only to channel `preview`
(`eas update --channel preview`), and `verify-ota.mjs` reads the channel
from `app.json`. An APK on channel `production` therefore never sees an
update until a publish path for `production` exists (a channel input on
the publish job plus a matching verify). That is deliberately not built
yet. `app.config.js` takes the channel from `EE_UPDATE_CHANNEL` rather than
trusting EAS Build to rewrite the header, so it is visible in the
config. Verify on the first production build by inspecting the
`expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` meta-data
in the built manifest, or the build log's embedded update configuration.

## Version and runtime

- `runtimeVersion.policy = appVersion`. Next version: **0.3.0**
  (minor: new native modules and a permission change; no breaking
  gameplay change). Pick it the same way next time: any change to the
  native fingerprint needs a new version.
- Effect on OTA delivery:
  - Devices on 0.2.1 (Build 13) keep matching only updates published with
    runtime 0.2.1. They are not moved to 0.3.0 by OTA (a runtime mismatch
    makes the update ineligible), only by installing the new APK.
  - The new APK line has its own runtime, 0.3.0, and its own update
    stream.
  - **Ordering trap.** `eas-update.yml` publishes from the live branch with
    whatever `app.json` `version` it contains. Once this branch is merged
    there, every OTA is runtime 0.3.0 and 0.2.1 devices get nothing
    further. Anything meant for 0.2.1 devices (the saves export/import OTA
    in `docs/signing-migration.md`, a last fix) must be published from the
    live branch BEFORE the merge, and the next 0.2.1 OTA after the merge
    would need a maintenance workflow/branch that does not exist.
  - **Merging = building.** `apk-build.yml` triggers on pushes to the live
    branch touching `package.json`, `app.json`, `eas.json`, ..., so the
    merge starts a debug-key APK build and a GitHub release `build-N`
    automatically. That is the intended release step; do not merge until
    the checklist below reaches it.
  - `eas-update.yml` ignores `package.json`/`app.json` pushes, so the merge
    itself publishes no OTA. After the APK is installed, push a trivial JS
    change (or run the workflow manually) to publish the first 0.3.0 OTA;
    an OTA published before an APK exists is ignored by APKs built after it
    (README).
- Fingerprint flow (exact commands, from `scripts/check-native-fingerprint.mjs`):
  1. `npm ci` (a real install, not a symlinked `node_modules`).
  2. bump `version` in `app.json`.
  3. `node scripts/check-native-fingerprint.mjs --print` shows the hash.
  4. `node scripts/check-native-fingerprint.mjs --record` writes
     `scripts/native-fingerprint.json` (refuses to overwrite a version that
     is already recorded with a different hash).
  5. commit `app.json` + `scripts/native-fingerprint.json` together;
     `ci.yml` runs `node scripts/check-native-fingerprint.mjs` and fails on
     any mismatch.
- **Recorded on this branch:** `0.3.0` =
  `b32bf103e9682e94fc5bdcd6f83cdf779058ac04`. The shared worktree's
  `node_modules` is a symlink to the OLD install (worklets 0.8.1, no
  navigation bar), so a local run there gives a wrong hash. The value was
  computed in a separate clean install from this branch's lockfile
  (`npm install` with the new lockfile, `--ignore-scripts`), after
  checking that the same method reproduces the already-recorded 0.2.1
  hash `df1f0f4d...` from commit 02e13eb. It was recorded here with
  `--record --hash <that hash>`. The check passes in that clean install.
  CI's own `npm ci` is the final judge: if `ci.yml` reports a mismatch,
  copy the hash it prints (`--print`) into the `0.3.0` entry (the version is
  unreleased, so editing is fine; `--record` would refuse). Any further
  native change on this branch (e.g. adding crash reporting) changes the
  hash: re-run steps 1-4 and replace the value.
- `versionCode` for GitHub builds = run number of apk-build.yml (always
  above 13, so Build 13 updates in place: same debug key, higher
  versionCode). EAS production builds use EAS's own counter: before the
  first one, set it above the highest `build-N`:
  `eas build:version:set --platform android` (owner-only).

## Crash and error monitoring (evaluated, not added)

Facts marked (V) were verified from package contents / registry on
2026-10-03 (`npm view`, `npm pack`, `bundledNativeModules.json`); the
vendor documentation sites (docs.sentry.io, rnfirebase.io, docs.expo.dev)
were not reachable from this environment, so pricing and docs-level claims
are marked (U) = not verified, check before deciding.

| | Sentry `@sentry/react-native` | Firebase Crashlytics (`@react-native-firebase/app` + `crashlytics`) | Expo's own |
| --- | --- | --- | --- |
| SDK 54 fit | `~7.2.0` is Expo SDK 54's bundled version (V); peers `expo >=49`, `react-native >=0.65` (V). 8.x also exists. | latest 26.4.0 peers `expo >=47`, `@react-native-firebase/app` 26.4.0 (V). Compatibility with RN 0.81 / SDK 54 specifically (U); pick the release line that matches RN 0.81. | `expo-insights ~0.10.8` is bundled for SDK 54 (V) but reports usage / launches, not crashes (U). No crash reporting product from Expo itself. |
| native vs OTA | SDK is a native module: a new APK once. After that, `Sentry.init` / `Sentry.wrap` and breadcrumbs are JS and ship by OTA (V: auto-init is off in the library manifest, `io.sentry.auto-init=false`). | Native (Gradle plugin + `google-services.json`): new APK; JS calls (`recordError`, logs) by OTA. | n/a |
| Android permissions added | `INTERNET`, `ACCESS_NETWORK_STATE` (V, library manifest). `INTERNET` is already present. Net new: `ACCESS_NETWORK_STATE`. | Firebase BoM libraries; library manifests add a provider and meta-data only (V); the Firebase SDKs themselves add network-state style permissions (U). | none |
| Data collected | stack traces, device model/OS, breadcrumbs, release; IP handling is project-level and `sendDefaultPii` is client-level (U). Can be limited: no replay, no tracing, no user id. | crashes, device info, installation id, optional Analytics (U); data goes to Google. | usage counts (U) |
| Play Data Safety | declare "crash logs" / "diagnostics" collected, not linked to identity if no user id is set | same, plus Google as processor | n/a |
| Cost | has a free developer tier with a small monthly error quota (U: check current numbers) | free (U) | included with EAS plan (U) |
| Account / setup | Sentry org + project, DSN (public), auth token for source maps (CI secret `SENTRY_AUTH_TOKEN`) | Firebase project + app registration + `google-services.json` committed or injected | n/a |
| Source maps for OTA | upload per OTA with the package's `scripts/expo-upload-sourcemaps.js` (V present) | needs its own mapping upload (U) | n/a |

Recommendation: **Sentry**. It is the SDK 54-bundled version, needs no
Google project or `google-services.json`, adds one small permission,
captures JS errors (the common failure here) as well as native crashes,
and its JS side is OTA-deliverable. Not added to `package.json` on this
branch: it needs an owner decision on the account and the privacy
disclosure, and any addition changes the native fingerprint.

Exact change set when approved (one commit on this branch, then re-record
the fingerprint):
1. `npx expo install @sentry/react-native` (-> `~7.2.0`).
2. `app.json` plugins: `["@sentry/react-native/expo", { "organization": "<org>", "project": "<project>" }]`
   (token never in the file; the plugin warns on `authToken`).
3. App entry (OTA-able later): `Sentry.init({ dsn, sendDefaultPii: false,
   tracesSampleRate: 0, enableAutoSessionTracking: false })` and
   `export default Sentry.wrap(App)`; send only a release tag
   (`extra.release.gitSha`, build number) so reports map to builds.
4. Secrets: `SENTRY_AUTH_TOKEN` as a repository secret (owner-only),
   used only by a source-map upload step in `eas-update.yml` and the APK
   build.
5. Add `ACCESS_NETWORK_STATE` to the Data Safety / privacy text.
6. Re-run the fingerprint flow (hash changes), then ship as the same
   `0.3.0` APK if not yet released.

## Signing architecture (prepared, not used)

- Tester line, unchanged: `apk-build.yml` -> debug-keystore APK ->
  GitHub release. Updates Build 13 in place.
- Production line: `.github/workflows/production-build.yml`
  (`workflow_dispatch` only; no push/PR/schedule/call trigger, guarded by
  `tests/productionWorkflow.test.ts`). Needs `confirm` = `BUILD PRODUCTION`,
  an expected `version` that must equal `app.json`, the fingerprint gate,
  typecheck and tests, then
  `eas build --platform android --profile <production|production-apk> --non-interactive --no-wait`.
  `--non-interactive` makes EAS fail rather than create a keystore.
  It does not submit, publish an OTA, or touch the tester pipeline.
  Uses the existing repository secret `EAS` as `EXPO_TOKEN`; no new secret.
- Credentials are EAS-managed: nothing in the repo, no keystore secrets in
  GitHub. Back the keystore up (`eas credentials`, download) and keep the
  Play upload-key reset option in mind.

## Ordered checklist for the single native cycle

Owner-only steps are marked (owner).

1. Playtest of Build 13 / OTA 131 finishes; collect decisions.
2. Build the saves export/import UI (post-playtest), review it, publish it
   as an OTA on runtime 0.2.1 from the live branch; wait until the
   owner's and testers' devices show that OTA (Settings -> Build / Update
   Info). Rollback of this step is the normal OTA rollback.
3. Decide crash reporting (above); if yes, add it on this branch, re-record
   the fingerprint.
4. Re-check this branch: rebase onto the live branch, re-run
   `npm ci`, `--print`, fix the recorded hash if it moved,
   `npx tsc --noEmit`, `npm test`, `actionlint`.
5. (owner) Decide: same key (debug) for this cycle, or the key switch.
   Recommended: this cycle keeps the debug key (updates in place,
   no data loss); do the key switch as a separate, announced step.
6. Merge to the live branch. This starts `apk-build.yml` (build-N, runtime
   0.3.0, channel `preview`) and publishes no OTA. Check the build log:
   "Show embedded update configuration", the printed native fingerprint
   equals the recorded one, the release lists the same hash.
7. (owner) Install the APK on one device first (the owner's). Open it:
   check Settings -> Build / Update Info says `v0.3.0`, the navigation bar
   is hidden, no microphone / activity-recognition entries under the app's
   permissions (Android Settings -> Apps -> permissions), music and siren
   play, save slots intact (same key, update in place).
8. Push a trivial JS change (or run eas-update.yml) so a 0.3.0 OTA exists;
   confirm the device picks it up (Build / Update Info).
9. Hand the APK to the other testers.
10. Key switch (later, separate): (owner) create production credentials
    once: `eas build --platform android --profile production-apk`
    interactively on a trusted machine, accept "Generate new keystore",
    then download a backup (`eas credentials`). (owner) set the version
    code above the highest `build-N` (`eas build:version:set`). Run
    production-build.yml (Actions -> Run workflow, type the confirm text).
    Testers: export saves, uninstall, install, import
    (`docs/signing-migration.md`). The `production` channel has no
    publish path yet.

## Rollback

- Before step 6: nothing is released; delete the branch.
- After the APK is released: a bad 0.3.0 APK cannot be rolled back
  by installing Build 13 over it (`INSTALL_FAILED_VERSION_DOWNGRADE`);
  that needs an uninstall (data loss). Hence step 7: one device first.
  If a JS problem only: OTA rollback for the 0.3.0 stream
  (`ota-rollback.yml`). If native: fix forward with a new APK (higher
  versionCode, same key). Build 13 remains downloadable from its release;
  0.2.1 devices still get 0.2.1 OTAs only if something publishes them
  (see the ordering trap).
- Key switch failed: testers who have not uninstalled are unaffected
  (the new APK cannot install over them); those who exported can import
  into any later install.

## What happens to existing Build 13 installs

- Same key (this cycle): installing the 0.3.0 APK updates in place; saves
  and settings stay; the app starts on runtime 0.3.0 and follows the
  `preview` channel's 0.3.0 stream. Until then they keep running, and keep
  receiving 0.2.1 OTAs only while something publishes them.
- Key switch: must be uninstalled first; local saves are lost unless
  exported (`docs/signing-migration.md`).
- Permissions: after the update, Android drops the microphone and
  activity-recognition permission entries that were declared before.

## Verification done and not done

Done: `npx tsc --noEmit`, `npm test` (204 pass), `actionlint` clean; clean
install from the new lockfile: all Expo packages vs
`bundledNativeModules.json`, `expo prebuild --platform android`
(manifest + `strings.xml` inspected), `expo export --platform android`
(bundles with the babel change), fingerprint gate OK for 0.3.0.
Not done: any Gradle build, APK install or device check; any workflow run;
anything against Expo's servers (credentials, `eas build`, `eas update`);
vendor pricing and policy pages (blocked from this environment).

# Endless Escape

A stealth escape game for Android phones: slip past guards, dogs,
cameras and searchlights across a prison yard.

- **Campaign**: numbered stages with a finish line, 1-3 stars each.
  Every 10th stage is a boss arena (survive 60 s; lose and you retry).
- **Endless**: a seeded yard that never ends; it gets harder every
  120 m. Scored by distance.
- **Daily Run**: Endless with the same yard for everyone on a given UTC
  day.

Coins come from stars (paid once per star per stage) and from distance
in Endless / Daily. They buy cosmetic prisoner outfits only.

(The repository and package id keep the original "Escaspe" spelling so
existing installs and saves keep working; the game's visible name is
"Endless Escape".)

## How it plays

- Guards see in a cone. Props hide you only when they are **between**
  you and the guard: standing needs a chest-high prop, crouching also
  hides you behind low walls. Cameras obey the same cover rule.
- Without line of sight, a guard's meter always decays. Noise (the ring
  around your feet) can alert a guard and send them investigating, but
  only sight escalates to a chase.
- Guards shoot only with a clear view and after a visible laser
  wind-up. Chest-high props stop bullets; low walls don't.
- Guards pursue where they last saw or heard you, never where you
  secretly are. From stage 6 they stop and scan before searching.
- RUN stands you up and sprints (running speed, running noise); let go
  and you drop back into your stance.
- Standing in a floodlight raises every guard's meter; from stage 8
  some floodlights track you.
- Dogs are faster than walking and slower than sprinting, and give up
  after a short burst. Smoke makes them lose your scent; a crowbar
  scares them off.
- A full camera alarm dispatches a reinforcement guard.
- Pickups: crowbar (stuns a guard for 4 s or scares a dog; a miss wastes
  it), smoke bomb (blocks guard sight for 5 s - not cameras), rock
  (throw it; guards investigate the noise).
- From stage 3, forks offer a short guarded lane with extra pickups or
  a longer safe slalom.
- Each stage has a single lighting mood; at night guards see less far
  except when you're in a floodlight.

## Stack

- Expo SDK 54, React Native 0.81 (new architecture), TypeScript
- Rendering: `three` on `expo-gl`
- State: `zustand`; saves in AsyncStorage (with a backup slot)
- Input: `react-native-gesture-handler` + `react-native-reanimated`
- Audio: `expo-audio` (music + Kenney CC0 sound effects)
- Updates: `expo-updates` against EAS Update

## Repository layout

```
App.tsx                boot: logger, settings, saves, textures + font
app.json               static app config (version = runtime version)
app.config.js          CI metadata -> versionCode + extra.release
src/
  game/                Game.tsx (scene building, update/render loop),
                       Renderer, Loop, CameraRig
  systems/             PlayerController, GuardAI, DetectionSystem,
                       ProcgenSystem (walkability-checked, streaming),
                       NavGrid + Navigator (A* pathing), Projectiles,
                       HideSystem, InputSystem
  scenes/              three.js builders: props, figures, dogs, fences,
                       lights, weather, backdrop, cues, effects, audio
  components/HUD/      React Native HUD, menus, settings, tutorial
  state/store.ts       zustand store
  ui/                  design tokens + display font loader
  util/                progression curves, scoring, economy, outfits,
                       saves, daily seeds, release metadata, tips, ...
tests/                 node:test suites (npm test)
scripts/verify-ota.mjs post-publish OTA verification (CI)
scripts/ci/            Android emulator render check (CI)
scripts/gen-texture-probes.mjs
                       regenerates util/textureData.ts + textureProbes.ts
                       from the texture PNGs (run after changing one)
assets/                models, textures, music, sfx, fonts (see
                       assets/LICENSES.md)
```

## Development

```
npm ci
npm run typecheck      # tsc --noEmit
npm test               # node:test with a small resolve hook (tests/)
npx expo start --dev-client
```

The tests run the real game modules under Node (native-only packages
are stubbed in `tests/stubs`). They cover the procedural walkability
guarantee, guard/dog AI, detection rules, economy and save migration,
release metadata, music intensity and more.

## Builds and over-the-air updates

Two GitHub Actions workflows ship the game; `ci.yml` (typecheck, unit
tests, native fingerprint gate, Android bundle export) runs on every
pull request and every pushed branch, and never publishes anything.

| Change | Workflow | Result |
| --- | --- | --- |
| A public-version bump: `release.json` (see `docs/RELEASING.md`; native-file edits alone do not build) | `apk-build.yml` | Release-variant APK, published as GitHub Release `Endless Escape v<N>` (N from `release.json`; see `docs/RELEASING.md`), tagged `build-<run>` at the built commit |
| JS / assets only | `eas-update.yml` | EAS Update on channel `preview` (OTA sequence = run number) |

`eas-update.yml` triggers on pushes to `claude/game-review-suggestions-cjxiqh` (the
only branch that publishes OTAs); `apk-build.yml` starts only when `release.json`
changes on the live or qualification branch. Both can be run manually. Pushes that
only touch docs, tests, scripts or workflows publish nothing. GitHub Actions minutes
are a scarce shared budget: see `docs/ACTIONS-BUDGET.md`.

An OTA is published only after, for the same commit:

1. **validate** (`ci.yml`): typecheck, tests, fingerprint gate, bundle export;
2. **render check** (`android-render-check.yml`, ~30-40 min): the release
   configuration is built for x86_64 and run on an Android emulator; it
   fails unless the in-app render audit reports every textured model
   drawn with its texture, the GPU texels match the source PNGs, the app
   reports this commit, and it survives a background / foreground cycle;
3. **publish**: the fingerprint gate again, a check that the commit is
   still the branch head (a re-run of an old run never rolls devices
   back), `eas update`, then `scripts/verify-ota.mjs`. All publishes and
   rollbacks to `preview` share one queue and are never cancelled midway.

- APKs are `assembleRelease` builds (JS bundle embedded, `expo-updates`
  active), signed with the Expo template's debug keystore so they can be
  sideloaded. Debug builds cannot receive OTA updates.
- Every APK sends `expo-channel-name: preview` (`app.json`
  `updates.requestHeaders`). The runtime version equals the app
  `version` (`runtimeVersion.policy: appVersion`), currently **0.2.1**.
  An update reaches an installed APK only if the runtimes match. Bump
  `version` whenever a change adds or alters native code that the JS
  relies on (a new native module, an SDK upgrade); icon, splash and
  display-name changes need a new APK but not a new runtime.
- **Native fingerprint gate.** `scripts/check-native-fingerprint.mjs`
  hashes the native layer with `@expo/fingerprint` (Android; ignoring the
  per-run `versionCode` / `extra.release` stamps and the version itself)
  and compares it with the hash recorded for app.json's `version` in
  `scripts/native-fingerprint.json`. CI and the OTA publish fail on a
  mismatch, so JS that needs native code the installed APKs lack is
  never published. For a native change: bump `version`, run
  `node scripts/check-native-fingerprint.mjs --record`, commit both and
  let `apk-build.yml` build the new runtime's APK (it prints the
  fingerprint in its log and release notes). `--record` refuses to
  overwrite the hash of an existing version.
- Keep every Expo package on the SDK's version (`npx expo install
  --check`). A mismatched native module compiles but fails at runtime:
  expo-audio's `expo-asset: "*"` peer dependency once pulled in SDK 55's
  expo-asset, and every asset download on device threw
  `NoSuchMethodError`. expo-asset is therefore pinned in `package.json`.
- An APK runs whichever is newer: its embedded bundle or the latest
  downloaded update. An OTA published *before* an APK was built is
  ignored by that APK, so publish a fresh OTA after every APK build.
- The app checks for an update on launch and applies it on the **next**
  launch. Settings → Build / Update Info → **Check for update** fetches
  and restarts immediately.
- After publishing, `scripts/verify-ota.mjs` asks the update server for
  the latest update exactly as an installed APK would (same runtime and
  channel) and fails the job unless the served update is the one just
  published, carrying the expected OTA sequence and commit.

### Rolling back an OTA

Publishing never deletes anything, and a rollback is itself a new
update (devices pick it up on their next launch, like any OTA).

1. Find the update group IDs: the "Record published update" summary of
   each OTA run, or `eas update:list --branch preview --platform android`.
2. Roll back with **Actions → OTA rollback → Run workflow**
   (`ota-rollback.yml`, same queue as publishing, then `verify-ota.mjs`):
   - `undo-latest` + the bad (latest) group: runs
     `eas update:rollback <group> --platform android --non-interactive`,
     which republishes the group published before it (or, if there is
     none, tells devices to run their embedded bundle);
   - `republish` + a known-good group: runs
     `eas update:republish --group <group> --platform android --message "..." --non-interactive`.
3. Locally the same commands work with `EXPO_TOKEN` set (eas-cli 24.9.0,
   the version CI pins). A republished update keeps the original's
   commit and OTA number in Build / Update Info.
4. Fix forward on the branch afterwards: the next push publishes again.

### What's running on a device

The main menu shows e.g. `v0.2.1 • Build 13 • Embedded`: the APK's
version and build number, plus the OTA sequence when a downloaded
update is running (or `Embedded` when the APK's own bundle is running).
Settings → **Build / Update Info** shows the full details: runtime,
channel, embedded-vs-OTA, update ID, source commit, publish time, and
what is actually drawn:

- **Texture files**: `11/11 resolved` (the PNGs are embedded in the JS
  bundle and decoded in JS, `src/util/textures.ts`).
- **Rendering**: per group (player, guards, vehicles, props, ground)
  whether its meshes use their texture or the flat fallback colour.
- **GPU textures**: texels read back from the GPU compared with the
  source PNGs (`src/util/renderAudit.ts`).

Tap a row for details; bug reports include the same lines.
All values come from the running build and update metadata
(`src/util/releaseInfo.ts`), never from hand-edited constants.

## Assets

Kenney CC0 models, textures and sound effects; Black Ops One font (SIL
OFL 1.1). Sources and licences: `assets/LICENSES.md`.

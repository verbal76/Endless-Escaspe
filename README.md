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

- Guards see in a cone. Tall props hide you only when they are
  **between** you and the guard; there is no omnidirectional hiding.
- Without line of sight, a guard's meter always decays. Noise (the ring
  around your feet) can alert a guard and send them investigating, but
  only sight escalates to a chase.
- Guards shoot only with a clear view and after a visible laser
  wind-up. Props stop bullets.
- Guards pursue where they last saw or heard you, never where you
  secretly are. From stage 6 they stop and scan before searching.
- Dogs are faster than walking and slower than sprinting, and give up
  after a short burst. Smoke makes them lose your scent; a crowbar
  scares them off.
- A full camera alarm dispatches a reinforcement guard.
- Pickups: crowbar (knock out a guard or scare a dog), smoke bomb (blocks
  sight), rock (throw it; guards investigate the noise).
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

Two GitHub Actions workflows ship the game. Each runs typecheck and the
unit tests first and refuses to publish on failure.

| Change | Workflow | Result |
| --- | --- | --- |
| Native: `package.json`, `app.json`, `app.config.js`, icons, splash, Gradle config | `apk-build.yml` | Release-variant APK, published as GitHub Release `build-N` |
| JS / assets only | `eas-update.yml` | EAS Update on channel `preview` (OTA sequence = run number) |

Both trigger on pushes to `claude/endless-escape-game-android-gRlFH`,
`Github-APK-Transition-Escap` and `claude/game-review-suggestions-cjxiqh`,
and can be run manually.

- APKs are `assembleRelease` builds (JS bundle embedded, `expo-updates`
  active), signed with the Expo template's debug keystore so they can be
  sideloaded. Debug builds cannot receive OTA updates.
- Every APK sends `expo-channel-name: preview` (`app.json`
  `updates.requestHeaders`). The runtime version equals the app
  `version` (`runtimeVersion.policy: appVersion`), currently **0.2.0**.
  An update reaches an installed APK only if the runtimes match. Bump
  `version` whenever a change adds or alters native code that the JS
  relies on (a new native module, an SDK upgrade); icon, splash and
  display-name changes need a new APK but not a new runtime.
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

### What's running on a device

The main menu shows e.g. `v0.2.0 • Build 12 • OTA 108`: the APK's
version and build number, plus the OTA sequence when a downloaded
update is running (or `Embedded` when the APK's own bundle is running).
Settings → **Build / Update Info** shows the full details: runtime,
channel, embedded-vs-OTA, update ID, source commit, publish time and
whether the game's textures loaded (`Textures: 11/11 loaded`; tap the
row for the reason if any failed).
All values come from the running build and update metadata
(`src/util/releaseInfo.ts`), never from hand-edited constants.

## Assets

Kenney CC0 models, textures and sound effects; Black Ops One font (SIL
OFL 1.1). Sources and licences: `assets/LICENSES.md`.

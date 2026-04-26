# Endless-Escaspe

An endless runner style escape game.

Android-only, built with Expo + React Native + three.js. Develops phone-only via
GitHub web; ships JS-only changes as OTA bundles via EAS Update, full APK
rebuilds via EAS Build.

## Stack

- Expo SDK 54, React Native 0.81, TypeScript
- Rendering: `three` + `expo-gl` + `expo-three`
- State: `zustand`
- Input: `react-native-gesture-handler` + `react-native-reanimated`
- Build/ship: EAS Build (APK) + EAS Update (OTA)

## One-time setup (do this once)

1. **Create the EAS project against your Expo account**
   - Open https://expo.dev → log in → Projects → "Create a project"
   - Slug: `endless-escaspe`
   - Copy the generated `projectId` (UUID)

2. **Paste the `projectId` into `app.json`**
   - File: `app.json`, two places — both currently say `REPLACE_ME`:
     - `expo.updates.url` → replace `REPLACE_ME` with the projectId
     - `expo.extra.eas.projectId` → replace `REPLACE_ME` with the projectId

3. **GitHub Secret**
   - Repo Settings → Secrets and variables → Actions
   - Name: `EAS` (already configured)
   - Value: an Expo access token from https://expo.dev → Account Settings → Access Tokens

4. **First APK build**
   - GitHub → Actions → "EAS Build (APK)" → Run workflow → profile `preview`
   - On first run EAS prompts for an Android keystore — accept the managed one
   - When the build finishes, download the APK from the link in the action log
     (or from the build page on expo.dev) and install it on your phone

## Daily workflow

- **JS-only change** (game logic, HUD, tuning): edit on the phone in GitHub
  web, commit to `claude/endless-escape-game-android-gRlFH`. The
  `eas-update.yml` workflow publishes an OTA bundle to the `preview` channel.
  Force-quit and reopen the app — the new bundle loads automatically.
- **Native change** (new native module, app.json native config, SDK upgrade):
  bump the `version` in `app.json` and trigger `eas-build.yml` manually for a
  new APK.

## Local development (optional)

You don't need a local machine to ship — but if you have one:

```
npm install
npx expo start --dev-client
```

Connect a device with the dev client APK installed and scan the QR.

## Project layout

```
src/
  game/        Loop, Renderer, CameraRig, Game.tsx (composition)
  systems/     Player, Procgen, GuardAI, Detection, Hide, Input
  scenes/      PrisonYard1 (factories for the v1 segment)
  components/HUD/
               Joystick, ActionButtons, Hearts, DetectionMarker, Banner
  state/       zustand store
  util/        rng (mulberry32), math, geometry constants, collision
  types/       shared world types
```

## v1 scope

- 1 prison yard segment (5 procgen chunks)
- 1 patrolling guard with per-guard detection meter
- 1 hide spot per chunk (cover prefab)
- 3 hearts per segment, restart-on-catch
- Win line at end of chunk 5

Out of scope (deferred): multi-segment, multiple yards, day/night cycle, hard
mode, audio polish, iOS, custom 3D art.

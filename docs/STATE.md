# Project state snapshot - Endless Escape (2026-10-03)

Machine-checkable facts (verified at commit 02e13eb):
- Repo: github.com/verbal76/Endless-Escaspe. Live/OTA branch: `claude/game-review-suggestions-cjxiqh`. Default branch `main` is
  198 commits behind and is NOT the release line. Draft PR #1 targets an older branch (claude/endless-escape-game-android-gRlFH).
- App: v0.2.1, runtime 0.2.1 (policy appVersion), channel `preview`. Installed APK on the owner's phone: Build 13 (debug-keystore
  signed, GitHub release). Frozen playtest candidate: OTA 131, update 01a0ff62-763b-726e-b85a-dae0a561ed37, group
  17844853-61b5-499c-bc61-3fb40e732812, source 02e13eb2bcee30265a7006afc5c323bccfa02f19, published 2026-10-03 01:30:38 UTC.
  Phone should show `v0.2.1 • Build 13 • OTA 131`.
- Stack: Expo SDK 54, React Native 0.81 (new arch), TypeScript strict, three.js 0.166 on expo-gl (no gl.canvas; never call
  renderer.resetState), zustand, AsyncStorage (keys `endless-escaspe:saves:v1`, `.bak`, `.unreadable`, `settings:v1`),
  expo-updates, expo-audio 1.1.1, expo-haptics.
- Quality gates at 02e13eb: `npx tsc --noEmit` clean; `npm test` 190/190 (node --test via tests/loader.mjs + tests/stubs);
  CI (ci.yml) green; same-commit emulator render+lifecycle check green; browser scenarios review 10/10, pack2 12/12,
  pack5 10/10 (scratch harness - being made durable on claude/hold-scenarios; originals in docs/evidence/scenarios-as-was/).

## Pipeline (see README.md in the repo root and docs/ci.md on claude/hold-ci-hardening)
push to live branch -> ci.yml (typecheck, tests, native fingerprint, Android bundle export) -> android-render-check.yml (release
APK on an x86_64 emulator: textures render, embedded commit matches, background/foreground survives) -> publish (re-checks
fingerprint + "still the newest publishable commit", `eas update --channel preview`) -> scripts/verify-ota.mjs confirms the
served update. Rollback: manual workflow `ota-rollback.yml`. A push changing only paths-ignored files
(tests/, docs/, scripts/, .github/, *.md, native config) does not publish.

## Known real-device unknowns
90/120 Hz smoothness, Endless section hitch, vibration feel, large system text, far-chunk culling pop, audio mixing/focus,
Android back, boot screen on slow phones, camera cutouts. None verified on a phone for OTA 131.

## Release-blocking items outstanding (not "production-ready")
Debug-key signing; unused microphone/activity permissions; worklets pin; nav bar; no crash monitoring; music provenance;
no store listing/privacy policy. See ledger/OPEN-ITEMS.md section 1 and docs/release/.

# Endless Escape: standing project rules (Hot Attic Games)

## Studio splash is mandatory
Every Hot Attic Games app opens with the Hot Attic Games studio card **before** the app's own title,
menu, onboarding or main interface. Cold launch only (never replayed on resume).

- The canonical artwork is **`Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png`** (repository root; owner-supplied,
  1536x1024 RGBA with real transparency). Use exactly this file. Never redraw, recreate, crop, stretch, recolour
  or substitute it.
- The old path `branding/Hot_Attic_Games_Master_Logo.png` is obsolete. Do not wait for it or reference it.
- Launch order: app start -> Hot Attic Games card -> the game's own opening -> normal play.
- Implementation here: `src/ui/StudioSplash.tsx`, `src/util/studioSplash.ts`, `src/ui/studioSplashSource.ts`, wired in
  `App.tsx` (~2.5 s with fades, whole logo contained, safe areas respected, startup runs behind it, cannot hang).
  `tests/studioSplash.test.ts` pins the file's git blob hash. Details: `docs/infra/studio-splash.md`.
- Do not remove the card, add a second studio splash, or reintroduce a "logo missing" hold.

## Public version convention
The public version is one sequential integer, **Endless Escape v<N>**, set in `release.json` and propagated to the GitHub
release title, the APK filename, About and Copy Diagnostics. See `docs/RELEASING.md`. Bump it once per delivered build; never
reuse a number. Git SHA, versionCode, runtime, OTA ids are technical metadata, not the version.

## Release hold
The live branch `claude/game-review-suggestions-cjxiqh` (OTA 131, runtime 0.2.1) is frozen until the owner lifts the hold:
no pushes, no OTAs. Native / next-version work happens on `claude/api36-native-qualification` (draft PR #7, do not merge).
Do not publish an OTA, release or production build automatically.

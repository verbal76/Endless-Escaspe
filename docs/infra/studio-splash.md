# E. Hot Attic Games opening studio splash

- Canonical asset: `branding/Hot_Attic_Games_Master_Logo.png` - **NOT FOUND (second, exhaustive search, 2026-10-03)**. Searched: the working tree; all 29 refs of this repository (every branch,
  tag and PR ref) by path and by content (every PNG blob in the object database, reachable and unreachable, with its dimensions: only the app's own icon / splash / UI / texture images exist - the
  1254x1254 `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png` are Endless Escape artwork, not the studio logo); git worktrees; the container filesystem (including the owner's earlier uploads in the
  session: phone screenshots and the settings-gear image); the studio site repo `verbal76/HotAtticGames.github.io` (README only); the public sibling repos Tartaria-RPG, Ragdoll-Rally, Axolotl, Idle-game,
  Manual-J, My-Personal-Crossow0rd, Cfm-calculator, Zombie-squisher (every branch, tree listing for branding paths); and the private template repo Personal-Assistant- (its only splash is its own microphone icon).
  Not searched: the other private repos (voiceforge, Spiroglyphics, Ocean-spore, Web_Auditor, Purgatory-Dungeon) - attaching private repositories for a speculative search was not authorized.
  Status: CANONICAL HOT ATTIC GAMES ASSET REQUIRES OWNER / PORTFOLIO MANAGER SUPPLY. No substitute was drawn or generated; the splash stays disabled.
- Implemented and tested without the asset: `src/ui/StudioSplash.tsx` (solid black `#000`, image centred, `resizeMode="contain"` = whole artwork, original aspect ratio,
  never cropped/distorted, ~1.5 s, silent, ends at once if the image fails to load so it cannot hang), `src/util/studioSplash.ts` (plan + clamp), wiring in `App.tsx`
  (shown once per process launch - not on resume or navigation; the existing boot keeps running underneath it; Game mounts only after splash + boot; offline-safe, no network).
  Startup order: native splash (#0b0d12, unchanged) -> studio card -> game boot screen -> title/menu. The launcher icon is untouched.
- Held switch: `src/ui/studioSplashSource.ts` exports `null` until the file exists; the one-line change to `require()` it is in that file's comment, and
  `tests/studioSplash.test.ts` fails if the file exists while the source is still `null` (or the reverse).
- OTA classification: the splash is JS + a bundled asset => OTA-SAFE once the asset is added (verified: it is an ordinary Metro asset). The native Android splash screen
  (app.json `splash`) is unchanged, so nothing native is required. If the owner later wants the studio card as the NATIVE splash, that is a native build.
- Verified (web harness with a throwaway placeholder PNG that is NOT in the repo): black background, centred, contained, ~1.5 s, game mounts afterwards. NOT verified on a
  device: cold-launch feel, white flash between native splash and the card, orientations/screen sizes.

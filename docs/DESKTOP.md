# Desktop build (Windows x86-64, Linux x86-64): architecture, saves, updates, packaging

## Layout
| Part | Where | Notes |
| --- | --- | --- |
| Game | `src/`, `App.tsx` | the one shared source; unchanged gameplay |
| Desktop input + prompts | `src/desktop/` | web / desktop only (`DesktopLayer.tsx`); `DesktopLayer.native.tsx` renders nothing on Android. Inventory: `docs/DESKTOP_INPUT.md` |
| Glyphs | `assets/glyphs/` (43 PNG, 220 KB) | licence: `assets/LICENSES.md`, `docs/GLYPH-LIBRARY.md`; the Android bundle contains none of them (verified in the exported bundle) |
| Shell | `desktop/` (`main.js`, `preload.js`, `lib.js`) | own `package.json` + lockfile (Electron 41.0.0 pinned); the root `package.json` and the Android native fingerprint are unaffected |
| Packaging | `scripts/desktop/package.mjs`, `scripts/desktop/smoke.mjs` | deterministic archives; the same script runs locally and in CI |
| Build + release | `.github/workflows/apk-build.yml` (manual / request-file only), `scripts/ci/assemble-release.mjs` | `docs/RELEASING.md` |

Build locally: `npm ci && npm ci --prefix desktop && node scripts/desktop/package.mjs --platform linux|windows --out dist-desktop --name "Endless Escape Build NN Linux"` (or `... EXE`).
`EXPO_NO_WEB_SETUP=1` is set by the script because `app.json` keeps `platforms: [android, ios]`.

## How the shell behaves
- Loads `app://game/` from the packaged web export (custom protocol, path-traversal-proof; SPA fallback). No server, no network: every request that is not `app:`, `data:` or `blob:` is cancelled.
- Renderer: context isolation, sandbox, no Node integration, no popups, navigation locked, DevTools only with `EE_DEBUG=1`.
- Window: 1280x800 default (min 640x400), remembers size and fullscreen. F11 / Alt+Enter toggle fullscreen, Ctrl+Q quits, holding Back / View for 2 s quits from a controller. Steam Deck Gaming Mode (`SteamDeck=1`) and `--fullscreen` start fullscreen. One instance per user.
- Linux launcher passes `--no-sandbox` (the Steam install cannot carry the setuid sandbox helper); this is acceptable because the renderer only ever loads local content and all navigation / network is blocked.
- No auto-updater: **SteamPipe is the intended desktop updater**; expo-updates is inert in the desktop build. There is no second update channel. OTA (`eas-update.yml`) remains Android-only and separately authorised.

## Save and update safety
- The game's own save layer (schema v2, backup, quarantine, migration) is unchanged; on desktop it persists in the app profile's web storage (per-user app-data directory).
- A device-local **mirror** (`<userData>/saves/mirror.json`, written with temp file + fsync + rename and a `.bak` of the previous good copy) is refreshed every 3 s and when the window hides or closes. It is restored **only** when the profile has no saves at all
  (fresh profile, cleared site data); an existing roster, even an older one, is never overwritten, and a snapshot without a roster never replaces a good mirror. Verified end to end by `scripts/desktop/smoke.mjs`
  (written, restored after wiping storage, newer save kept) and unit-tested in `desktop/test/lib.test.mjs`.
- Graphics / audio preferences are the game's existing local settings; nothing is synced. **No Steam Cloud** is implemented or claimed. The in-game save export / import remains available for moving saves between machines.
- Updating the package replaces the program files only; saves live outside the install directory.

## Steam integration points (not implemented, no credentials exist)
`window.desktop` (`preload.js`) is the single seam: Steamworks (for example via a native binding in `main.js`) would add Steam Input action sets, Cloud, achievements and the Steam overlay's on-screen keyboard behind it.
SteamPipe depots would be the extracted `Endless Escape` folders of the Linux and Windows archives. None of this was started: it needs Steamworks partner credentials and an app id (owner decision, `docs/STEAM_HARDWARE_CHECKLIST.md`).

## Known limitations
- Settings > About shows "Version unavailable / Build unavailable" on desktop (those values come from the Android native config); cosmetic, to be wired to the build manifest.
- The Windows package is unexecuted; both packages are unsigned (no code-signing certificate), so Windows SmartScreen may warn until the owner signs or ships through Steam.
- No GPU run: the Linux smoke test used the software renderer under xvfb.

## Licences shipped with the desktop package
Electron (MIT, `LICENSE`) and the Chromium / third-party notices it bundles (`LICENSES.chromium.html`) sit next to the executable, together with `THIRD_PARTY_NOTICES.md` (the game's JS dependency notices,
`docs/THIRD-PARTY-NOTICES.md`) and the glyph credit (`assets/LICENSES.md`). `react-dom`, `react-native-web` (MIT) are added to the web export by the desktop target; they are not yet listed in the generated
notices (which are computed from the Android bundle) - a desktop-bundle notices pass is a follow-up before a public Steam release.

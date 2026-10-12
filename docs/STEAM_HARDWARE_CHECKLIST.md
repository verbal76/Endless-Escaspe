# Steam Deck / Steam Machine checklist (project-specific)

Valve references (owner-supplied standard): https://partner.steamgames.com/doc/steamhardware/recommendations and https://partner.steamgames.com/doc/steamhardware/compat.
Valve Verified status is never claimed here. **No Windows or Linux build exists (F-03), so no Steam hardware test has been or could be performed.** Statuses: PASS / PARTIAL / FAIL / UNVERIFIED / BLOCKED / NOT APPLICABLE.

| Standard item | Status | Evidence / reason |
| --- | --- | --- |
| Platform: native Linux x86-64 + Windows x86-64 build | FAIL | none exists (`docs/PLATFORM_SUPPORT.md`) |
| 12.1 Complete controller functionality (launch, menus, gameplay, pause, save, exit; no mouse / keyboard) | FAIL | the game is touch-only: virtual joystick and on-screen buttons; no gamepad or keyboard handling in `src/` |
| Steam Input / default controller mapping | BLOCKED | needs a PC build and Steamworks (credentials not available) |
| 12.2 Automatic Steam on-screen keyboard | BLOCKED | the only text field is the save-import box (`SaveBackup.tsx`); no Steamworks; pending |
| 12.3 Mixed mouse + joystick camera input | NOT APPLICABLE | the camera uses touch look buttons; no mouse or joystick camera source |
| 12.4 Optional camera calibration (0.022 deg per pixel, 2.5x, about 6545 dots per 360 deg) | NOT APPLICABLE | no mouse-driven camera; established camera feel unchanged |
| 12.5 Display: 1280 x 800, 16:10, 16:9, ultrawide, responsive HUD, no clipped UI | PARTIAL | title screen rendered at 1280 x 800 and 1920 x 1080 in the web harness with no text outside the viewport and no page errors (2026-10-12). In-game HUD, handheld text size, ultrawide and a real device are unverified |
| 12.6 Graphics API (Vulkan preferred) | UNVERIFIED | Android uses OpenGL ES / WebGL via expo-gl; no Vulkan evaluation; a stable renderer is not rewritten to force Vulkan |
| 12.7 Portable codecs | PARTIAL | audio is MP3 / no video; not tested on Linux or Windows |
| 12.8 Per-device graphics settings (Automatic / Quality / Cool-Battery) | FAIL | no graphics modes exist; nothing is locked by hardware detection |
| 12.9 Offline single-player | PARTIAL | saves are local (AsyncStorage), update checks never block (`fallbackToCacheTimeout: 0`, cached bundle); no offline device or Steam-account test |
| 12.10 No external launcher | PASS (Android) | direct launch |
| 12.11 Performance measurements on Steam Deck | UNVERIFIED | none; no physical hardware, no measured FPS / thermals on any device in the repo |
| 12.12 Stability: cold launch, repeat, resume, focus, reconnect, clean exit | PARTIAL | Android emulator only: cold launch, restart, background / resume without crash (`android-render-check.sh`); suspend, controller reconnect and extended play unverified |
| Save compatibility between Deck / Machine / PC (Steam Cloud) | BLOCKED | save schema v2 with migration, backup and quarantine exists on Android; no Steam Cloud (no Steam target; credentials unavailable: pending, not complete) |
| Physical Steam Deck test | UNVERIFIED | not possible without a build |

Owner checklist when a PC build exists: launch with controller only; navigate every screen; enter text with the Steam keyboard; play 30 minutes; suspend / resume; offline launch; record FPS, frame time and battery at 1280 x 800.

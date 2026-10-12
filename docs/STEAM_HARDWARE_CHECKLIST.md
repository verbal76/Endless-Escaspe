# Steam Deck / Steam Machine checklist (project-specific)

Valve references (owner-supplied standard): https://partner.steamgames.com/doc/steamhardware/recommendations and https://partner.steamgames.com/doc/steamhardware/compat.
Valve Verified status is never claimed here. **No physical Steam Deck or Steam Machine test has been performed.** Everything marked "simulated" ran on a headless Linux machine
(Chromium / Electron under xvfb with a scripted standard-mapping gamepad); that shows the logic works, not that real hardware does. No Steamworks credentials, Steam Input
configuration, Steam Cloud or SteamPipe upload exist; none was created or faked. Statuses: PASS / PARTIAL / FAIL / UNVERIFIED / BLOCKED / NOT APPLICABLE.

| Standard item | Status | Evidence / reason |
| --- | --- | --- |
| Platform: native Linux x86-64 + Windows x86-64 build | PARTIAL | both packaged from the one source (`docs/PLATFORM_SUPPORT.md`); Linux launched under xvfb (smoke test); the Windows zip was never executed |
| 12.1 Complete controller functionality (launch, menus, gameplay, pause, save, exit; no mouse / keyboard) | PARTIAL (simulated) | scripted gamepad in Chromium: title, new-run name entry on the in-game keyboard, demo prompt, move / look / run / crouch, pause + Settings navigation (sliders, toggles), resume, hold-to-quit (`docs/DESKTOP_INPUT.md`); 12 unit tests. No physical controller or Deck |
| Steam Input / default controller mapping | BLOCKED | needs Steamworks and credentials. The game reads the standard Gamepad mapping, which Steam Input and the Deck present, so it works without a custom config in principle (unverified on hardware) |
| 12.2 Automatic Steam on-screen keyboard | PARTIAL / BLOCKED | the game's own on-screen keyboard (save name) is fully controller-operable (simulated); the Steam overlay keyboard needs Steamworks. The save-import text box needs a real keyboard or Steam's keyboard: UNVERIFIED |
| 12.3 Mixed mouse + joystick camera input | NOT APPLICABLE | the camera uses look buttons (keyboard Q / E, pad LB / RB or right stick: the same two fixed look angles); no free mouse camera |
| 12.4 Optional camera calibration (0.022 deg per pixel, 2.5x, about 6545 dots per 360 deg) | NOT APPLICABLE | no mouse-driven camera; established camera feel unchanged |
| 12.5 Display: 1280 x 800, 16:10, 16:9, ultrawide, responsive HUD, no clipped UI | PARTIAL (simulated) | title, in-run HUD and the pause / Settings panel inspected at 1280 x 800 in Chromium (readable, nothing clipped, prompt bar below the panel); title at 1920 x 1080 earlier. Handheld text size on the real 7" panel, ultrawide and 16:10 variants: UNVERIFIED |
| 12.6 Graphics API (Vulkan preferred) | UNVERIFIED | Electron / Chromium WebGL (ANGLE); Vulkan not evaluated or forced; the stable renderer is not rewritten |
| 12.7 Portable codecs | PARTIAL | audio is MP3 / no video; Chromium plays MP3 on both OSes. No audio device existed in the test environment, so output was not heard: UNVERIFIED |
| 12.8 Per-device graphics settings (Automatic / Quality / Cool-Battery) | FAIL | no graphics quality modes exist (only the weather toggle, local); adding them is a rendering feature, left for the owner (`docs/DESKTOP.md`). Nothing is locked by hardware detection |
| 12.9 Offline single-player | PARTIAL | the packaged Linux build starts and runs with every non-`app:` request blocked (smoke test); saves are local. No Steam-account offline test |
| 12.10 No external launcher | PARTIAL | direct launch of `./endless-escape.sh` / `EndlessEscape.exe`; Steam launch untested |
| 12.11 Performance measurements on Steam Deck | UNVERIFIED | none; the software renderer under xvfb says nothing about Deck frame pacing, thermals or battery |
| 12.12 Stability: cold launch, repeat, resume, focus, reconnect, clean exit | PARTIAL (simulated) | cold launch x3 on Linux; window blur, tab hide and controller disconnect release all held input (no stuck movement); reconnect re-arms. System suspend / resume and extended play: UNVERIFIED |
| Save compatibility between Deck / Machine / PC (Steam Cloud) | BLOCKED | local atomic mirror + the game's schema v2 / backup / quarantine exist and are tested; no Steam Cloud (credentials unavailable: pending, not complete) |
| Physical Steam Deck test | UNVERIFIED | not performed |

Owner checklist for the first hardware session (Steam Deck, then a Windows PC): launch with the controller only; navigate every screen; type a save name with the in-game and the Steam keyboard;
play 30 minutes; suspend / resume; offline launch; confirm F11 / Ctrl+Q / hold-Back; record FPS, frame time and battery at 1280 x 800; confirm the glyph style flips Xbox / Deck correctly (F2 override).

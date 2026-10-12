# Desktop input-action inventory

The Android touch HUD is the reference. The desktop layer (`src/desktop/`, web/desktop builds only; `DesktopLayer.native.tsx` is a no-op so none of it is in the
Android bundle) produces the **same** `input` fields and store actions the touch controls produce. No gameplay value, speed, dead zone or timing is changed.

| Action | Touch (Android, unchanged) | Keyboard | Gamepad (standard mapping) | Game effect |
| --- | --- | --- | --- | --- |
| Move | Virtual joystick | W A S D / arrows | Left stick (radial dead zone from `InputSystem`), D-pad fallback | `input.axisX` (right +), `input.axisY` (forward +) |
| Look left / right | Look buttons (+/-45 deg) | Q / E | Right stick X (analog), LB / RB | `input.viewYaw` |
| Run | Run toggle | Hold Shift | A or L3 (toggle) | `input.run` + `store.running` |
| Crouch / walk | Stance button | C | B | `input.stance` + `store.stance` |
| Crowbar / smoke / rock | Item buttons | 1 / 2 / 3 | X / Y / RT | one-shot flags, only when the inventory has the item |
| Pause / Settings | Gear button / Android back | Esc or P | Start | opens Settings (pauses) via the gear |
| Menu navigate | Touch | Arrows / WASD | D-pad / left stick (auto-repeat 380 ms then 110 ms) | spatial focus ring |
| Confirm / back | Touch / Android back | Enter, Space / Esc | A / B or Start | click focused control / `BackHandler` stack, else Modal close |
| Quit | n/a | Ctrl+Q (shell) | Hold Back/View 2 s | `window.desktop.quit()` (Electron shell) |
| Prompt style | n/a | F2 | on-screen chip | auto / xbox / playstation / switch / keyboard |

Safety rules: held input is released on window blur, `pagehide`, hidden visibility, controller disconnect and on every screen change; nothing moves the player while any
overlay (Settings, tutorial, How to Play, game modal) is open; menu mode never writes `input.axis*`.

Validation: `tests/desktopInput.test.ts` (pure logic, in `npm test`) and a simulated-gamepad browser run (Chromium, a scripted standard-mapping pad). That run is a
**simulation**, not physical controller or Steam Deck testing.

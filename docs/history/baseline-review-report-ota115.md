# Endless Escaspe — consolidated report (Build 13 baseline review)

## Identity
- Branch: claude/game-review-suggestions-cjxiqh — HEAD c3278a7 (CI-only commit, no OTA)
- APK: v0.2.1 • Build 13 (source 0defe73), runtime 0.2.1, channel preview — unchanged this phase (no native/config change needed)
- Latest OTA: 115 — update 01a0e6dd-f903-77b6-9454-1966f48759d5 — source dbeb84b
  - 114: 01a0e6c8-1ab2-764a-b5d7-eb369c5ffa04 (efd3582) · 113: 01a0e6a5-0a49-7925-be5f-454b108e7956 (c39edc5)
  - Each: typecheck + unit tests + verify step confirmed served for runtime 0.2.1 / preview. Delivery to the phone NOT yet confirmed.
- Game code on phone after OTA 115 = dbeb84b; c3278a7 only changes the CI script.

(see chat reply for full body)

## PLAYTEST HOLD (user, after 09:06 UTC) — target Build 13 / 0.2.1 / OTA 115 / dbeb84b
Render check run 10 (c3278a7, CI-only lifecycle gate), job 108831356622: CANCELLED by 90-min job timeout.
- APK built OK; emulator booted (50 s); app installed; launch 1 started 07:55:08.
- 07:56:38 "error: device 'emulator-5554' not found" / "- waiting for device -" -> adb hung until timeout 09:06.
- Emulator vanished ~90 s into launch 1, BEFORE the new lifecycle step. Lifecycle gate never executed; no result either way.
- Evidence: log above; artifact 10960098301 (268 bytes, launch1 captures empty).
- Same app code (dbeb84b) passed run 9 end to end. Not repaired / not re-run per hold.
- Possible follow-up (only when authorised): re-run once; bound adb calls with timeouts so a lost emulator fails fast.

## Staged during hold (NOT pushed): settings gear image — scratchpad/settings-gear.patch
- User-supplied gear -> assets/ui/settings-gear.png (144x144, alpha<8 haze cleared, centred, transparent bg + hole)
- Embedded as data URI (src/ui/iconData.ts via scripts/gen-ui-icons.mjs); SettingsScreen draws it at 36 dp (same button spot/size/hit area)
- tsc clean; npm test 89/89 (+3 uiIcons tests); web: menu + gameplay render, tap opens pause panel, no errors
- Ships with first post-playtest fix batch (will be an OTA on runtime 0.2.1).

## OTA 116 (authorised exception) — NEW PLAYTEST BASELINE: Build 13 / 0.2.1 / OTA 116 / c424b4b
- update 01a0efeb-3ebb-7ae2-9171-ef99fb80dc86, group 548daeaa-6423-46e0-a59b-6c0f3ff9a175, runtime 0.2.1, channel preview
- typecheck OK, unit tests OK, publish OK, verify step: "OK: runtime 0.2.1 / channel preview devices will receive update 01a0efeb-..."
- Content: COPY / SHARE INFO button (RN Share), shared info formatter. Gear still held.
- Render check run 11 (c424b4b): SUCCESS 01:37 UTC. RENDER CHECK OK (player, guards, vehicles, props, ground GPU-verified; display font loaded; problems []). LIFECYCLE CHECK OK (pid 5818 before and after HOME + relaunch). Artifact 11072472037. => Baseline Build 13 / 0.2.1 / OTA 116 / c424b4b ESTABLISHED.

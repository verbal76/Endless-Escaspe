# B. OTA architecture and C. "Please wait, applying update" (as implemented on this branch)

## Detected / preserved
Stack: Expo SDK 54 + `expo-updates` ~29.0.16. The OTA pipeline on the live branch is working and is PRESERVED unchanged
(eas-update.yml: validate -> same-commit emulator render check -> publish with `eas update --channel preview` -> verify-ota.mjs;
native-fingerprint gate blocks OTAs that need native code; manual ota-rollback.yml). Updates config (app.json): url https://u.expo.dev/<project>,
`enabled`, `checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`, request header `expo-channel-name: preview`, runtime policy `appVersion` (0.2.1).

## Boundary
OTA-SAFE: TypeScript/JS, bundled assets (images, audio, fonts, JSON). NATIVE-REQUIRED: permissions, package ID, native modules/versions, expo/RN
upgrade, app.json plugins, runtime version, signing. The fingerprint gate (scripts/check-native-fingerprint.mjs vs scripts/native-fingerprint.json)
enforces it in CI; an incompatible runtime is refused by expo-updates (runtimeVersion mismatch). `app.config.js` `extra` is fingerprint-neutral.

## Audit of the existing client (before this branch)
- Discovery: automatic at launch (ON_LOAD) - OK. Resume: none - GAP (an app kept in memory for days would not find a published update).
- Download/verify/stage/rollback: provided by expo-updates (asset + manifest hashing over HTTPS, staged download kept separate from the running
  update, crash-loop/emergency fallback to the embedded bundle surfaced as "Embedded (update failed)") - OK, preserved.
- Activation: a downloaded update only runs after the next cold start; the only in-app way to apply it was a manual button in Build / Update Info - GAP
  (the owner had to tap / restart). 
- Offline: `fallbackToCacheTimeout: 0` never blocks startup on the network; boot steps are time-bounded - OK.
- Code signing of manifests (expo-updates codeSigning): not configured. Not enabled here (it would be a native config change; candidate for the native batch).
- OTA hash/ID/sequence/commit/runtime/channel are recorded by CI (verify-ota.mjs, run summary) and shown by About.

## Implemented (this branch)
- `src/util/updateFlow.ts` (pure policy, unit-tested): phases idle / checking / downloading / staged / applying / failed. A downloaded + verified update
  is applied only at a SAFE POINT: no run in progress (`runState === 'idle'`), start screen on its home step (`store.menuIdle`), no dialog/tutorial/rules
  reference/settings/About open. One attempt per update id per session (a failed activation can never become a reload loop); a 20 s watchdog ends a stuck
  activation; a newer update is always eligible again.
- `src/components/HUD/UpdateApplying.tsx`: `UpdateApplier` (uses `Updates.useUpdates()`; mounted only when updates are enabled, i.e. never on web/dev) flushes
  settings + crash trail, then `Updates.reloadAsync()`. Throttled RESUME check (`shouldCheckOnResume`, >= 30 min, never while another stage is active) calls
  the existing `checkForNewUpdate()` (check + fetch). No aggressive polling. The manual CHECK FOR UPDATE button remains for diagnostics only.
- Saves/settings survive: settings autosave is flushed first; saves are written on every change by the saves layer.
- `UpdateApplyingOverlay`: standard message **"Please wait, applying update"** shown only while `store.updatePhase === 'applying'`, i.e. when activation is really
  starting - never for checking, background downloading, failed/incompatible downloads or no update. It uses the game's own panel (ui.panelSolid, gold border,
  Black Ops One title, spinner in the theme gold); indeterminate spinner (expo-updates exposes no activation progress, so no fake percentages); a full-screen
  Modal blocks interaction; Android back is ignored while it shows; it follows state (no fixed timer) and disappears when the reloaded app starts or when the watchdog /
  reload error moves the phase to `failed` (the app returns to the known-good version; About shows "Last update did not apply").
- Success transition: reload -> normal startup (studio splash if enabled, then the game's own boot) -> About shows the new OTA. Rollback/recovery: expo-updates emergency fallback + manual ota-rollback.yml.

## Tests
`tests/updateFlow.test.ts` (exact message; no apply for none/checking/downloading/disabled; unsafe points; exactly-once; no loop after failure; newer update retried;
resume throttle). Visual: browser harness (web build): overlay renders over the About panel and disappears on state change. NOT proven by unit tests: the real
expo-updates download/activation (native), reload behaviour on a phone, emergency fallback - PHYSICAL TEST REQUIRED (publish a trivial OTA after the freeze is released and
watch it apply on the main menu).

## How to identify the running OTA
Settings > About > Updates (OTA): running code, update id, OTA sequence, published time, source commit; menu line `v0.2.1 • Build 13 • OTA 131`.

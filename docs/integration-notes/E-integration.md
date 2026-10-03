# Audio review E: integration notes (call sites for Game.tsx and the UI)

The audio worktree branch (commits ba90a05, 13b7c67, 3d83c02 on top of 370a624) changes only the audio modules, App.tsx (audio mode) and store.ts (volume snapping).
Everything below still needs wiring by the owner of Game.tsx and the HUD. Line numbers refer to 370a624.
Nothing in this list is required for the build to compile: all existing call sites keep working unchanged.

## API summary (new or changed)

- `src/scenes/Sfx.ts`
  - New `SfxName`s: `stage_clear`, `coin`, `purchase`, `spotted`, `alarm` (plus the existing, previously unused `ui_tap`).
  - `playSfx(s, name, masterVolume, gain?, now?)` now returns a boolean. It applies the perceptual curve itself, so keep passing the raw `st.masterVolume`.
  - `sfx.play(name, gain?)` plays at the store's master volume (no volume argument needed).
  - `playUiSfx(name = 'ui_tap', gain?)` is for components with no Sfx handle. It plays on the live instance created by Game and is a no-op before Game mounts.
  - Built-in minimum intervals: `ui_tap` 60 ms, `coin` 45 ms, `spotted` 2 s, `alarm` 1.5 s, `stage_clear` 0.5 s. Callers do not need to throttle.
  - `sfx.dispose()` is idempotent.
- `src/scenes/Music.ts`
  - `MusicPlayer` is now `{ setVolume, setMix, dispose }`. The dead `pause`/`resume` were removed (no call sites).
  - Music handles AppState itself: it resumes on `active` and does no retries in the background.
  - `dispose()` removes the AppState subscription and the listeners, and is idempotent.
- `src/scenes/Siren.ts`
  - `SIREN_PLAY_THRESHOLD` is now 0.25 (exported) to match AlarmOverlay's visible threshold: it rounds to 0.1 and shows above 0.20, which means a raw value of 0.25 or more.
  - The siren fades in over 0.25 to 0.35, with a max level of 0.5 (was 0.85).
  - `updateSiren(s, detection, master, now?)` keeps the same call shape.
  - `SirenHandle.isPlaying` was removed. Game never read it.
  - `siren.dispose()` is idempotent.
- `src/util/haptics.ts`
  - New `haptics.crowbarHit()` (Heavy), `haptics.crowbarMiss()` (Light) and `haptics.alarm()` (Warning notification).
  - `haptics.caught()` is now a Heavy impact followed 110 ms later by an Error notification.
  - `setHapticsEnabled(on)` and `hapticsEnabled()` form a module-level gate. While it is off, every haptic is a no-op.

## Game.tsx wiring

1. **Catch haptic on the impact frame (E-10).** In `handleCatch`, right after `playSfx(sfx, cause === 'killed' ? 'hurt' : 'caught', st.masterVolume);` (line 1177), add:
   `if (remaining <= 0) haptics.caught(); else haptics.heartLost();`
   Then delete `haptics.caught();` in `resolveCatch` (line 1205) and `haptics.heartLost();` (line 1233). Those two fire 140 ms late, after the hit-stop.
2. **Crowbar hit vs miss (E-10).** In the crowbar branch (lines 1734-1739), replace `haptics.pickupUse();` (line 1734) with:
   `if (hit) haptics.crowbarHit(); else haptics.crowbarMiss();`
   `hit` is already computed above it. Leave the throw and smoke branches on `pickupUse`.
3. **Alarm full (E-6, E-10).** In the `alarmHot && !scene.alarmWasFull` block, inside `if (summonReinforcement(...))` (line 1914), replace `haptics.heartLost();` (line 1915) with:
   `haptics.alarm(); playSfx(sfx, 'alarm', st.masterVolume);`
   To sound the alarm even when no reinforcement can be summoned, put the `playSfx` just inside `if (alarmHot && !scene.alarmWasFull) {` instead.
4. **Stage clear (E-6).** In `handleWin`, next to `haptics.cleared();` (line 1403), add:
   `playSfx(sfx, 'stage_clear', st.masterVolume);`
   The boss-timer win also goes through handleWin, so it is covered.
5. **Spotted (E-6).** Fire on the rising edge of "any guard or dog in chase".
   - Near `let anyChase = false;` (about line 2134), keep a closure variable declared with the other per-GLView state, e.g. `let prevAnyChase = false;` next to `crowbarTarget` (line 302).
   - After the two `for` loops that compute `anyChase`, add:
     `if (anyChase && !prevAnyChase) playSfx(sfx, 'spotted', st.masterVolume); prevAnyChase = anyChase;`
   - Also reset it with `prevAnyChase = false;` in the non-playing branch (around line 1523, next to `crowbarTarget = null;`).
   - The 2 s cross-guard throttle is built into Sfx.
6. **Teardown (E-13).** Game never cleans up today. Hoist `music`, `sfx` and `siren` plus the store-subscription unsubscribe into refs, e.g.:
   - `const audioRef = useRef<{ music: MusicPlayer; sfx: Sfx; siren: SirenHandle; unsub: () => void } | null>(null);`
   - In `onContextCreate`, after line 328, assign `audioRef.current = { music, sfx, siren, unsub }`, where `unsub` is the return value of the `useStore.subscribe(...)` at line 326 (currently discarded with `void`).
   - Add to `Game()`:
     ```ts
     useEffect(() => () => {
       loopRef.current?.stop();
       const a = audioRef.current;
       a?.unsub(); a?.music.dispose(); a?.sfx.dispose(); a?.siren.dispose();
       audioRef.current = null;
     }, []);
     ```
     (`LoopHandle.stop()` exists in src/game/Loop.ts.)
7. **Volume plumbing needs no change.** Game keeps passing linear slider values (`st.masterVolume`, and `masterVolume * musicVolume` to `music.setVolume`). The squared curve is applied inside Music, Sfx and Siren.

## UI wiring

8. **UI taps (E-6).** `import { playUiSfx } from '../../scenes/Sfx'` and call `playUiSfx()` in the `onPress` of the shared button components.
   - Candidates: the buttons in `src/ui/theme.ts` (if there is a common Button), the GameModal actions, SettingsScreen, StartScreen and HowToPlay.
   - It is a no-op until Game has mounted, and it is throttled to 60 ms.
9. **Purchase / equip (E-6).** In `StartScreen.tsx` `onBuyOrEquip` (lines 349-366):
   - After a successful `purchaseOutfit`: `playUiSfx('purchase')`.
   - After an equip: `playUiSfx('ui_tap')`.
   - In the "Not enough coins" path, optionally `playUiSfx('aim_click')`.
10. **Coins earned (E-6).** In `Banner.tsx`, where the "Coins earned" StatRow appears (lines 156 and 179), call `playUiSfx('stage_clear')` (or `'coin'`) once when the row reveals. If the value counts up, call `playUiSfx('coin')` per tick; the built-in 45 ms throttle applies.
11. **Haptics toggle (E-11).**
    - Add `hapticsEnabled` to the Settings shape in `storage.ts` (default true, same pattern as `weatherEnabled`) and to the store.
    - In App.tsx `loadSettings().then(...)`, call `setHapticsEnabled(s.hapticsEnabled)`.
    - The pause-panel Toggle should call both the store setter and `setHapticsEnabled(v)`. Alternatively, subscribe once: `useStore.subscribe((st, p) => { if (st.hapticsEnabled !== p.hapticsEnabled) setHapticsEnabled(st.hapticsEnabled); })`.
    - Persist it with the other settings.

## Follow-ups not done (outside this file set)

- **Defaults.** With the squared curve, the default master 0.7 × music 0.5 now gives an effective music level of 0.1225 (it was 0.35, so about 9 dB quieter). The review called the old level loud. If it is now too quiet, raise the default `musicVolume` in store.ts (line 265) to about 0.6-0.7.
- **Persist on slider release (E-12).** SettingsScreen should persist the settings on slider release (debounced), not only when the panel closes.
- **Boot race (E-12).** App.tsx could add `loadSettings()` to the boot `Promise.all` so Game never starts music at the default level first. This was left out to keep the App.tsx edit to the audio mode only.
- **Cleanup in other files (E-13).**
  - AlarmOverlay.tsx:13: delete the stale comment "Visual stand-in for a siren until expo-audio is wired".
  - EventFlash.tsx: delete the empty `import {  } from '../../ui/theme'`.
- **Not added.** Dog bark and footstep sounds (E-6) were not added: there is no suitable CC0 Kenney source among the credited kits' files already in the repo.

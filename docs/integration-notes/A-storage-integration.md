# A-storage integration notes (A-3, A-4, A-7, A-10)

Base: origin/claude/game-review-suggestions-cjxiqh @ 133f35b. Storage-side commits: 3140ee2 (debug.ts), 1883673 (storage/economy/store/tests).
Line numbers below refer to that base. Nothing here is required for compilation: tsc and npm test pass without these edits.
Until they land, A-3 is only half done: the perk is stored, but nothing writes it yet.

New exports from `src/util/storage.ts`:
`hasOwn(obj, key)`, `getSave(saves, key)`, `isSaveKeyTaken(saves, key)`, `getSavesLoadReport()`, `getLastSavesWriteError()`, `parseSavesFull`, `SAVES_META_KEY`, `SAVES_SCHEMA_VERSION`.
Also: `Save.perkStages: number`, and `writeSaves` now returns `Promise<boolean>` and never rejects.

New export from `src/util/debug.ts`: `flushDebugLog(): Promise<void>`.

The store's `startRun` now takes `startRun(opts?: { perkStages?: number })`. It defaults to 0, so existing call sites are unchanged.

## A-3: boss perk persistence (Game.tsx, StartScreen.tsx)

Save semantics: `perkStages` is the number of perk stage-starts still owed at the save's resume point (`save.stage`), counted before that stage is charged.

### 1. StartScreen.tsx `beginRunForSave` (l.323-333)
Pass the save's perk into `startRun`:
```ts
startRun({ perkStages: s.perkStages });
```
This replaces the bare `startRun()` at l.332. Keep the other `startRun()` calls bare (new save, tutorial path, Endless/Daily), so they get 0.

Design choice: replays of a lower stage also get the perk. Replays never write it back (see 3), so a replay can't consume it.

### 2. Game.tsx fresh-transition block (l.1475-1478)
Charge the perk on a run started from the menu. In `if (lastRunState === 'idle') { perkChargedStage = -1; perkBonusThisStage = 0; }`, add after the two resets:
```ts
if (st.gameMode === 'campaign') grantStartingHearts(st.stage);
```
- With perk 0, this gives `startingHeartsFor(stage)`, the same as `startRun`. With perk > 0, it gives +1 heart and decays the perk once, as a mid-run stage start does.
- On re-entry from the menu, the stored (pre-charge) value is restored and charged again. A retry of the same stage therefore gets the same bonus, which matches "charged once per stage entered".

### 3. Game.tsx `handleWin` save write (l.1381-1399)
`after` is read after `grantBossPerk` and before `grantStartingHearts(N+1)`, so `after.perkRemainingStages` is already the pre-charge count for N+1. In the `updated` object, add:
```ts
perkStages: justClearedStage + 1 > existing.stage ? after.perkRemainingStages : existing.perkStages,
```
Write it only when the resume point strictly advances. A replay of a lower stage must not overwrite the saved perk.

### 4. Game.tsx final non-boss campaign death (l.1222, after `st.clearBossPerk()`)
The existing design says death ends the perk, so persist that:
```ts
const k = st.activeSaveName; const sv = getSave(st.saves, k);
if (k && sv && sv.perkStages > 0) { const u = { ...sv, perkStages: 0 }; st.upsertSave(u); writeSaves({ ...useStore.getState().saves, [k]: u }); }
```

## A-7: own-property lookups at call sites I don't own
Replace each of these with `getSave(map, key)`:
- Game.tsx l.970 `st.saves[st.activeSaveName]`, l.996 `st.saves[key]`, l.1308 `st.saves[key]` and l.1384 `after.saves[key]`.
- StartScreen.tsx l.223 `saves[profileKey]`, l.661 and l.708.

The real bug is StartScreen.tsx l.289-290. Replace it with:
```ts
if (isSaveKeyTaken(useStore.getState().saves, key)) {
```
This fixes "Constructor". It also blocks creating a save over an entry this build can't read, which `writeSaves` would otherwise replace (it logs a warning when that happens).

## A-10: surface recovery and failures to the player
### App.tsx l.45
Show a one-off notice after the boot load:
```ts
loadSaves().then((m) => {
  useStore.getState().setSaves(m);
  if (getSavesLoadReport().recovered) useStore.getState().showToast('Saves restored from backup', 'warn');
});
```

### Optional
- Write failures: the existing `writeSaves(...)` call sites can do `.then((ok) => { if (!ok) showToast("Couldn't save progress", 'warn') })`.
- BuildInfo.tsx l.32: `await flushDebugLog()` (together with the A-8 settings flush) before `reloadIntoUpdate()`.
- Crash-trail context: from App.tsx, `useStore.subscribe((s, p) => { if (s.runState !== p.runState) logDebug('log', `runState ${p.runState} -> ${s.runState}`) })`. debug.ts already logs AppState changes.

### Boot race (already handled)
A `writeSaves` issued before the first `loadSaves` resolves now merges the saves on disk. App's later `setSaves(m)` would still replace the store map without the early save; the disk is correct. To fix the store too, have `setSaves` merge when `activeSaveName` is set. That is store-owned, so I left it to the owner.

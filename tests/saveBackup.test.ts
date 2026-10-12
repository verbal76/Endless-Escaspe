// Saves backup glue: export from the stored roster, wipe, import back.
// Shows the transfer works across a fresh data sandbox (what a package-ID
// or signing-key change gives the new install) and never loses or
// downgrades existing local progress.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSaves, newSave, writeSaves, __resetSavesStateForTests, type SavesMap } from '../src/util/storage';
import { exportSavesText, importSavesText } from '../src/util/saveBackup';
import { useStore } from '../src/state/store';

const stub = AsyncStorage as unknown as { __reset(): void };
beforeEach(() => {
  stub.__reset();
  __resetSavesStateForTests();
});

function roster(): SavesMap {
  const m: SavesMap = Object.create(null);
  const a = { ...newSave('Maximilian', 'beige'), stage: 34, coins: 150, updatedAt: 2000, bestStars: { 1: 3, 2: 2 } };
  const b = { ...newSave('Zed', 'brown'), stage: 5, coins: 20, updatedAt: 1000 };
  m.maximilian = a;
  m.zed = b;
  return m;
}

test('saves backup: export, fresh install, import restores every character exactly', async () => {
  assert.equal(await writeSaves(roster()), true);
  await loadSaves();
  const out = await exportSavesText(5000);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.characters, 2);

  // New package / new key = empty sandbox.
  stub.__reset();
  __resetSavesStateForTests();
  const res = await importSavesText(out.text);
  assert.equal(res.ok, true);
  const back = await loadSaves();
  assert.deepEqual(Object.keys(back).sort(), ['maximilian', 'zed']);
  assert.equal(back.maximilian.stage, 34);
  assert.equal(back.maximilian.coins, 150);
  assert.deepEqual(back.maximilian.bestStars, { 1: 3, 2: 2 });
  assert.equal(Object.keys(useStore.getState().saves).length, 2);
});

test('saves backup: importing never deletes local characters or downgrades newer local progress', async () => {
  assert.equal(await writeSaves(roster()), true);
  await loadSaves();
  const out = await exportSavesText(5000);
  assert.ok(out.ok);
  if (!out.ok) return;

  // The device has since progressed further on Zed and has another character.
  const local = roster();
  local.zed = { ...local.zed, stage: 9, updatedAt: 3000 };
  local.newbie = newSave('Newbie', 'beige');
  stub.__reset();
  __resetSavesStateForTests();
  assert.equal(await writeSaves(local), true);
  await loadSaves();
  const res = await importSavesText(out.text);
  assert.ok(res.ok);
  const merged = await loadSaves();
  assert.deepEqual(Object.keys(merged).sort(), ['maximilian', 'newbie', 'zed']);
  assert.equal(merged.zed.stage, 9, 'higher local progress is kept');
  assert.equal(merged.maximilian.stage, 34, 'a character only in the export is added');
});

test('saves backup: damaged, foreign or empty text changes nothing', async () => {
  assert.equal(await writeSaves(roster()), true);
  await loadSaves();
  const before = JSON.stringify(await loadSaves());
  for (const bad of ['', 'not json', '{"app":"other"}', '{"app":"endless-escaspe","format":1}']) {
    const r = await importSavesText(bad);
    assert.equal(r.ok, false, bad);
  }
  const out = await exportSavesText(1);
  assert.ok(out.ok);
  if (out.ok) {
    const tampered = out.text.replace('"stage":34', '"stage":99');
    assert.equal((await importSavesText(tampered)).ok, false, 'checksum catches edits / truncation');
  }
  assert.equal(JSON.stringify(await loadSaves()), before);
});

test('saves backup: nothing to export is reported, not exported', async () => {
  const r = await exportSavesText(1);
  assert.equal(r.ok, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkFingerprint, main, recordFingerprint } from '../scripts/check-native-fingerprint.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

test('fingerprint gate: passes only when the hash recorded for the app version matches', () => {
  assert.equal(checkFingerprint({ version: '0.2.1', hash: A, recorded: { '0.2.1': A } }).ok, true);
  const changed = checkFingerprint({ version: '0.2.1', hash: B, recorded: { '0.2.1': A } });
  assert.equal(changed.ok, false);
  assert.match(changed.message, /NATIVE CHANGE/);
  assert.match(changed.message, /bump "version" in app\.json/);
  const unknown = checkFingerprint({ version: '0.3.0', hash: A, recorded: { '0.2.1': A } });
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /no native fingerprint recorded for app version 0\.3\.0/);
});

test('fingerprint record: adds new versions, never re-blesses a native change on a released one', () => {
  assert.deepEqual(recordFingerprint({ version: '0.3.0', hash: B, recorded: { '0.2.1': A } }), { '0.2.1': A, '0.3.0': B });
  assert.deepEqual(recordFingerprint({ version: '0.2.1', hash: A, recorded: { '0.2.1': A } }), { '0.2.1': A });
  assert.throws(() => recordFingerprint({ version: '0.2.1', hash: B, recorded: { '0.2.1': A } }), /refusing to overwrite/);
});

test('fingerprint CLI: check fails on mismatch, --print never fails, --record writes the file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fp-'));
  const appJson = path.join(dir, 'app.json');
  const recorded = path.join(dir, 'fp.json');
  writeFileSync(appJson, JSON.stringify({ expo: { version: '0.4.0' } }));
  writeFileSync(recorded, JSON.stringify({ '0.4.0': A }));
  const args = (...extra: string[]) => ['--app-json', appJson, '--recorded', recorded, ...extra];
  const quiet = async (fn: () => Promise<number>) => {
    const { log, error } = console;
    console.log = console.error = () => {};
    try {
      return await fn();
    } finally {
      Object.assign(console, { log, error });
    }
  };
  assert.equal(await quiet(() => main(args('--hash', A))), 0);
  assert.equal(await quiet(() => main(args('--hash', B))), 1);
  assert.equal(await quiet(() => main(args('--hash', B, '--print'))), 0);
  writeFileSync(appJson, JSON.stringify({ expo: { version: '0.5.0' } }));
  assert.equal(await quiet(() => main(args('--hash', B, '--record'))), 0);
  assert.deepEqual(JSON.parse(readFileSync(recorded, 'utf8')), { '0.4.0': A, '0.5.0': B });
});

test('the recorded fingerprint file has a well-formed hash for the current app version', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const version = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version;
  const recordedMap = JSON.parse(readFileSync(path.join(root, 'scripts/native-fingerprint.json'), 'utf8'));
  assert.match(String(recordedMap[version]), /^[0-9a-f]{40}$/, `record a fingerprint for app version ${version}`);
});

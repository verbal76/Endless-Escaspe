import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  formatDetailRows,
  formatInfoLines,
  formatMenuLine,
  formatVitalsText,
  parseSequence,
  parseSha,
  readReleaseExtra,
  resolveReleaseInfo,
  UNAVAILABLE,
  type ReleaseSources,
} from '../src/util/releaseInfo';

const SHA = '1acfd99e0b2c4d6e8f00112233445566778899aa';
const UPDATE_ID = '0f3c9a2e-7b1d-4e5f-9a8b-123456789abc';

// Manifest shape published by `eas update` (app config under
// extra.expoClient).
const otaManifest = (release: unknown) => ({
  id: UPDATE_ID,
  runtimeVersion: '0.2.0',
  extra: { expoClient: { name: 'Endless Escape', extra: { release, eas: { projectId: 'x' } } } },
});

const base: ReleaseSources = {
  appVersion: '0.2.0',
  buildNumber: '9',
  updatesEnabled: true,
  isEmbeddedLaunch: false,
  updateId: UPDATE_ID,
  runtimeVersion: '0.2.0',
  channel: 'preview',
  createdAt: new Date('2026-09-27T12:34:00Z'),
  manifest: otaManifest({ gitSha: SHA, otaSequence: 101 }),
};

test('OTA launch: menu shows version, native build and the OTA sequence', () => {
  const info = resolveReleaseInfo(base);
  assert.equal(info.source, 'ota');
  assert.equal(info.otaSequence, 101);
  assert.equal(info.gitSha, SHA);
  assert.equal(formatMenuLine(info), 'v0.2.0 • Build 9 • OTA 101');
  assert.equal(formatMenuLine({ ...info, otaSequence: 37 }), 'v0.2.0 • Build 9 • OTA 037');
});

test('embedded launch: never shows an OTA sequence, even if one is present', () => {
  const info = resolveReleaseInfo({
    ...base,
    isEmbeddedLaunch: true,
    manifest: otaManifest({ gitSha: SHA, otaSequence: 55 }),
  });
  assert.equal(info.source, 'embedded');
  assert.equal(info.otaSequence, null);
  assert.equal(formatMenuLine(info), 'v0.2.0 • Build 9 • Embedded');
  const running = formatDetailRows(info).find((r) => r.label === 'Running code');
  assert.equal(running?.value, 'Embedded in APK');
});

test('updates disabled (dev build / web): no update id or sequence is claimed', () => {
  const info = resolveReleaseInfo({ ...base, updatesEnabled: false });
  assert.equal(info.source, 'disabled');
  assert.equal(info.updateId, null);
  assert.equal(info.otaSequence, null);
  assert.match(formatMenuLine(info), /Updates off$/);
});

test('emergency launches are reported (and never claimed when updates are off)', () => {
  const normal = formatDetailRows(resolveReleaseInfo(base)).find((r) => r.label === 'Launch')!;
  assert.equal(normal.value, 'Normal');
  const em = resolveReleaseInfo({ ...base, isEmbeddedLaunch: true, isEmergencyLaunch: true, emergencyReason: 'update crashed on launch' });
  assert.equal(em.emergency, true);
  const row = formatDetailRows(em).find((r) => r.label === 'Launch')!;
  assert.match(row.value, /EMERGENCY/);
  assert.equal(row.full, 'update crashed on launch');
  const off = resolveReleaseInfo({ ...base, updatesEnabled: false, isEmergencyLaunch: true });
  assert.equal(off.emergency, false);
});

test('enabled but no update id is never reported as an OTA', () => {
  const info = resolveReleaseInfo({ ...base, updateId: null });
  assert.equal(info.source, 'disabled');
  assert.doesNotMatch(formatMenuLine(info), /OTA/);
});

test('missing metadata reads as Unavailable - never undefined / null / fake values', () => {
  const info = resolveReleaseInfo({
    appVersion: null,
    buildNumber: 'undefined',
    updatesEnabled: true,
    isEmbeddedLaunch: false,
    updateId: 'u-1',
    runtimeVersion: '',
    channel: null,
    createdAt: new Date('not a date'),
    manifest: { extra: {} },
  });
  const line = formatMenuLine(info);
  assert.doesNotMatch(line, /undefined|null|NaN/);
  assert.match(line, /Version unavailable/);
  assert.match(line, /Build unavailable/);
  for (const row of formatDetailRows(info)) {
    assert.doesNotMatch(row.value, /undefined|null|NaN|Invalid/, row.label);
  }
  const rows = Object.fromEntries(formatDetailRows(info).map((r) => [r.label, r.value]));
  assert.equal(rows['Update ID'], 'u-1');
  assert.equal(rows['Source commit'], UNAVAILABLE);
  assert.equal(rows['OTA sequence'], UNAVAILABLE);
  assert.equal(rows['Published'], UNAVAILABLE);
});

test('detail rows abbreviate long ids but keep the full value', () => {
  const rows = formatDetailRows(resolveReleaseInfo(base));
  const id = rows.find((r) => r.label === 'Update ID')!;
  const sha = rows.find((r) => r.label === 'Source commit')!;
  assert.equal(id.full, UPDATE_ID);
  assert.ok(id.value.length < UPDATE_ID.length && UPDATE_ID.startsWith(id.value));
  assert.equal(sha.full, SHA);
  assert.equal(sha.value, SHA.slice(0, 10));
  assert.equal(rows.find((r) => r.label === 'Channel')!.value, 'preview');
  assert.equal(rows.find((r) => r.label === 'Runtime')!.value, '0.2.0');
  assert.equal(rows.find((r) => r.label === 'Published')!.value, '2026-09-27 12:34 UTC');
});

test('release extra is found in every manifest shape and junk is rejected', () => {
  assert.deepEqual(readReleaseExtra(otaManifest({ otaSequence: 3 })), { otaSequence: 3 });
  assert.deepEqual(readReleaseExtra({ extra: { release: { gitSha: SHA } } }), { gitSha: SHA });
  assert.deepEqual(readReleaseExtra({ expoConfig: { extra: { release: { otaSequence: 4 } } } }), { otaSequence: 4 });
  assert.equal(readReleaseExtra(null), null);
  assert.equal(readReleaseExtra('x'), null);
  assert.equal(parseSha('not-a-sha'), null);
  assert.equal(parseSha(SHA.toUpperCase()), SHA);
  assert.equal(parseSequence('12'), 12);
  assert.equal(parseSequence(0), null);
  assert.equal(parseSequence(-3), null);
  assert.equal(parseSequence(1.5), null);
  assert.equal(parseSequence('12abc'), null);
});

test('app.config.js stamps CI metadata and is a no-op locally', () => {
  const require = createRequire(import.meta.url);
  const make = require('../app.config.js') as (a: { config: any }) => any;
  const appJson = require('../app.json').expo;
  const saved = { ...process.env };
  try {
    delete process.env.EE_BUILD_NUMBER;
    delete process.env.EE_GIT_SHA;
    delete process.env.EE_OTA_SEQUENCE;
    const local = make({ config: appJson });
    assert.deepEqual(local.extra.release, {});
    assert.equal(local.android.versionCode, undefined);
    assert.equal(local.updates.requestHeaders['expo-channel-name'], 'preview');
    assert.equal(local.runtimeVersion.policy, 'appVersion');

    process.env.EE_BUILD_NUMBER = '9';
    process.env.EE_GIT_SHA = SHA;
    process.env.EE_OTA_SEQUENCE = '101';
    const ci = make({ config: appJson });
    assert.equal(ci.android.versionCode, 9);
    assert.equal(ci.extra.release.gitSha, SHA);
    assert.equal(ci.extra.release.otaSequence, 101);
    assert.equal(ci.extra.eas.projectId, appJson.extra.eas.projectId);

    process.env.EE_BUILD_NUMBER = 'abc';
    process.env.EE_GIT_SHA = 'nope';
    process.env.EE_OTA_SEQUENCE = '';
    const junk = make({ config: appJson });
    assert.equal(junk.android.versionCode, undefined);
    assert.deepEqual(junk.extra.release, {});
  } finally {
    process.env = saved;
  }
});

test('embedded launch: source commit comes from the APK app config; OTA manifests still win for OTAs', () => {
  const embedded = resolveReleaseInfo({
    ...base,
    isEmbeddedLaunch: true,
    manifest: { id: 'x', commitTime: 1, assets: [] },
    embeddedAppConfig: { extra: { release: { gitSha: SHA } } },
  });
  assert.equal(embedded.gitSha, SHA.toLowerCase());
  const ota = resolveReleaseInfo({
    ...base,
    manifest: otaManifest({ gitSha: SHA, otaSequence: 7 }),
    embeddedAppConfig: { extra: { release: { gitSha: 'b'.repeat(40) } } },
  });
  assert.equal(ota.gitSha, SHA.toLowerCase());
});

test('menu line flags an emergency fallback; dev builds are not labelled as embedded', () => {
  const em = resolveReleaseInfo({ ...base, isEmbeddedLaunch: true, manifest: null, isEmergencyLaunch: true, emergencyReason: 'boom' });
  assert.equal(formatMenuLine(em), 'v0.2.0 • Build 9 • Embedded (update failed)');
  const dev = resolveReleaseInfo({ ...base, updatesEnabled: false, manifest: null });
  assert.equal(formatDetailRows(dev).find((r) => r.label === 'OTA sequence')?.value, 'Not applicable (updates off)');
});

test('vitals text carries every row with full values, the menu line, OS and capture time', () => {
  const rows = [
    { label: 'Version', value: '0.2.1' },
    { label: 'Update ID', value: '01a0e6dd-f903', full: '01a0e6dd-f903-77b6-9454-1966f48759d5' },
    { label: 'Texture files', value: '11/11 resolved', full: 'a: ok\nb: ok' },
  ];
  const text = formatVitalsText('v0.2.1 • Build 13 • OTA 115', rows, 'android 34', new Date('2026-09-30T01:02:03.456Z'));
  assert.equal(
    text,
    [
      'Endless Escape - Build / Update Info',
      'Captured: 2026-09-30 01:02:03 UTC',
      '',
      'v0.2.1 • Build 13 • OTA 115',
      'Version: 0.2.1',
      'Update ID: 01a0e6dd-f903-77b6-9454-1966f48759d5',
      'Texture files: 11/11 resolved',
      '  a: ok',
      '  b: ok',
      'OS: android 34',
    ].join('\n'),
  );
  // Bug reports use the same lines without the header; a details block
  // shared by two rows (Rendering / GPU textures) is written once.
  assert.deepEqual(formatInfoLines('m', rows.slice(0, 1), 'x'), ['m', 'Version: 0.2.1', 'OS: x']);
  const shared = 'player: ok\nground: ok';
  assert.deepEqual(
    formatInfoLines('m', [{ label: 'Rendering', value: 'OK', full: shared }, { label: 'GPU textures', value: '2/2 match', full: shared }], 'x'),
    ['m', 'Rendering: OK', '  player: ok', '  ground: ok', 'GPU textures: 2/2 match', 'OS: x'],
  );
});

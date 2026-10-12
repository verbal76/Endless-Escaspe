import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_REQUIRED_TARGET_SDK, buildAbout, formatAboutText, playCompliance, signingLabel, type AboutSources } from '../src/util/aboutInfo';
import { readBuildExtra, resolveReleaseInfo, type ReleaseSources } from '../src/util/releaseInfo';

const SHA = 'a'.repeat(40);
const relSrc = (p: Partial<ReleaseSources> = {}): ReleaseSources => ({
  appVersion: '0.2.1',
  buildNumber: '13',
  updatesEnabled: true,
  isEmbeddedLaunch: false,
  updateId: '01a0ff62-763b-726e-b85a-dae0a561ed37',
  runtimeVersion: '0.2.1',
  channel: 'preview',
  createdAt: new Date('2026-10-03T01:30:38Z'),
  manifest: { extra: { expoClient: { extra: { release: { gitSha: SHA, otaSequence: 131, targetSdk: 36, publicVersion: 13 } } } } },
  ...p,
});
const sources = (p: Partial<AboutSources> = {}): AboutSources => ({
  appName: 'Endless Escape',
  packageId: 'com.verbal76.endlessescaspe',
  release: resolveReleaseInfo(relSrc()),
  device: { platform: 'android', osVersion: '14', apiLevel: 34, model: 'Pixel 8', locale: 'en-US' },
  targetSdk: 36,
  signing: 'debug',
  buildType: 'release',
  updatePhase: 'idle',
  capturedAt: new Date('2026-10-03T12:00:00Z'),
  ...p,
});
const flat = (s: AboutSources) => Object.fromEntries(buildAbout(s).flatMap((sec) => sec.rows.map((r) => [`${sec.title}/${r.label}`, r.value])));

test('about: running OTA shows install, OTA, Play and device identity', () => {
  const f = flat(sources());
  assert.equal(f['Install/Package ID'], 'com.verbal76.endlessescaspe');
  assert.equal(f['Application/Product'], 'Endless Escape');
  assert.equal(f['Application/Version'], 'v13');
  assert.equal(f['Install/App version (technical)'], '0.2.1');
  assert.equal(f['Install/Native / runtime version'], '0.2.1');
  assert.equal(f['Install/Android build (versionCode)'], '13');
  assert.equal(f['Install/Source commit'], SHA);
  assert.equal(f['Install/Channel'], 'preview');
  assert.equal(f['Updates (OTA)/Running code'], 'Over-the-air update');
  assert.equal(f['Updates (OTA)/OTA sequence'], '131');
  assert.equal(f['Updates (OTA)/Update ID'], '01a0ff62-763b-726e-b85a-dae0a561ed37');
  assert.equal(f['Updates (OTA)/Published / created'], '2026-10-03 01:30 UTC');
  assert.equal(f['Google Play readiness/Target SDK (API)'], '36');
  assert.equal(f['Google Play readiness/Play API compliant'], 'YES');
  assert.equal(f['Google Play readiness/Signing'], 'Debug (not for release)');
  assert.equal(f['Device/Model'], 'Pixel 8');
  assert.equal(f['Device/Captured at'], '2026-10-03 12:00 UTC');
});

test('about: a build without the public version says so instead of guessing', () => {
  const f = flat(sources({ release: resolveReleaseInfo(relSrc({ manifest: { extra: { expoClient: { extra: { release: { gitSha: SHA } } } } } })) }));
  assert.match(f['Application/Version'], /^Unavailable/);
});

test('about: unknown values are labelled unavailable, never invented', () => {
  const f = flat(
    sources({
      release: resolveReleaseInfo(relSrc({ updatesEnabled: false, manifest: null, updateId: null, buildNumber: null })),
      targetSdk: null,
      signing: null,
      device: { platform: 'android', osVersion: null, apiLevel: null, model: null, locale: null },
    }),
  );
  assert.equal(f['Install/Android build (versionCode)'], 'Unavailable');
  assert.equal(f['Updates (OTA)/Updates enabled'], 'No');
  assert.match(f['Google Play readiness/Target SDK (API)'], /^Unavailable/);
  assert.equal(f['Google Play readiness/Play API compliant'], 'UNVERIFIED');
  assert.match(f['Google Play readiness/Signing'], /^Unavailable/);
  assert.equal(f['Device/API level'], 'Unavailable');
});

test('about: Play compliance compares the target SDK with the verified requirement', () => {
  assert.equal(PLAY_REQUIRED_TARGET_SDK, 36);
  assert.equal(playCompliance(36), 'YES');
  assert.equal(playCompliance(37), 'YES');
  assert.equal(playCompliance(35), 'NO');
  assert.equal(playCompliance(null), 'UNVERIFIED');
  assert.equal(playCompliance(35, 35), 'YES');
  assert.equal(signingLabel('production'), 'Production');
  assert.equal(signingLabel('upload'), 'Upload / Play');
});

test('about: emergency fallback is visible', () => {
  const rel = resolveReleaseInfo(relSrc({ isEmbeddedLaunch: true, isEmergencyLaunch: true, emergencyReason: 'bundle crashed' }));
  const f = flat(sources({ release: rel }));
  assert.equal(f['Updates (OTA)/Running code'], 'Embedded (update failed)');
  assert.equal(f['Updates (OTA)/Fallback reason'], 'bundle crashed');
});

test('about: copy text answers the diagnostic questions and carries no secrets', () => {
  const t = formatAboutText(sources({ updatePhase: 'staged' }), [{ label: 'Textures', value: '11/11' }]);
  for (const needle of [
    'com.verbal76.endlessescaspe',
    'Source commit: ' + SHA,
    'Android build (versionCode): 13',
    'Native / runtime version: 0.2.1',
    'Update ID: 01a0ff62-763b-726e-b85a-dae0a561ed37',
    'Channel: preview',
    'Target SDK (API): 36',
    'Play API compliant: YES',
    'Update status: Update ready',
    '[Technical]',
    'Textures: 11/11',
    'Captured at:',
  ]) assert.ok(t.includes(needle), needle);
  assert.ok(!/token|password|secret|keystore|private key/i.test(t));
});

test('about: build facts are read from the running manifest or the embedded config', () => {
  const m = { extra: { expoClient: { extra: { release: { targetSdk: 36, signing: 'debug' } } } } };
  assert.deepEqual(readBuildExtra(m), { targetSdk: 36, signing: 'debug' });
  assert.deepEqual(readBuildExtra(null, { expoConfig: { extra: { release: { targetSdk: '35' } } } }), { targetSdk: 35, signing: null });
  assert.deepEqual(readBuildExtra({}, undefined), { targetSdk: null, signing: null });
  assert.deepEqual(readBuildExtra({ extra: { release: { targetSdk: 'abc' } } }), { targetSdk: null, signing: null });
});

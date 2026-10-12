import test from 'node:test';
import assert from 'node:assert/strict';
import { isDocsOnly, changedFiles } from '../scripts/ci/classify-changes.mjs';
import { assertAncestor, normaliseRequest, requestFromEnv } from '../scripts/ci/resolve-build-request.mjs';
import { composeProvenance, verifyManifest } from '../scripts/ci/write-provenance.mjs';

const SHA = 'c30232d13b12662bd6646df639fd529a06e87174';

test('classify: docs-only means only docs/** and markdown; anything else (or nothing) runs the full tier', () => {
  assert.equal(isDocsOnly(['README.md', 'docs/a/b.png', 'docs/RELEASING.md', 'CLAUDE.md']), true);
  assert.equal(isDocsOnly(['docs/ACTIONS-BUDGET.md', 'src/game/Game.tsx']), false);
  assert.equal(isDocsOnly(['.github/workflows/ci.yml']), false);
  assert.equal(isDocsOnly(['release.json']), false);
  assert.equal(isDocsOnly(['tests/x.test.ts']), false);
  assert.equal(isDocsOnly([]), false, 'no files known = not provably docs-only');
  assert.equal(changedFiles('a', 'b', () => 'docs/x.md\n\nREADME.md\n').join(','), 'docs/x.md,README.md');
});

test('build request: full approved SHA, a build number, a buildable platform, a known destination and channel', () => {
  const ok = normaliseRequest({ sourceSha: SHA.toUpperCase(), platform: 'android', buildNumber: '15', destination: 'github_releases', channel: 'preview' });
  assert.deepEqual(ok, { sourceSha: SHA, platform: 'android', buildNumber: 15, destination: 'github_releases', channel: 'preview', id: '' });
  assert.throws(() => normaliseRequest({ sourceSha: 'c30232d', buildNumber: 15 }), /40-character/);
  assert.throws(() => normaliseRequest({ sourceSha: 'claude/api36-native-qualification', buildNumber: 15 }), /40-character/);
  assert.throws(() => normaliseRequest({ buildNumber: 15 }), /40-character/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA }), /buildNumber/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, buildNumber: 'v15' }), /buildNumber/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, buildNumber: 0 }), /buildNumber/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, buildNumber: 15, platform: 'mac' }), /unknown/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, buildNumber: 15, destination: 'steam' }), /not allowed/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, buildNumber: 15, channel: 'production' }), /not allowed/);
  assert.equal(normaliseRequest({ sourceSha: SHA, buildNumber: 15 }).destination, 'github_releases', 'default destination');
  assert.equal(normaliseRequest({ sourceSha: SHA, buildNumber: 15, destination: 'local_only' }).destination, 'local_only');
});

test('build request: windows / linux / all fail visibly (no such target), never a partial "complete" release', () => {
  for (const platform of ['windows', 'linux', 'all']) {
    assert.throws(() => normaliseRequest({ sourceSha: SHA, buildNumber: 15, platform }), /cannot be built: this repository has no Windows or Linux target/, platform);
  }
});

test('build request: a rebuild needs no new build number (local_only, same number, new request id)', () => {
  const a = normaliseRequest({ sourceSha: SHA, buildNumber: 15, id: 'first' });
  const b = normaliseRequest({ sourceSha: SHA, buildNumber: 15, id: 'rebuild-2', destination: 'local_only' });
  assert.equal(a.sourceSha, b.sourceSha);
  assert.equal(a.buildNumber, b.buildNumber);
  assert.notEqual(a.id, b.id);
  assert.equal(b.destination, 'local_only');
});

test('build request: the source must be in the branch history', () => {
  const git = (known: boolean, ancestor: boolean) => (args: string[]) => {
    if (args[0] === 'cat-file' && !known) throw new Error('missing');
    if (args[0] === 'merge-base' && !ancestor) throw new Error('not ancestor');
    return '';
  };
  assert.doesNotThrow(() => assertAncestor(SHA, 'HEAD', git(true, true)));
  assert.throws(() => assertAncestor(SHA, 'HEAD', git(false, true)), /does not exist/);
  assert.throws(() => assertAncestor(SHA, 'HEAD', git(true, false)), /not an ancestor/);
});

test('build request: read from dispatch inputs or from the request file', () => {
  const d = requestFromEnv({ GITHUB_EVENT_NAME: 'workflow_dispatch', IN_SOURCE_SHA: SHA, IN_PLATFORM: 'android', IN_BUILD_NUMBER: '15', IN_DESTINATION: 'github_releases', IN_CHANNEL: 'preview' });
  assert.equal(d.sourceSha, SHA);
  assert.equal(normaliseRequest(d).buildNumber, 15);
  const f = requestFromEnv({ GITHUB_EVENT_NAME: 'push' }, () => JSON.stringify({ sourceSha: SHA, id: 'x' }));
  assert.equal(f.sourceSha, SHA);
});

test('provenance: records source, version, platform, configuration, runtime and toolchain', () => {
  const p = composeProvenance({
    release: { productName: 'Endless Escape', publicVersion: 15 },
    platform: 'android',
    artifactName: 'Endless-Escape-v15.apk',
    sha256: 'ab'.repeat(32),
    sizeBytes: 74494946,
    sourceSha: SHA,
    requestCommit: 'f'.repeat(40),
    requestRef: 'claude/api36-native-qualification',
    packageId: 'com.verbal76.endlessescaspe',
    versionName: '0.3.0',
    versionCode: 16,
    signing: 'debug',
    channel: 'preview',
    timestamp: '2026-10-12T00:00:00.000Z',
    runId: '1',
    runUrl: 'https://example.invalid/run/1',
    fingerprint: 'b32bf103e9682e94fc5bdcd6f83cdf779058ac04',
    toolchain: { node: 'v22', agp: '8.11.0' },
  });
  assert.equal(p.source.sha, SHA);
  assert.equal(p.publicVersion, 15);
  assert.equal(p.buildNumber, 15, 'the manifest records the coordinated build number');
  assert.equal(p.platform, 'android');
  assert.equal(p.android.versionCode, 16);
  assert.equal(p.build.configuration, 'release');
  assert.equal(p.compatibility.runtime, '0.3.0');
  assert.equal(p.compatibility.nativeFingerprint, 'b32bf103e9682e94fc5bdcd6f83cdf779058ac04');
  assert.equal(p.toolchain.agp, '8.11.0');
});

test('manifest verification: the manifest must match the packaged file and the checksums file', () => {
  const sha = 'ab'.repeat(32);
  const manifest = { artifact: 'Endless-Escape-v15.apk', sizeBytes: 100, sha256: sha };
  const actual = { name: 'Endless-Escape-v15.apk', size: 100, sha256: sha };
  assert.deepEqual(verifyManifest(manifest, actual, `${sha}  Endless-Escape-v15.apk\n`), []);
  assert.match(verifyManifest({ ...manifest, sizeBytes: 99 }, actual).join(), /size/);
  assert.match(verifyManifest({ ...manifest, sha256: 'cd'.repeat(32) }, actual).join(), /sha256/);
  assert.match(verifyManifest({ ...manifest, artifact: 'other.apk' }, actual).join(), /names other\.apk/);
  assert.match(verifyManifest(manifest, actual, `${'cd'.repeat(32)}  Endless-Escape-v15.apk\n`).join(), /checksums\.sha256/);
  assert.match(verifyManifest(manifest, actual, '').join(), /checksums\.sha256/);
});

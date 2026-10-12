import test from 'node:test';
import assert from 'node:assert/strict';
import { isDocsOnly, changedFiles } from '../scripts/ci/classify-changes.mjs';
import { assertAncestor, normaliseRequest, requestFromEnv } from '../scripts/ci/resolve-build-request.mjs';
import { composeProvenance } from '../scripts/ci/write-provenance.mjs';

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

test('build request: must name the full approved SHA, a supported platform and channel', () => {
  const ok = normaliseRequest({ sourceSha: SHA.toUpperCase(), platform: 'android', channel: 'preview' });
  assert.deepEqual(ok, { sourceSha: SHA, platform: 'android', channel: 'preview', publishRelease: true, expectedVersion: null, id: '' });
  assert.throws(() => normaliseRequest({ sourceSha: 'c30232d' }), /40-character/);
  assert.throws(() => normaliseRequest({ sourceSha: 'claude/api36-native-qualification' }), /40-character/);
  assert.throws(() => normaliseRequest({}), /40-character/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, platform: 'windows' }), /not supported/);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, channel: 'production' }), /not allowed/);
  assert.equal(normaliseRequest({ sourceSha: SHA, publishRelease: 'false' }).publishRelease, false);
  assert.equal(normaliseRequest({ sourceSha: SHA, publishRelease: false }).publishRelease, false);
  assert.equal(normaliseRequest({ sourceSha: SHA, publishRelease: '' }).publishRelease, true);
  assert.equal(normaliseRequest({ sourceSha: SHA, expectedVersion: '15' }).expectedVersion, 15);
  assert.throws(() => normaliseRequest({ sourceSha: SHA, expectedVersion: 'v15' }), /positive integer/);
});

test('build request: a rebuild needs no version bump (same version, new request id)', () => {
  const a = normaliseRequest({ sourceSha: SHA, id: 'first' });
  const b = normaliseRequest({ sourceSha: SHA, id: 'rebuild-2', publishRelease: false });
  assert.equal(a.sourceSha, b.sourceSha);
  assert.notEqual(a.id, b.id);
  assert.equal(b.publishRelease, false);
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
  const d = requestFromEnv({ GITHUB_EVENT_NAME: 'workflow_dispatch', IN_SOURCE_SHA: SHA, IN_PLATFORM: 'android', IN_CHANNEL: 'preview', IN_PUBLISH_RELEASE: 'true', IN_EXPECTED_VERSION: '' });
  assert.equal(d.sourceSha, SHA);
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
  assert.equal(p.platform, 'android');
  assert.equal(p.android.versionCode, 16);
  assert.equal(p.build.configuration, 'release');
  assert.equal(p.compatibility.runtime, '0.3.0');
  assert.equal(p.compatibility.nativeFingerprint, 'b32bf103e9682e94fc5bdcd6f83cdf779058ac04');
  assert.equal(p.toolchain.agp, '8.11.0');
});

// Coordinated release bundle: names, manifest, checksums, all-or-nothing verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { artifactName, assemble, platformsFor, releaseTitle, verifyDir } from '../scripts/ci/assemble-release.mjs';

const SHA = 'a'.repeat(40);
const P = 'Endless Escape';

function stage(platforms: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ee-asm-'));
  const inDir = path.join(dir, 'in');
  mkdirSync(inDir);
  for (const p of platforms) writeFileSync(path.join(inDir, artifactName(P, 16, p)), `bytes-of-${p}`);
  writeFileSync(path.join(inDir, 'linux.details.json'), JSON.stringify({ electron: '41.0.0' }));
  return { dir, inDir, outDir: path.join(dir, 'out') };
}

test('names follow the owner standard', () => {
  assert.equal(releaseTitle(P, 16), 'Endless Escape Build 16');
  assert.equal(artifactName(P, 16, 'android'), 'Endless Escape Build 16 APK.apk');
  assert.equal(artifactName(P, 16, 'windows'), 'Endless Escape Build 16 EXE.zip');
  assert.equal(artifactName(P, 16, 'linux'), 'Endless Escape Build 16 Linux.tar.gz');
  assert.deepEqual(platformsFor('all'), ['android', 'windows', 'linux']);
  assert.throws(() => platformsFor('mac'));
});

test('a complete bundle assembles, hashes the final bytes and verifies', () => {
  const { dir, inDir, outDir } = stage(['android', 'windows', 'linux']);
  const m = assemble({ inDir, outDir, build: 16, sourceSha: SHA, platforms: ['android', 'windows', 'linux'], product: P, timestamp: 't' });
  assert.equal(m.schema, 2);
  assert.equal(m.title, 'Endless Escape Build 16');
  assert.equal(m.artifacts.length, 3);
  assert.deepEqual(m.artifacts.find((a: { platform: string }) => a.platform === 'linux').details, { electron: '41.0.0' });
  assert.deepEqual(verifyDir(outDir, ['android', 'windows', 'linux']), []);
  assert.match(readFileSync(path.join(outDir, 'checksums.sha256'), 'utf8'), /^[0-9a-f]{64} {2}Endless Escape Build 16 APK\.apk$/m);
  rmSync(dir, { recursive: true });
});

test('a missing platform is an error, never a partial release', () => {
  const { dir, inDir, outDir } = stage(['android', 'linux']);
  assert.throws(() => assemble({ inDir, outDir, build: 16, sourceSha: SHA, platforms: ['android', 'windows', 'linux'], product: P }), /missing artifact for windows/);
  rmSync(dir, { recursive: true });
});

test('verification catches tampering, wrong names, extra files and an incomplete platform set', () => {
  const { dir, inDir, outDir } = stage(['android', 'windows', 'linux']);
  assemble({ inDir, outDir, build: 16, sourceSha: SHA, platforms: ['android', 'windows', 'linux'], product: P });
  writeFileSync(path.join(outDir, artifactName(P, 16, 'windows')), 'tampered');
  assert.ok(verifyDir(outDir, ['android', 'windows', 'linux']).some((e: string) => /EXE\.zip.*(size|sha256)/.test(e)));
  writeFileSync(path.join(outDir, 'extra.bin'), 'x');
  assert.ok(verifyDir(outDir, ['android', 'windows', 'linux']).some((e: string) => /unexpected file/.test(e)));
  const one = stage(['android']);
  assemble({ inDir: one.inDir, outDir: one.outDir, build: 16, sourceSha: SHA, platforms: ['android'], product: P });
  assert.ok(verifyDir(one.outDir, ['android', 'windows', 'linux']).some((e: string) => /complete or it is not published/.test(e)));
  rmSync(dir, { recursive: true });
  rmSync(one.dir, { recursive: true });
});

test('a bad source sha is refused', () => {
  const { dir, inDir, outDir } = stage(['android']);
  assert.throws(() => assemble({ inDir, outDir, build: 16, sourceSha: 'abc', platforms: ['android'], product: P }), /40 hex/);
  rmSync(dir, { recursive: true });
});

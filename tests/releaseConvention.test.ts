import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const rel = JSON.parse(readFileSync('release.json', 'utf8'));
const wf = readFileSync('.github/workflows/apk-build.yml', 'utf8');

test('release.json: plain sequential public version, simple names', () => {
  assert.equal(Number.isInteger(rel.publicVersion), true);
  assert.ok(rel.publicVersion >= 15, 'v14 is build-15; the branch builds v15 or later');
  assert.match(rel.productName, /^[A-Za-z][A-Za-z ]+$/);
  assert.match(rel.fileSlug, /^[A-Za-z]+(-[A-Za-z]+)*$/);
  for (const bad of [/build/i, /candidate/i, /final/i, /api\d/i, /\bb\d+\b/i]) {
    assert.doesNotMatch(`${rel.productName} ${rel.fileSlug}`, bad);
  }
});

test('APK workflow derives title, filename and Latest from release.json', () => {
  assert.match(wf, /require\('\.\/release\.json'\)/);
  assert.match(wf, /\$\{PRODUCT\} Build \$\{PV\} APK\.apk/);
  assert.match(wf, /name: '\$\{\{ needs\.validate\.outputs\.product \}\} Build \$\{\{ needs\.resolve\.outputs\.build_number \}\}'/);
  assert.match(wf, /needs: \[resolve, validate, build, smoke-test, desktop\]/, 'the bundle (and so the release) needs the build, the emulator smoke test and the desktop jobs');
  assert.match(wf, /make_latest: true/);
  assert.match(wf, /Validate build-number uniqueness for the destination/);
  assert.doesNotMatch(wf, /name: 'APK build #/);
});

test('convention is documented', () => {
  assert.ok(existsSync('docs/RELEASING.md'));
  assert.match(readFileSync('docs/RELEASING.md', 'utf8'), /release\.json/);
});

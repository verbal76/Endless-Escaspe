// Package identity drift guards. The Android package ID is permanent once
// it reaches Google Play, so there must be ONE source of truth
// (app.json android.package) and the runtime must read the installed
// identity instead of hard-coding it. A future rename (see
// docs/infra/package-id.md) must change app.json and the CI scripts
// together; these tests fail on a half-done rename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const appJson = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo;
const PKG: string = appJson.android.package;
const ID_PATTERN = /\bcom\.(verbal76|hotatticgames)\.[a-z0-9_.]+/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

test('identity: app.json declares one well-formed Android package', () => {
  assert.match(PKG, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  assert.ok(PKG.startsWith('com.verbal76.') || PKG.startsWith('com.hotatticgames.'), PKG);
});

test('identity: the app source never hard-codes a package ID (the runtime reads the installed one)', () => {
  const hits = walk(resolve(root, 'src')).flatMap((f) => (readFileSync(f, 'utf8').match(ID_PATTERN) ?? []).map((m) => `${f}: ${m}`));
  assert.deepEqual(hits, []);
  const rt = readFileSync(resolve(root, 'src/util/releaseRuntime.ts'), 'utf8');
  assert.ok(rt.includes('Application.applicationId'), 'About / diagnostics read the package from the installed app');
});

test('identity: CI scripts that name the package agree with app.json', () => {
  const sh = readFileSync(resolve(root, 'scripts/ci/android-render-check.sh'), 'utf8');
  const m = sh.match(/^PKG=(\S+)/m);
  assert.ok(m, 'render check names the package');
  assert.equal(m![1], PKG, 'scripts/ci/android-render-check.sh PKG must match app.json android.package');
});

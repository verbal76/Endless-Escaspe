import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NON_PUBLISHING, isNonPublishing, touchesPublishedPaths, publishingFiles } from '../scripts/ci/publish-paths.mjs';
import { decideNewest, decideStandalone, GITHUB_DIFF_LIMIT } from '../scripts/ci/publish-gate.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

test('path classification: publishing vs non-publishing files', () => {
  for (const f of ['src/game/Game.tsx', 'App.tsx', 'assets/music/theme.mp3', 'assets/models/guard.png', 'index.ts', 'src/package.json', 'src/notes/README.txt', 'tsconfig.json']) {
    assert.equal(isNonPublishing(f), false, f);
  }
  for (const f of ['package.json', 'app.json', 'eas.json', 'assets/icon.png', '.github/workflows/ci.yml', 'scripts/ci/publish-gate.mjs', 'tests/ciGate.test.ts', 'docs/ci.md', 'README.md', 'src/deep/CHANGES.md', '.gitignore', 'android/app/build.gradle']) {
    assert.equal(isNonPublishing(f), true, f);
  }
  assert.deepEqual(publishingFiles(['docs/a.md', 'src/x.ts', 'tests/y.ts']), ['src/x.ts']);
  assert.equal(touchesPublishedPaths(['docs/a.md', 'tests/y.ts']), false);
});

test('newest-publishable decision (same rules as the old inline publish step)', () => {
  assert.equal(decideNewest({ sha: A, headSha: A, isAncestor: true, changedFiles: [] }).current, true);
  assert.equal(decideNewest({ sha: A, headSha: B, isAncestor: false, changedFiles: [] }).current, false);
  assert.equal(decideNewest({ sha: A, headSha: B, isAncestor: true, changedFiles: ['docs/x.md', 'tests/t.ts'] }).current, true);
  assert.equal(decideNewest({ sha: A, headSha: B, isAncestor: true, changedFiles: ['docs/x.md', 'src/game/Game.tsx'] }).current, false);
});

test('standalone ci decision: stands down only when eas-update.yml provably starts', () => {
  const before = A;
  assert.equal(decideStandalone({ before, changedFiles: ['src/a.ts'], listingFailed: false }).run, false);
  assert.equal(decideStandalone({ before, changedFiles: ['src/a.ts', 'tests/a.test.ts'], listingFailed: false }).run, false);
  assert.equal(decideStandalone({ before, changedFiles: ['tests/a.test.ts', 'docs/ci.md'], listingFailed: false }).run, true);
  // Fail safe: anything uncertain runs.
  assert.equal(decideStandalone({ before: '0'.repeat(40), changedFiles: ['src/a.ts'], listingFailed: false }).run, true);
  assert.equal(decideStandalone({ before: undefined, changedFiles: [], listingFailed: false }).run, true);
  assert.equal(decideStandalone({ before, changedFiles: ['src/a.ts'], listingFailed: true }).run, true);
  assert.equal(decideStandalone({ before, changedFiles: [], listingFailed: false }).run, true);
  const many = Array.from({ length: GITHUB_DIFF_LIMIT }, (_, i) => `src/f${i}.ts`);
  assert.equal(decideStandalone({ before, changedFiles: many, listingFailed: false }).run, true);
});

// The workflow's paths-ignore, the stand-down logic and the publishing
// branch must stay in sync; a drift would silently leave pushes
// unvalidated (or run duplicates), so it fails here instead.
const wf = (name: string) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', name), 'utf8');

function listAfter(text: string, header: RegExp): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => header.test(l));
  assert.ok(start >= 0, `missing ${header}`);
  const items: string[] = [];
  for (const l of lines.slice(start + 1)) {
    const m = l.match(/^\s+-\s+'?([^'#]+?)'?\s*(#.*)?$/);
    if (m) items.push(m[1]);
    else if (l.trim() && !l.trim().startsWith('#')) break;
  }
  return items;
}

test('eas-update.yml paths-ignore equals scripts/ci/publish-paths.mjs', () => {
  assert.deepEqual(listAfter(wf('eas-update.yml'), /^\s+paths-ignore:/), NON_PUBLISHING);
});

test('every workflow that stands down for a publishing push names the same publishing branch', () => {
  const branch = listAfter(wf('eas-update.yml'), /^\s+branches:/);
  assert.equal(branch.length, 1);
  assert.match(wf('ci.yml'), new RegExp(`github\\.ref == 'refs/heads/${branch[0]}'`));
  assert.match(wf('android-render-check.yml'), new RegExp(`github\\.ref == 'refs/heads/${branch[0]}'`));
  assert.deepEqual(listAfter(wf('android-render-check.yml'), /^\s+branches:/), branch);
});

test('ci.yml still runs on every non-publishing-branch push and on pull requests', () => {
  const ci = wf('ci.yml').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.match(ci, /^on:\n(?:.*\n)*?\s+pull_request:/m);
  assert.match(ci, /^\s+push:\s*$/m);
  assert.doesNotMatch(ci, /branches-ignore|paths-ignore/);
});

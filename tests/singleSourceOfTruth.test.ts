import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { compare, parseLsRemoteHeads, validateLedger } from '../scripts/ci/branch-inventory.mjs';
import { assertOnAuthoritativeLine } from '../scripts/ci/resolve-build-request.mjs';

const ledger = JSON.parse(readFileSync('docs/branch-ledger.json', 'utf8'));
const SHA = 'c30232d13b12662bd6646df639fd529a06e87174';

test('branch ledger: well formed, one authoritative branch, every entry classified with a disposition', () => {
  assert.deepEqual(validateLedger(ledger), []);
  assert.equal(ledger.authoritativeBranch, JSON.parse(readFileSync('release.json', 'utf8')).authoritativeBranch, 'release.json and the ledger agree on the authoritative line');
  // The known abandoned-looking branches are accounted for and never marked for deletion.
  const names = ledger.branches.map((b: { name: string }) => b.name);
  for (const n of ['main', 'Github-APK-Transition-Escap', 'claude/hold-scenarios', 'claude/hold-ci-hardening', 'claude/ledger-docs', 'claude/fix-apk-screen-issue-etmic']) assert.ok(names.includes(n), `${n} must be in the ledger`);
  assert.ok(ledger.branches.every((b: { disposition: string }) => !/(?<!never |not |don't )\b(?:delete|remove)\b/i.test(b.disposition)), 'a ledger disposition never proposes deleting a branch');
  // The human-readable ledger mentions every branch.
  const md = readFileSync('docs/BRANCH-LEDGER.md', 'utf8');
  for (const n of names) assert.ok(md.includes(n), `docs/BRANCH-LEDGER.md must mention ${n}`);
});

test('branch ledger: release provenance covers every release tag and records builds from non-authoritative branches', () => {
  const tags = ledger.releases.map((r: { tag: string }) => r.tag);
  for (const t of ['build-2', 'build-4', 'build-5', 'build-7', 'build-9', 'build-10', 'build-12', 'build-13', 'build-15', 'build-16']) assert.ok(tags.includes(t), t);
  const offLine = ledger.releases.filter((r: { builtIn: string }) => /only/.test(r.builtIn)).map((r: { tag: string }) => r.tag);
  assert.deepEqual(offLine, ['build-5', 'build-7']);
});

test('inventory: unaccounted remote branches are reported, ledger entries that vanished are noted', () => {
  const heads = parseLsRemoteHeads('aaa\trefs/heads/main\nbbb\trefs/heads/claude/new-agent-branch\nccc\trefs/tags/build-1\n');
  assert.deepEqual(heads, ['main', 'claude/new-agent-branch']);
  const r = compare(heads, ledger);
  assert.deepEqual(r.unaccounted, ['claude/new-agent-branch']);
  assert.ok(r.stale.includes('claude/ledger-docs'));
});

test('authoritative line: builds only from commits on the line (ancestor or descendant of its tip)', () => {
  const git = (anc: Record<string, boolean>, tipKnown = true) => (args: string[]) => {
    if (args[0] === 'rev-parse' && !tipKnown) throw new Error('no tip');
    if (args[0] === 'merge-base') {
      const key = `${args[2]}>${args[3]}`;
      if (!anc[key]) throw new Error('not ancestor');
    }
    return '';
  };
  const tip = 'origin/claude/game-review-suggestions-cjxiqh';
  assert.doesNotThrow(() => assertOnAuthoritativeLine(SHA, 'claude/game-review-suggestions-cjxiqh', git({ [`${tip}>${SHA}`]: true })), 'descends from the tip (workspace branch)');
  assert.doesNotThrow(() => assertOnAuthoritativeLine(SHA, 'claude/game-review-suggestions-cjxiqh', git({ [`${SHA}>${tip}`]: true })), 'already integrated (ancestor of the tip)');
  assert.throws(() => assertOnAuthoritativeLine(SHA, 'claude/game-review-suggestions-cjxiqh', git({})), /diverged or abandoned/, 'diverged line is refused');
  assert.throws(() => assertOnAuthoritativeLine(SHA, 'x', git({}, false)), /cannot find the authoritative branch/);
  assert.throws(() => assertOnAuthoritativeLine(SHA, '', git({})), /authoritativeBranch/);
});

test('tests cannot be silently skipped: no .skip / .only / .todo, and the whole suite is run', () => {
  const files = readdirSync('tests').filter((f) => f.endsWith('.test.ts'));
  assert.ok(files.length >= 45, `expected at least 45 test files, found ${files.length}`);
  for (const f of files) {
    if (f === 'singleSourceOfTruth.test.ts') continue; // this file names the patterns it forbids
    const src = readFileSync(`tests/${f}`, 'utf8');
    assert.doesNotMatch(src, /\b(?:test|it|describe)\.(?:skip|only|todo)\b|\{\s*(?:skip|todo|only)\s*:/, `${f} must not skip tests`);
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts.test, /tests\/\*\.test\.ts/, 'npm test must run every test file');
  assert.doesNotMatch(readFileSync('.github/workflows/ci.yml', 'utf8'), /continue-on-error|\|\| true/, 'CI steps cannot swallow failures');
});

test('one codebase, many targets: platform differences are isolated and documented', () => {
  assert.ok(existsSync('CLAUDE.md'));
  const c = readFileSync('CLAUDE.md', 'utf8');
  for (const phrase of [
    'Single source of truth',
    'Every change belongs to one authoritative product history',
    'Branches are temporary workspaces',
    'docs/branch-ledger.json',
    'one `sourceSha`',
  ]) assert.ok(c.includes(phrase), `CLAUDE.md must say: ${phrase}`);
  // Platform branching in app code stays in a few small, named files.
  const hits = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /Platform\.(OS|select)/.test(readFileSync(`src/${f}`, 'utf8')));
  assert.ok(hits.length <= 6, `platform-specific code should stay isolated (found in ${hits.length} files: ${hits.join(', ')})`);
});

test('platform and Steam documentation tells the truth about what exists', () => {
  const plat = readFileSync('docs/PLATFORM_SUPPORT.md', 'utf8');
  assert.match(plat, /Windows x86-64 \| \*\*Not supported/);
  assert.match(plat, /Linux x86-64 \| \*\*Not supported/);
  const steam = readFileSync('docs/STEAM_HARDWARE_CHECKLIST.md', 'utf8');
  assert.match(steam, /Valve Verified status is never claimed/);
  assert.match(steam, /No Windows or Linux build exists/);
  assert.doesNotMatch(steam, /\| PASS \|(?!.*Android)/, 'a Steam item may only PASS with evidence (the one PASS is the Android launcher check)');
  // The build workflow refuses targets that do not exist instead of faking a release.
  assert.match(readFileSync('scripts/ci/resolve-build-request.mjs', 'utf8'), /no Windows or Linux target/);
  assert.match(readFileSync('docs/COMPLIANCE-AUDIT.md', 'utf8'), /F-22[\s\S]*publishing workflows/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards the Actions-budget policy (docs/ACTIONS-BUDGET.md): fails if someone
// re-adds a trigger that burns shared GitHub-hosted minutes.
const wf = (n: string) => readFileSync(`.github/workflows/${n}.yml`, 'utf8');
const onBlock = (s: string) => s.slice(s.indexOf('\non:') + 1, s.indexOf('\npermissions:'));

test('ci.yml: no push trigger, no docs-only or draft-PR runs', () => {
  const s = wf('ci');
  const on = onBlock(s);
  assert.doesNotMatch(on, /^\s{2}push:/m, 'a push trigger validated PR branches twice');
  assert.match(on, /pull_request:/);
  assert.match(on, /ready_for_review/);
  assert.match(on, /'docs\/\*\*'/);
  assert.match(on, /'\*\*\/\*\.md'/);
  assert.match(on, /workflow_call:/, 'eas-update still validates through it');
  assert.match(s, /github\.event\.pull_request\.draft == false/);
});

test('apk-build.yml: builds only on a release.json (public version) change, no obsolete branches', () => {
  const on = onBlock(wf('apk-build'));
  assert.match(on, /paths:\s*\n\s*- 'release\.json'\s*\n/);
  for (const bad of ['package.json', 'app.json', 'app.config.js', 'babel.config.js', 'assets/', 'android/', 'endless-escape-game-android', 'Github-APK-Transition']) {
    assert.ok(!on.includes(bad), `apk-build must not trigger on ${bad}`);
  }
  assert.match(on, /workflow_dispatch:/);
});

test('android-render-check.yml: callable, never started by a push', () => {
  const on = onBlock(wf('android-render-check'));
  assert.doesNotMatch(on, /^\s{2}push:/m);
  assert.match(on, /workflow_call:/);
});

test('manual-only workflows stay manual', () => {
  for (const n of ['ota-rollback', 'production-build']) {
    const on = onBlock(wf(n));
    assert.doesNotMatch(on, /^\s{2}(push|pull_request|schedule):/m, `${n} must be manual-only`);
  }
});

test('a release.json (version bump) push does not publish an OTA', () => {
  assert.match(wf('eas-update'), /paths-ignore:[\s\S]*'release\.json'/);
});

test('release safety gates are still in place', () => {
  const eas = wf('eas-update');
  assert.match(eas, /check-native-fingerprint/);
  assert.match(eas, /verify-ota/);
  assert.match(eas, /android-render-check\.yml/, 'OTA keeps the same-commit emulator gate');
  const apk = wf('apk-build');
  assert.match(apk, /verify-apk\.sh/);
  assert.match(apk, /verify-apk-content\.sh/);
  assert.match(apk, /needs: \[build, smoke-test\]/);
});

test('the policy is recorded for future sessions', () => {
  assert.match(readFileSync('CLAUDE.md', 'utf8'), /GitHub Actions budget/);
  assert.match(readFileSync('docs/ACTIONS-BUDGET.md', 'utf8'), /Does this need GitHub Actions/);
});

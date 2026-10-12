import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// Guards the Actions-budget policy (docs/ACTIONS-BUDGET.md): "development
// validation is cheap, release validation is thorough, publishing is
// intentional". Static checks of the workflow files; hosted-runner behaviour is
// NOT proven by these (see the docs for what is verified where).
// Comments are stripped: the checks below are about what the workflow DOES.
const code = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
const wf = (n: string) => code(readFileSync(`.github/workflows/${n}.yml`, 'utf8'));
const onBlock = (s: string) => s.slice(s.indexOf('\non:') + 1, s.indexOf('\npermissions:'));

test('ci.yml: one run per PR revision, drafts get the cheap tier, docs-only never pends', () => {
  const s = wf('ci');
  const on = onBlock(s);
  assert.doesNotMatch(on, /^\s{2}push:/m, 'no push trigger: a PR branch push was validated twice');
  assert.match(on, /pull_request:/);
  assert.match(on, /ready_for_review/);
  assert.match(on, /workflow_call:/, 'eas-update still validates through it');
  // A path filter at the trigger level would leave a required check pending forever.
  assert.doesNotMatch(on, /paths(-ignore)?:/, 'skip heavy steps inside the job instead of filtering the trigger');
  // The job has no job-level `if`: it always runs and reports.
  assert.doesNotMatch(s, /^  check:\n(?:    .*\n)*?    if:/m);
  assert.match(s, /name: Typecheck, tests, native fingerprint, Android bundle/, 'stable check name');
  // Docs-only skips the heavy steps; drafts skip only the bundle export.
  assert.match(s, /classify-changes\.mjs "\$\{\{ github\.event\.before \|\| github\.event\.pull_request\.base\.sha \}\}"/, 'classify THIS push (before..head), not the whole PR');
  assert.match(s, /steps\.scope\.outputs\.docs_only != 'true'/);
  assert.match(s, /Android bundle export[\s\S]*github\.event\.pull_request\.draft == false/);
  // Typecheck + tests + fingerprint + config check run for drafts too.
  for (const step of ['npm run typecheck', 'npm test', 'check-native-fingerprint.mjs', 'check-workflows.py']) assert.ok(s.includes(step), step);
  // Obsolete-run cancellation only for PR checks, never an OTA validate stage.
  assert.match(s, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  // The cheap tier never starts expensive things.
  assert.doesNotMatch(s, /emulator|gradlew|assembleRelease|expo prebuild/);
});

test('apk-build.yml: a native build needs an explicit request naming the source SHA', () => {
  const s = wf('apk-build');
  const on = onBlock(s);
  const push = on.slice(on.indexOf('\n  push:'));
  assert.doesNotMatch(push, /release\.json/, 'a version bump must not start a native build');
  assert.match(push, /paths:\s*\n\s*- '\.github\/build-request\.json'\s*\n/);
  for (const bad of ['package.json', 'app.json', 'app.config.js', 'babel.config.js', 'assets/', 'android/', 'endless-escape-game-android', 'Github-APK-Transition']) {
    assert.ok(!push.includes(bad), `apk-build must not trigger on ${bad}`);
  }
  assert.match(on, /workflow_dispatch:\s*\n\s*inputs:/);
  for (const input of ['source_sha', 'platform', 'channel', 'publish_release', 'expected_version']) assert.match(on, new RegExp(`${input}:`));
  // Built from exactly the approved SHA, everywhere it matters.
  assert.match(s, /ref: \$\{\{ needs\.resolve\.outputs\.source_sha \}\}/);
  assert.match(s, /EE_GIT_SHA: \$\{\{ needs\.resolve\.outputs\.source_sha \}\}/);
  assert.match(s, /target_commitish: \$\{\{ needs\.resolve\.outputs\.source_sha \}\}/);
  assert.doesNotMatch(s, /EE_GIT_SHA: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(s, /target_commitish: \$\{\{ github\.sha \}\}/);
  // A release build is never cancelled by a newer request.
  assert.match(s, /group: apk-build\n\s+cancel-in-progress: false/);
  // A rebuild of a released version is artifact-only, and provenance is recorded.
  assert.match(s, /Decide whether this build may publish a release/);
  assert.match(s, /write-provenance\.mjs/);
  assert.match(s, /dist\/\*\.provenance\.json/);
});

test('android-render-check.yml: callable on an exact ref, never started by a push, release runs never cancelled', () => {
  const s = wf('android-render-check');
  const on = onBlock(s);
  assert.doesNotMatch(on, /^\s{2}push:/m);
  assert.match(on, /workflow_call:\s*\n\s*inputs:\s*\n\s*ref:/);
  assert.match(s, /ref: \$\{\{ inputs\.ref \|\| github\.sha \}\}/);
  assert.match(s, /cancel-in-progress: \$\{\{ github\.workflow == 'EAS Update \(OTA\)' \}\}/);
});

test('OTA and native builds are independent', () => {
  const eas = wf('eas-update');
  const ignore = eas.slice(eas.indexOf('paths-ignore:'), eas.indexOf('permissions:'));
  for (const p of ['release.json', 'package.json', 'app.json', '.github/**']) assert.ok(ignore.includes(`'${p}'`), `eas-update ignores ${p}`);
  // eas-update never calls the APK workflow, and the APK workflow never publishes OTAs.
  assert.doesNotMatch(eas, /apk-build\.yml/);
  assert.doesNotMatch(wf('apk-build'), /eas update|expo-github-action|EXPO_TOKEN/);
});

test('manual-only workflows stay manual', () => {
  for (const n of ['ota-rollback', 'production-build']) {
    const on = onBlock(wf(n));
    assert.doesNotMatch(on, /^\s{2}(push|pull_request|schedule):/m, `${n} must be manual-only`);
  }
});

test('release safety gates are still in place', () => {
  const eas = wf('eas-update');
  assert.match(eas, /check-native-fingerprint/);
  assert.match(eas, /verify-ota/);
  assert.match(eas, /android-render-check\.yml/, 'OTA keeps the same-commit emulator gate');
  const apk = wf('apk-build');
  assert.match(apk, /verify-apk\.sh/);
  assert.match(apk, /verify-apk-content\.sh/);
  assert.match(apk, /needs: \[resolve, build, smoke-test\]/);
  assert.match(apk, /Compare signing certificate with Build 13/);
});

test('an unrequested build request file is not committed by accident', () => {
  // The file is the build trigger: it exists only in the commit that requests a build.
  if (existsSync('.github/build-request.json')) {
    const r = JSON.parse(readFileSync('.github/build-request.json', 'utf8'));
    assert.match(String(r.sourceSha), /^[0-9a-f]{40}$/);
  }
});

test('the policy is recorded for future sessions', () => {
  assert.match(readFileSync('CLAUDE.md', 'utf8'), /GitHub Actions budget/);
  assert.match(readFileSync('CLAUDE.md', 'utf8'), /Development validation should be cheap, release validation should be thorough, and publishing must be intentional/);
  const d = readFileSync('docs/ACTIONS-BUDGET.md', 'utf8');
  assert.match(d, /Does this need GitHub Actions/);
  assert.match(d, /build-request\.json/);
});

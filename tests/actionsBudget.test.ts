import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

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
  // The studio standard's manual-workflow inputs.
  for (const input of ['platform', 'source_sha', 'build_number', 'destination', 'channel']) assert.match(on, new RegExp(`${input}:`));
  assert.match(on, /options: \[github_releases, local_only\]/);
  assert.match(on, /options: \[android, windows, linux, all\]/);
  // Built from exactly the approved SHA, everywhere it matters.
  assert.match(s, /ref: \$\{\{ needs\.resolve\.outputs\.source_sha \}\}/);
  assert.match(s, /EE_GIT_SHA: \$\{\{ needs\.resolve\.outputs\.source_sha \}\}/);
  assert.match(s, /target_commitish: \$\{\{ needs\.resolve\.outputs\.source_sha \}\}/);
  assert.doesNotMatch(s, /EE_GIT_SHA: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(s, /target_commitish: \$\{\{ github\.sha \}\}/);
  // A release build is never cancelled by a newer request.
  assert.match(s, /group: apk-build\n\s+cancel-in-progress: false/);
  // A rebuild of a released version is artifact-only, and provenance is recorded.
  assert.match(s, /Validate build-number uniqueness for the destination/);
  assert.match(s, /Check the build number/);
  assert.match(s, /write-provenance\.mjs --verify/, 'the manifest is verified against the packaged file');
  assert.match(s, /sha256sum -c checksums\.sha256/);
  // The release is one coordinated bundle (manifest + checksums + every platform artifact), verified before publishing.
  assert.match(s, /assemble-release\.mjs --in in --out bundle/);
  assert.match(s, /assemble-release\.mjs --verify dist --platforms android,windows,linux/);
  assert.match(s, /files: \|\n\s+dist\/\*/);
});

test('android-render-check.yml: callable on an exact ref, never started by a push, release runs never cancelled', () => {
  const s = wf('android-render-check');
  const on = onBlock(s);
  assert.doesNotMatch(on, /^\s{2}push:/m);
  assert.match(on, /workflow_call:\s*\n\s*inputs:\s*\n\s*ref:/);
  assert.match(s, /ref: \$\{\{ inputs\.ref \|\| github\.sha \}\}/);
  assert.match(s, /cancel-in-progress: \$\{\{ github\.workflow == 'EAS Update \(OTA\)' \}\}/);
});

test('OTA and native builds are independent; an OTA is request-based, never started by a push', () => {
  const eas = wf('eas-update');
  const on = onBlock(eas);
  assert.doesNotMatch(on, /^\s{2}(push|pull_request|schedule):/m, 'eas-update must not trigger on push, PR or schedule');
  assert.match(on, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*source_sha:/);
  assert.match(eas, /authorize:/);
  assert.match(eas, /source_sha \$SRC is not the commit this run is on/);
  assert.match(eas, /needs: \[authorize, validate, render-check\]/);
  // eas-update never calls the APK workflow, and the APK workflow never publishes OTAs.
  assert.doesNotMatch(eas, /apk-build\.yml/);
  assert.doesNotMatch(wf('apk-build'), /eas update|expo-github-action|EXPO_TOKEN/);
});

// Publishing-safety audit: every workflow that can publish (release, OTA, store / EAS build) and what starts it.
test('publishing audit: only explicit requests can publish anything', () => {
  const PUBLISH = /softprops\/action-gh-release|gh release (create|edit|upload)|eas update|eas build|eas submit|expo-github-action|r0adkll|upload-google-play|steamcmd|SteamPipe/;
  const WRITE = /contents: write/;
  const files = readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'));
  const capable: string[] = [];
  for (const f of files) {
    const s = code(readFileSync(`.github/workflows/${f}`, 'utf8'));
    if (!PUBLISH.test(s) && !WRITE.test(s)) continue;
    capable.push(f);
    const on = onBlock(s);
    assert.doesNotMatch(on, /^\s{2}(pull_request|schedule|release|create|workflow_run):/m, `${f}: a publishing workflow has no passive trigger`);
    if (/^\s{2}push:/m.test(on)) {
      // The one push path: a commit that changes the build request file (an auditable, explicit request).
      assert.equal(f, 'apk-build.yml');
      assert.match(on, /paths:\s*\n\s*- '\.github\/build-request\.json'/);
    }
  }
  assert.deepEqual(capable.sort(), ['apk-build.yml', 'eas-update.yml', 'ota-rollback.yml', 'production-build.yml']);
  // Nothing uploads to Steam or Google Play from CI.
  for (const f of files) assert.doesNotMatch(code(readFileSync(`.github/workflows/${f}`, 'utf8')), /steamcmd|SteamPipe|upload-google-play|eas submit|STEAM_|PLAY_STORE/i, `${f} has no store upload`);
  // Only the publish job of the coordinated build may hold contents: write.
  const apk = wf('apk-build');
  assert.equal((apk.match(/contents: write/g) || []).length, 1);
  assert.ok(apk.indexOf('contents: write') > apk.indexOf('  publish:'));
});

test('Android jobs that depend on the runner image are pinned (ubuntu-latest moves to 26.04 from 2026-10-19)', () => {
  assert.match(wf('android-render-check'), /runs-on: ubuntu-24\.04/);
  const apk = wf('apk-build');
  assert.match(apk.slice(apk.indexOf('  build:'), apk.indexOf('  smoke-test:')), /runs-on: ubuntu-24\.04/);
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
  assert.match(apk, /needs: \[resolve, validate, build, smoke-test, desktop\]/, 'the bundle needs every platform job and the emulator smoke test');
  assert.match(apk, /needs: \[resolve, validate, bundle\]/, 'publish needs only the verified bundle');
  assert.match(apk, /needs\.resolve\.outputs\.platform == 'all'/, 'a release is all-or-nothing');
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STUDIO_LOGO_PATH, STUDIO_SPLASH_MS, splashPlan } from '../src/util/studioSplash';

test('studio splash: ~1.5 s, only when the canonical image is bundled', () => {
  assert.equal(STUDIO_SPLASH_MS, 1500);
  assert.deepEqual(splashPlan(null), { show: false, durationMs: 0 });
  assert.deepEqual(splashPlan(undefined), { show: false, durationMs: 0 });
  assert.deepEqual(splashPlan(123), { show: true, durationMs: 1500 });
});

test('studio splash: duration is clamped to a short, sane range', () => {
  assert.equal(splashPlan(1, 100).durationMs, 500);
  assert.equal(splashPlan(1, 60000).durationMs, 2500);
  assert.equal(splashPlan(1, NaN).durationMs, 1500);
});

test('studio splash: the source file and the bundled asset agree (no substitute logo, no forgotten wiring)', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/ui/studioSplashSource.ts'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const assetExists = existsSync(resolve(process.cwd(), STUDIO_LOGO_PATH));
  if (assetExists) {
    assert.ok(code.includes("require('../../" + STUDIO_LOGO_PATH + "')"), 'canonical logo exists: STUDIO_SPLASH_SOURCE must require it');
  } else {
    assert.ok(/STUDIO_SPLASH_SOURCE: number \| null = null;/.test(code), 'no canonical logo in the repo: the splash stays off (never substitute artwork)');
  }
});

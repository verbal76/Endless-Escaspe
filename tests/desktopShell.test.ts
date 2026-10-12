// Desktop shell guard rails (static checks of desktop/*.js) + the shell's own pure-logic tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import '../desktop/test/lib.test.mjs';

const read = (p: string) => readFileSync(path.resolve(import.meta.dirname, '..', p), 'utf8');

test('Electron is pinned to an exact version in its own package (root package.json untouched by it)', () => {
  const d = JSON.parse(read('desktop/package.json'));
  assert.match(d.devDependencies.electron, /^\d+\.\d+\.\d+$/);
  const root = JSON.parse(read('package.json'));
  assert.equal(root.dependencies?.electron ?? root.devDependencies?.electron, undefined);
});

test('renderer is locked down: isolation, sandbox, no node, no navigation, no network', () => {
  const main = read('desktop/main.js');
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate/);
  assert.match(main, /onBeforeRequest/);
  assert.doesNotMatch(main, /autoUpdater|electron-updater|checkForUpdates/);
});

test('preload exposes only the fixed bridge', () => {
  const pre = read('desktop/preload.js');
  assert.match(pre, /exposeInMainWorld\('desktop'/);
  for (const k of ['isDesktop', 'platform', 'quit', 'toggleFullscreen']) assert.ok(pre.includes(k), k);
  assert.equal((pre.match(/exposeInMainWorld/g) || []).length, 1);
});

test('desktop code is excluded from the Android entry (native variant is a no-op)', () => {
  assert.match(read('src/desktop/DesktopLayer.native.tsx'), /return null/);
  assert.doesNotMatch(read('src/desktop/DesktopLayer.native.tsx'), /import .*(runtime|glyphAssets|DesktopPrompts)/);
});

test('app.json keeps the native platform list pinned (web deps must not change the native fingerprint)', () => {
  assert.deepEqual(JSON.parse(read('app.json')).expo.platforms, ['android', 'ios']);
});

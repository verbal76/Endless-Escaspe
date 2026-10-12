import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PERMISSIVE, packagesFromSources, render } from '../scripts/gen-third-party-notices.mjs';

test('notices generator: packages come from the bundle sources, scoped names kept, duplicates merged', () => {
  const pk = packagesFromSources([
    '/x/node_modules/react-native/Libraries/a.js',
    '/x/node_modules/react-native/Libraries/b.js',
    '/x/node_modules/@babel/runtime/helpers/c.js',
    '/x/node_modules/a/node_modules/nested-pkg/index.js',
    '/x/src/game/Game.tsx',
  ]);
  assert.deepEqual(pk.map((p: { name: string }) => p.name), ['@babel/runtime', 'nested-pkg', 'react-native']);
  assert.equal(pk[1].dir, 'node_modules/a/node_modules/nested-pkg', 'nested installs resolve to the innermost package');
});

test('notices generator: flags anything outside the permissive allow-list', () => {
  const md = render([
    { name: 'ok', version: '1.0.0', license: 'MIT', repo: '', text: 'MIT text' },
    { name: 'copyleft', version: '2.0.0', license: 'GPL-3.0', repo: '', text: null },
  ]);
  assert.match(md, /Not on the permissive allow-list:\*\* copyleft \(GPL-3\.0\)/);
  assert.match(md, /No licence file in the package/);
  assert.ok(PERMISSIVE.has('MIT') && !PERMISSIVE.has('GPL-3.0'));
});

test('docs/THIRD-PARTY-NOTICES.md: covers the core runtime packages, all permissive, no unknowns', () => {
  const md = readFileSync('docs/THIRD-PARTY-NOTICES.md', 'utf8');
  const rows = [...md.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({ name: m[1].trim(), license: m[3].trim() })).filter((r) => r.name !== 'Package' && !r.name.startsWith('---'));
  assert.ok(rows.length >= 30, `expected the bundle's package list, found ${rows.length}`);
  for (const core of ['react', 'react-native', 'three', 'zustand', 'expo', 'expo-updates']) assert.ok(rows.some((r) => r.name === core), `${core} must have a notice`);
  for (const r of rows) assert.ok(PERMISSIVE.has(r.license), `${r.name}: ${r.license} is not on the permissive allow-list: owner review required`);
  assert.doesNotMatch(md, /UNKNOWN/);
  // Every package has its licence text (or says it has none) so the notice obligation is met.
  assert.equal((md.match(/^## /gm) ?? []).length, rows.length);
});

test('asset licences: every asset family is documented, unconfirmed ones are flagged', () => {
  const a = readFileSync('assets/LICENSES.md', 'utf8');
  for (const family of ['BlackOpsOne', 'Kenney', 'sfx', 'music']) assert.ok(a.includes(family), family);
  assert.match(a, /Unconfirmed/, 'the music licence question stays visible until the owner confirms it');
});

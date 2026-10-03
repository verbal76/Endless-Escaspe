import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSave, parseSavesFull, SAVES_META_KEY } from '../src/util/storage';
import {
  buildExport,
  canonicalJson,
  checksumOf,
  cleanSettings,
  exportFileName,
  mergeImported,
  parseExport,
  pickSave,
  EXPORT_APP,
} from '../src/util/saveExport';

const NOW = Date.UTC(2026, 9, 3, 12, 30);

function file(entries: Record<string, unknown>): string {
  return JSON.stringify({ [SAVES_META_KEY]: { schemaVersion: 2, writtenBy: 2 }, ...entries });
}
const mk = (name: string, over: Record<string, unknown> = {}) => ({ ...newSave(name, 'beige'), updatedAt: 1000, ...over });

test('export -> parse round trip keeps every entry, including unreadable ones', () => {
  const raw = file({
    ana: mk('Ana', { stage: 5, coins: 120 }),
    ben: mk('Ben', { stage: 2 }),
    future: { name: 'Zed', skin: 'purple', stage: 9, extra: true },
  });
  const text = buildExport({ savesRaw: raw, settingsRaw: JSON.stringify({ masterVolume: 0.2, tutorialSeen: true, junk: 1 }), now: NOW });
  assert.ok(text);
  const r = parseExport(text!);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.envelope.app, EXPORT_APP);
  assert.equal(r.envelope.format, 1);
  assert.equal(r.envelope.exportedAt, NOW);
  assert.deepEqual(Object.keys(r.parsed.saves).sort(), ['ana', 'ben']);
  assert.equal(r.parsed.saves.ana.coins, 120);
  assert.deepEqual(Object.keys(r.parsed.passthrough), ['future']);
  assert.deepEqual(r.settings, { masterVolume: 0.2, tutorialSeen: true });
  // Pasting with whitespace / BOM still works.
  assert.equal(parseExport('﻿  ' + text + '\n').ok, true);
});

test('nothing to export: no file, unreadable file, empty roster', () => {
  assert.equal(buildExport({ savesRaw: null, settingsRaw: null, now: NOW }), null);
  assert.equal(buildExport({ savesRaw: '{not json', settingsRaw: null, now: NOW }), null);
  assert.equal(buildExport({ savesRaw: file({}), settingsRaw: null, now: NOW }), null);
  assert.equal(buildExport({ savesRaw: file({ ana: mk('Ana') }), settingsRaw: '{bad', now: NOW })?.includes('"settings":{}'), true);
});

test('strict validation rejects damaged, edited and foreign text', () => {
  const text = buildExport({ savesRaw: file({ ana: mk('Ana', { stage: 3 }) }), settingsRaw: null, now: NOW })!;
  const err = (s: string) => {
    const r = parseExport(s);
    return r.ok ? 'ok' : r.error;
  };
  assert.equal(err(text.slice(0, text.length - 5)), 'not-json');
  assert.equal(err(text.replace('"stage":3', '"stage":99')), 'bad-checksum');
  assert.equal(err(text.replace('"checksum":"', '"checksum":"0')), 'bad-checksum');
  assert.equal(err('[]'), 'not-an-export');
  assert.equal(err('"hi"'), 'not-an-export');
  assert.equal(err('{"app":"other-app","format":1}'), 'wrong-app');
  assert.equal(err('{"format":1}'), 'not-an-export');
  assert.equal(err(JSON.stringify({ ...JSON.parse(text), format: 2 })), 'newer-format');
  assert.equal(err(JSON.stringify({ ...JSON.parse(text), format: 0 })), 'bad-format');
  assert.equal(err(JSON.stringify({ ...JSON.parse(text), format: '1' })), 'bad-format');
  const noSaves = JSON.parse(text);
  delete noSaves.saves;
  assert.equal(err(JSON.stringify(noSaves)), 'bad-fields');
  assert.equal(err('x'.repeat(1_000_001)), 'too-large');
  // A correctly checksummed envelope with no characters is refused.
  const empty = buildExport({ savesRaw: file({ ana: mk('Ana') }), settingsRaw: null, now: NOW })!;
  const e = JSON.parse(empty);
  e.saves = { [SAVES_META_KEY]: { schemaVersion: 2 } };
  e.checksum = checksumOf(canonicalJson({ app: e.app, format: e.format, exportedAt: e.exportedAt, saves: e.saves, settings: e.settings }));
  assert.equal(err(JSON.stringify(e)), 'no-saves');
});

test('checksum is independent of key order and sensitive to content', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  assert.notEqual(checksumOf('abc'), checksumOf('abd'));
  assert.match(checksumOf('abc'), /^[0-9a-f]{14}$/);
  const text = buildExport({ savesRaw: file({ ana: mk('Ana') }), settingsRaw: null, now: NOW })!;
  const o = JSON.parse(text);
  const reordered = JSON.stringify({ checksum: o.checksum, settings: o.settings, saves: o.saves, exportedAt: o.exportedAt, format: o.format, app: o.app });
  assert.equal(parseExport(reordered).ok, true);
});

test('hostile keys cannot pollute prototypes', () => {
  const text = buildExport({ savesRaw: file({ ana: mk('Ana') }), settingsRaw: null, now: NOW })!;
  const o = JSON.parse(text);
  o.saves = JSON.parse('{"__proto__":{"name":"Evil","skin":"beige","stage":9},"constructor":{"name":"Constructor","skin":"brown","stage":1}}');
  o.checksum = checksumOf(canonicalJson({ app: o.app, format: o.format, exportedAt: o.exportedAt, saves: o.saves, settings: o.settings }));
  const r = parseExport(JSON.stringify(o));
  assert.equal(r.ok, true);
  assert.equal(({} as any).name, undefined);
  assert.equal(({} as any).stage, undefined);
});

test('pickSave: higher stage, then newer updatedAt, ties keep local', () => {
  const a = mk('A', { stage: 3, updatedAt: 500 });
  assert.deepEqual(pickSave(a, mk('A', { stage: 4, updatedAt: 1 })), { winner: 'incoming', reason: 'imported-higher-stage' });
  assert.deepEqual(pickSave(a, mk('A', { stage: 2, updatedAt: 9999 })), { winner: 'local', reason: 'local-higher-stage' });
  assert.deepEqual(pickSave(a, mk('A', { stage: 3, updatedAt: 501 })), { winner: 'incoming', reason: 'imported-newer' });
  assert.deepEqual(pickSave(a, mk('A', { stage: 3, updatedAt: 499 })), { winner: 'local', reason: 'local-newer' });
  assert.deepEqual(pickSave(a, mk('A', { stage: 3, updatedAt: 500 })), { winner: 'local', reason: 'tie-kept-local' });
});

test('merge never deletes local data and never replaces newer with older', () => {
  const local = parseSavesFull(
    file({
      ana: mk('Ana', { stage: 6, coins: 10, updatedAt: 5000 }),
      cy: mk('Cy', { stage: 1, updatedAt: 100 }),
      only: mk('OnlyLocal', { stage: 2 }),
      keepme: { name: 'Locked', skin: 'ufo', stage: 1 },
    }),
  )!;
  const incoming = parseSavesFull(
    file({
      ana: mk('Ana', { stage: 4, coins: 999, updatedAt: 9000 }), // older progress, newer clock
      cy: mk('Cy', { stage: 3, updatedAt: 50 }), // more progress
      neu: mk('Newcomer', { stage: 2 }),
      keepme: { name: 'Locked2', skin: 'ufo', stage: 7 },
      future: { name: 'Fut', skin: 'ufo', stage: 2 },
    }),
  )!;
  const r = mergeImported(local, incoming, null, {});
  // Local keys all survive.
  for (const k of Object.keys(local.saves)) assert.ok(k in r.saves, k);
  for (const k of Object.keys(local.passthrough)) assert.ok(k in r.passthrough, k);
  assert.equal(r.saves.ana.stage, 6);
  assert.equal(r.saves.ana.coins, 10);
  assert.equal(r.saves.cy.stage, 3);
  assert.ok('newcomer' in r.saves);
  // Local unreadable entry is not replaced by the imported one of the same key.
  assert.equal((r.passthrough.keepme as any).name, 'Locked');
  assert.ok('future' in r.passthrough);
  const byKey = Object.fromEntries(r.decisions.map((d) => [d.key, d]));
  assert.deepEqual(byKey.ana, { key: 'ana', action: 'kept-local', reason: 'local-higher-stage' });
  assert.deepEqual(byKey.cy, { key: 'cy', action: 'took-imported', reason: 'imported-higher-stage' });
  assert.deepEqual(byKey.newcomer, { key: 'newcomer', action: 'added', reason: 'new' });
});

test('merge into an empty device takes everything; importing twice changes nothing', () => {
  const incoming = parseSavesFull(file({ ana: mk('Ana', { stage: 4 }), ben: mk('Ben') }))!;
  const first = mergeImported(null, incoming, null, { masterVolume: 0.3 });
  assert.deepEqual(Object.keys(first.saves).sort(), ['ana', 'ben']);
  assert.deepEqual(first.settings, { masterVolume: 0.3 });
  const again = mergeImported({ ...incoming, saves: first.saves, passthrough: first.passthrough }, incoming, first.settings, { masterVolume: 0.3 });
  assert.deepEqual(again.saves, first.saves);
  assert.ok(again.decisions.every((d) => d.action === 'kept-local' && d.reason === 'tie-kept-local'));
});

test('settings merge: local wins, sticky flags OR, whitelist and clamping', () => {
  const r = mergeImported(null, parseSavesFull(file({ ana: mk('Ana') }))!, { masterVolume: 0.9, tutorialSeen: false, weatherEnabled: false }, { masterVolume: 0.1, tutorialSeen: true, hapticsEnabled: false });
  assert.deepEqual(r.settings, { masterVolume: 0.9, tutorialSeen: true, weatherEnabled: false, hapticsEnabled: false });
  assert.deepEqual(cleanSettings({ masterVolume: 7, musicVolume: -2, weatherEnabled: 'yes', bossModeUnlocked: true, evil: 1 }), { masterVolume: 1, musicVolume: 0, bossModeUnlocked: true });
  assert.deepEqual(cleanSettings(null), {});
  assert.deepEqual(cleanSettings([1]), {});
});

test('export file name is stable and sortable', () => {
  assert.equal(exportFileName(NOW), 'endless-escape-saves-20261003-1230.json');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveAppPath, mimeFor, writeAtomic, readWithFallback, SaveMirror, SAVE_KEY } = require('../lib.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ee-desktop-'));

test('app:// paths resolve inside the web root only', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'index.html'), 'x');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'a.png'), 'x');
  assert.equal(resolveAppPath(root, 'app://game/'), path.join(root, 'index.html'));
  assert.equal(resolveAppPath(root, 'app://game/assets/a.png'), path.join(root, 'assets', 'a.png'));
  assert.equal(resolveAppPath(root, 'app://game/some/route'), path.join(root, 'index.html'));
  assert.equal(resolveAppPath(root, 'app://game/missing.png'), null);
  assert.equal(resolveAppPath(root, 'app://game/..%2f..%2fetc/passwd'), null);
  // the URL parser collapses dot segments, so this stays inside the root (SPA fallback), never /etc
  assert.equal(resolveAppPath(root, 'app://game/%2e%2e/%2e%2e/etc/passwd'), path.join(root, 'index.html'));
  assert.equal(resolveAppPath(root, 'app://game/a%00.png'), null);
});

test('mime types cover the export', () => {
  assert.match(mimeFor('a.js'), /javascript/);
  assert.equal(mimeFor('a.png'), 'image/png');
  assert.equal(mimeFor('a.mp3'), 'audio/mpeg');
  assert.equal(mimeFor('a.bin'), 'application/octet-stream');
});

test('writeAtomic leaves no temp file and keeps the previous copy as .bak', () => {
  const f = path.join(tmp(), 'x', 'file.json');
  writeAtomic(f, 'one');
  writeAtomic(f, 'two');
  assert.equal(fs.readFileSync(f, 'utf8'), 'two');
  assert.equal(fs.readFileSync(`${f}.bak`, 'utf8'), 'one');
  assert.deepEqual(fs.readdirSync(path.dirname(f)).filter((n) => n.endsWith('.tmp')), []);
});

test('readWithFallback uses the backup when the main file is corrupt or missing', () => {
  const f = path.join(tmp(), 'f.json');
  writeAtomic(f, '{"a":1}');
  writeAtomic(f, '{"a":2}');
  fs.writeFileSync(f, '{broken');
  const ok = (t) => !!JSON.parse(t);
  assert.equal(readWithFallback(f, ok), '{"a":1}');
  fs.rmSync(f);
  assert.equal(readWithFallback(f, ok), '{"a":1}');
  assert.equal(readWithFallback(path.join(tmp(), 'none.json'), ok), null);
});

test('SaveMirror: round trip, no roster = no write, wiped storage never clobbers a good mirror', () => {
  const f = path.join(tmp(), 'saves', 'mirror.json');
  const m = new SaveMirror(f);
  assert.equal(m.read(), null);
  assert.equal(m.write({ 'endless-escaspe:settings:v1': '{}' }), false); // no roster
  assert.equal(m.write({ [SAVE_KEY]: '{"saves":[1]}', 'endless-escaspe:settings:v1': '{"g":1}', 'other:key': 'no' }), true);
  assert.equal(m.write({ [SAVE_KEY]: '{"saves":[1]}', 'endless-escaspe:settings:v1': '{"g":1}' }), false); // unchanged
  assert.deepEqual(m.read(), { [SAVE_KEY]: '{"saves":[1]}', 'endless-escaspe:settings:v1': '{"g":1}' });
  assert.equal(m.write({}), false);
  assert.equal(m.write(null), false);
  assert.deepEqual(m.read()[SAVE_KEY], '{"saves":[1]}');
  fs.writeFileSync(f, 'garbage'); // torn write: the .bak from the previous good state is used
  m.write({ [SAVE_KEY]: '{"saves":[2]}' });
  assert.ok(m.read()[SAVE_KEY]);
});

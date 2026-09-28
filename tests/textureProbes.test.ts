import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDataModule, renderProbesModule, TEXTURE_FILES } from '../scripts/gen-texture-probes.mjs';

test('textureProbes.ts matches the PNGs on disk (run scripts/gen-texture-probes.mjs)', () => {
  const committed = readFileSync('src/util/textureProbes.ts', 'utf8');
  assert.equal(committed, renderProbesModule());
  assert.equal(readFileSync('src/util/textureData.ts', 'utf8'), renderDataModule(), 'textureData.ts is stale');
});

test('probes cover every preloaded texture and pick distinct colours', () => {
  const src = readFileSync('src/util/textures.ts', 'utf8');
  for (const key of Object.keys(TEXTURE_FILES)) {
    assert.ok(src.includes(`'${key}'`), `${key} is preloaded`);
  }
  const mod = renderProbesModule();
  assert.ok((mod.match(/^ {6}\[/gm) ?? []).length >= 11 * 3);
});

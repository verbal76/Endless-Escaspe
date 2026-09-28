import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { base64ToBytes, decodePng } from '../src/util/png';
import { TEXTURE_PNG_BASE64 } from '../src/util/textureData';
import { TEXTURE_PROBES } from '../src/util/textureProbes';
import { decodePng as referenceDecode, TEXTURE_FILES } from '../scripts/gen-texture-probes.mjs';

test('in-app PNG decoder matches the reference decoder for every game texture', () => {
  for (const [key, file] of Object.entries(TEXTURE_FILES as Record<string, string>)) {
    const bytes = base64ToBytes(TEXTURE_PNG_BASE64[key]);
    assert.deepEqual(Buffer.from(bytes), readFileSync(file), `${key}: base64 round-trips to the file`);
    const mine = decodePng(bytes);
    const ref = referenceDecode(readFileSync(file));
    assert.equal(mine.width, ref.width);
    assert.equal(mine.height, ref.height);
    assert.ok(Buffer.from(mine.rgba).equals(ref.rgba), `${key}: identical RGBA`);
    for (const [x, y, r, g, b, a] of TEXTURE_PROBES[key].points) {
      const i = (y * mine.width + x) * 4;
      assert.deepEqual([...mine.rgba.subarray(i, i + 4)], [r, g, b, a]);
    }
  }
});

test('decoder rejects non-PNG data', () => {
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /not a PNG/);
});

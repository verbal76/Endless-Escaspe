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

// C-7: the unfilter loop is specialised per filter type. Every filter
// (0-4, plus an invalid one) on first and later rows, for every colour
// type, must decode exactly like the reference decoder.
test('decoder: all filter types and colour types match the reference', async () => {
  const { deflateSync } = await import('node:zlib');
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) & 255;
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  for (const [colorType, ch] of [[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]] as const) {
    for (const firstFilter of [0, 1, 2, 3, 4]) {
      const w = 13;
      const h = 12;
      const rows: number[] = [];
      // Random filtered bytes: any byte stream is a valid filtered image.
      for (let y = 0; y < h; y++) {
        rows.push(y === 0 ? firstFilter : y === 11 ? 9 : y % 5);
        for (let x = 0; x < w * ch; x++) rows.push(colorType === 3 ? rnd() % 20 : rnd());
      }
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0);
      ihdr.writeUInt32BE(h, 4);
      ihdr[8] = 8;
      ihdr[9] = colorType;
      const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
      if (colorType === 3) {
        // 16 palette entries for indices up to 19, alpha for the first 8.
        parts.push(chunk('PLTE', Buffer.from(Array.from({ length: 16 * 3 }, rnd))));
        parts.push(chunk('tRNS', Buffer.from(Array.from({ length: 8 }, rnd))));
      }
      parts.push(chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0)));
      const png = Buffer.concat(parts);
      const mine = decodePng(new Uint8Array(png));
      const ref = referenceDecode(png);
      assert.ok(Buffer.from(mine.rgba).equals(ref.rgba), `colour type ${colorType}, first-row filter ${firstFilter}`);
    }
  }
});

test('decoder rejects non-PNG data', () => {
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /not a PNG/);
});

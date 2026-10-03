import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePng } from '../scripts/png-decode.mjs';
import { renderIconModule } from '../scripts/gen-ui-icons.mjs';

test('iconData.ts matches the PNGs on disk (run scripts/gen-ui-icons.mjs)', () => {
  assert.equal(readFileSync('src/ui/iconData.ts', 'utf8'), renderIconModule());
});

test('settings gear: square, transparent background and hole, centred', () => {
  const { width, height, rgba } = decodePng(readFileSync('assets/ui/settings-gear.png'));
  assert.equal(width, 144);
  assert.equal(height, 144);
  const alpha = (x: number, y: number) => rgba[(y * width + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [143, 0], [0, 143], [143, 143], [72, 72]]) {
    assert.equal(alpha(x, y), 0, `pixel ${x},${y} is transparent`);
  }
  assert.ok(alpha(72, 20) > 240, 'gear body is solid');
  // Visible extent (alpha >= 8) is centred to within a pixel.
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha(x, y) >= 8) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  assert.ok(Math.abs(minX - (width - 1 - maxX)) <= 1, `horizontal margins ${minX} / ${width - 1 - maxX}`);
  assert.ok(Math.abs(minY - (height - 1 - maxY)) <= 1, `vertical margins ${minY} / ${height - 1 - maxY}`);
});

test('the settings button draws the gear image, not the text glyph', () => {
  const src = readFileSync('src/components/HUD/SettingsScreen.tsx', 'utf8');
  assert.ok(src.includes('SETTINGS_GEAR'));
  assert.ok(!src.includes('>⚙<'));
});

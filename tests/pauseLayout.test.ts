import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pausePanelHeights, PANEL_MARGIN } from '../src/ui/pauseLayout';

// Landscape heights (dp) of common Android phones, with and without a
// bottom gesture / nav bar inset.
const CASES: Array<[string, number, number, number]> = [
  ['Pixel 10 Pro XL', 448, 0, 24],
  ['Pixel 8', 412, 0, 24],
  ['Galaxy S24', 384, 0, 48],
  ['mid-range 720p', 360, 24, 48],
  ['small', 320, 0, 0],
];

test('pause panel always fits the visible window and leaves room for the columns', () => {
  for (const [name, h, top, bottom] of CASES) {
    const { card, columns } = pausePanelHeights(h, top, bottom);
    const used = card + Math.max(top, PANEL_MARGIN) + Math.max(bottom, PANEL_MARGIN) + PANEL_MARGIN * 2;
    assert.ok(used <= h, `${name}: panel ${used} > window ${h}`);
    assert.ok(columns >= 150, `${name}: only ${columns} dp for the columns`);
  }
});

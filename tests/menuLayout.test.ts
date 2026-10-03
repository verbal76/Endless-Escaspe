import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLastPlayed, gearFrame, menuPanelFrame } from '../src/ui/menuLayout';
import { buyConfirmCopy, notEnoughCoinsBody, outfitStateLine } from '../src/ui/shopCopy';

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
const SIZES: Array<[number, number]> = [[640, 360], [740, 360], [800, 360], [851, 393], [915, 412], [1280, 800]];

test('menu panel clears the settings gear and stays on screen', () => {
  for (const insets of [NO_INSETS, { top: 0, bottom: 24, left: 48, right: 48 }, { top: 24, bottom: 0, left: 0, right: 32 }]) {
    for (const [w, h] of SIZES) {
      const f = menuPanelFrame(w, h, insets);
      const g = gearFrame(insets);
      assert.ok(f.left >= g.left + g.size, `${w}x${h}: panel left ${f.left} under the gear`);
      assert.ok(f.left >= insets.left && f.right >= insets.right, 'inside the side insets');
      assert.ok(f.top >= insets.top && f.bottom >= insets.bottom, 'inside the top/bottom insets');
      assert.equal(f.left, f.right, 'panel stays centred');
      assert.equal(f.width + f.left + f.right, w);
    }
  }
});

test('profile board budget: rows that must fit a 360 dp-tall phone leave room for the board', () => {
  const f = menuPanelFrame(640, 360, NO_INSETS);
  assert.equal(f.compact, true);
  // padding 20 + header 52 + mode row 52 + CTA row 52.
  const board = f.height - 20 - 52 - 52 - 52;
  assert.ok(board >= 64, `board gets ${board} dp`);
  // Name screen: top row 50 + 4 key rows of 48 + keyboard padding 12.
  assert.ok(f.height - 20 - 50 - 4 * 48 - 12 >= 0);
  // 5 board cells (76 + 8 gap) across the panel's inner width.
  assert.ok(f.width - 24 >= 5 * 76 + 4 * 8);
  assert.equal(menuPanelFrame(915, 412, NO_INSETS).compact, false);
});

test('last-played recency', () => {
  const now = 1_000_000_000_000;
  assert.equal(formatLastPlayed(now - 5_000, now), 'just now');
  assert.equal(formatLastPlayed(now - 5 * 60_000, now), '5 min ago');
  assert.equal(formatLastPlayed(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(formatLastPlayed(now - 30 * 3600_000, now), 'yesterday');
  assert.equal(formatLastPlayed(now - 4 * 86400_000, now), '4 days ago');
  assert.equal(formatLastPlayed(now + 60_000, now), 'just now');
});

test('outfit shop copy: affordability cue and shortfall', () => {
  assert.deepEqual(outfitStateLine(120, 150, false, false), { text: '120 coins', affordable: true });
  const short = outfitStateLine(400, 150, false, false);
  assert.equal(short.affordable, false);
  assert.match(short.text, /need 250 more/);
  assert.equal(outfitStateLine(400, 0, true, true).text, 'WEARING');
  assert.equal(outfitStateLine(400, 0, true, false).text, 'TAP TO WEAR');
  assert.match(notEnoughCoinsBody(400, 150), /You have 150 coins - 250 more needed/);
  assert.equal(buyConfirmCopy('Hi-Vis Orange', 120, 150).title, 'Buy Hi-Vis Orange?');
  assert.match(buyConfirmCopy('Hi-Vis Orange', 120, 150).body, /120 coins · you have 150/);
});

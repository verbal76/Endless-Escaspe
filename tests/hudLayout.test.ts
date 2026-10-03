import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BTN_GAP,
  BTN_H,
  BTN_W,
  CLUSTER_RIGHT,
  heartsRect,
  LOOK,
  PICKUP_MIN_TOP,
  pickupLayout,
  RUN,
  STANCE_BOTTOM,
  toastFrame,
  type Rect,
} from '../src/ui/hudLayout';

const SIZES: Array<[number, number]> = [[640, 360], [740, 360], [800, 360], [851, 393], [915, 412], [1280, 800]];
const INSETS = [
  { top: 0, bottom: 0, left: 0, right: 0 },
  { top: 24, bottom: 0, left: 32, right: 0 },
];

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fromBR = (w: number, h: number, right: number, bottom: number, bw: number, bh: number): Rect => ({
  x: w - right - bw,
  y: h - bottom - bh,
  w: bw,
  h: bh,
});

function cluster(w: number, h: number) {
  const p = pickupLayout(h);
  return {
    crowbar: fromBR(w, h, p.crowbar.right, p.crowbar.bottom, BTN_W, BTN_H),
    smoke: fromBR(w, h, p.smoke.right, p.smoke.bottom, BTN_W, BTN_H),
    rock: fromBR(w, h, p.rock.right, p.rock.bottom, BTN_W, BTN_H),
    stanceTop: fromBR(w, h, CLUSTER_RIGHT, STANCE_BOTTOM + BTN_H + BTN_GAP, BTN_W, BTN_H),
    stanceBottom: fromBR(w, h, CLUSTER_RIGHT, STANCE_BOTTOM, BTN_W, BTN_H),
    run: fromBR(w, h, RUN.right, RUN.bottom, RUN.size, RUN.size),
    look: fromBR(w, h, CLUSTER_RIGHT, LOOK.bottom, BTN_W, LOOK.size),
  };
}

test('pickup buttons never climb above the top floor and never overlap other controls', () => {
  for (const [w, h] of SIZES) {
    const c = cluster(w, h);
    const rects = Object.entries(c);
    for (const [name, r] of rects) {
      if (['crowbar', 'smoke', 'rock'].includes(name)) assert.ok(r.y >= PICKUP_MIN_TOP, `${w}x${h}: ${name} top ${r.y}`);
      assert.ok(r.x >= 0 && r.x + r.w <= w && r.y + r.h <= h, `${w}x${h}: ${name} off screen`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        assert.ok(!hit(rects[i][1], rects[j][1]), `${w}x${h}: ${rects[i][0]} overlaps ${rects[j][0]}`);
      }
    }
  }
  // Tall phones keep the crowbar above SMOKE (unchanged layout).
  assert.equal(pickupLayout(412).row, false);
  assert.equal(pickupLayout(360).row, true);
});

test('toast stays clear of the hearts, the perk tag and every visible control', () => {
  // A tip runs to three lines at most: 3 x 18 + 2 x 8 padding + border.
  const TOAST_H = 72;
  for (const [w, h] of SIZES) {
    for (const insets of INSETS) {
      for (const bossTimer of [false, true]) {
        for (const endless of [false, true]) {
          for (const perkTag of [false, true]) {
            for (const crowbar of [false, true]) {
              const f = toastFrame(w, h, insets, { bossTimer, endless, perkTag, crowbar });
              const rect: Rect =
                f.mode === 'centre'
                  ? { x: (w - f.maxWidth) / 2, y: f.top, w: f.maxWidth, h: TOAST_H }
                  : { x: f.left, y: f.top, w: w - f.left - f.right, h: TOAST_H };
              const tag = `${w}x${h} ${JSON.stringify({ insets, bossTimer, endless, perkTag, crowbar })}`;
              assert.ok(rect.w >= 200, `${tag}: toast only ${rect.w} dp wide`);
              assert.ok(rect.x >= 0 && rect.x + rect.w <= w, `${tag}: off screen`);
              // Up to 5 heart slots (late perk) on the left.
              assert.ok(!hit(rect, heartsRect(insets, 5, perkTag && !endless)), `${tag}: covers the hearts`);
              const c = cluster(w, h);
              const controls: Array<[string, Rect]> = [
                ['smoke', c.smoke],
                ['rock', c.rock],
                ['run', c.run],
                ['stance', c.stanceTop],
              ];
              if (crowbar) controls.push(['crowbar', c.crowbar]);
              for (const [name, r] of controls) assert.ok(!hit(rect, r), `${tag}: covers ${name}`);
              // Boss SURVIVE timer (top centre, y 64-120).
              if (bossTimer) assert.ok(rect.y >= 120, `${tag}: under the boss timer`);
            }
          }
        }
      }
    }
  }
});

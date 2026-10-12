// Desktop action layer: keyboard + gamepad -> the game's existing input vocabulary (pure logic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EdgeTracker, frameFrom, LOOK_YAW_RAD, NavRepeater, PAD, type PadSnapshot } from '../src/desktop/actions';
import { pickInitial, pickNext, type Rect } from '../src/desktop/focusNav';
import { DeviceTracker, nextStyle, padFamily, promptsFor, resolveFamily } from '../src/desktop/prompts';
import { BackStack } from '../src/desktop/backHandler';
import { GLYPHS } from '../src/desktop/glyphManifest';

const pad = (buttons: number[] = [], axes: number[] = [0, 0, 0, 0]): PadSnapshot => {
  const b = Array.from({ length: 17 }, () => false);
  for (const i of buttons) b[i] = true;
  return { axes, buttons: b };
};
const keys = (...c: string[]) => new Set(c);

test('left stick: up is forward (+Y), right is +X, dead zone reads zero', () => {
  assert.equal(frameFrom('play', keys(), pad([], [0, -1, 0, 0])).move.y, 1);
  assert.equal(frameFrom('play', keys(), pad([], [1, 0, 0, 0])).move.x, 1);
  const dz = frameFrom('play', keys(), pad([], [0.1, -0.1, 0, 0]));
  assert.deepEqual(dz.move, { x: 0, y: 0 });
  const diag = frameFrom('play', keys(), pad([], [1, -1, 0, 0])).move;
  assert.ok(Math.hypot(diag.x, diag.y) <= 1.0001);
});

test('keyboard movement matches the stick convention and never exceeds the unit disc', () => {
  assert.deepEqual(frameFrom('play', keys('KeyW'), null).move, { x: 0, y: 1 });
  assert.deepEqual(frameFrom('play', keys('KeyA'), null).move, { x: -1, y: 0 });
  const d = frameFrom('play', keys('KeyW', 'KeyD'), null).move;
  assert.ok(Math.hypot(d.x, d.y) <= 1.0001);
  assert.deepEqual(frameFrom('play', keys('KeyW', 'KeyS'), null).move, { x: 0, y: 0 });
});

test('look: Q/LB = +45 deg (look-left button), E/RB = -45 deg, never beyond', () => {
  assert.equal(frameFrom('play', keys('KeyQ'), null).lookYaw, LOOK_YAW_RAD);
  assert.equal(frameFrom('play', keys('KeyE'), null).lookYaw, -LOOK_YAW_RAD);
  assert.equal(frameFrom('play', keys(), pad([PAD.rb])).lookYaw, -LOOK_YAW_RAD);
  assert.equal(frameFrom('play', keys(), pad([PAD.lb, PAD.rb])).lookYaw, 0);
  assert.ok(Math.abs(frameFrom('play', keys(), pad([PAD.lb], [0, 0, -1, 0])).lookYaw) <= LOOK_YAW_RAD);
});

test('play-mode commands: pad and keyboard', () => {
  const h = (f: ReturnType<typeof frameFrom>) => [...f.held].sort();
  assert.deepEqual(h(frameFrom('play', keys(), pad([PAD.south]))), ['runToggle']);
  assert.deepEqual(h(frameFrom('play', keys(), pad([PAD.east]))), ['stance']);
  assert.deepEqual(h(frameFrom('play', keys(), pad([PAD.west, PAD.north, PAD.rt, PAD.start]))), ['crowbar', 'pause', 'rock', 'smoke']);
  assert.deepEqual(h(frameFrom('play', keys('Escape', 'KeyC', 'Digit1', 'Digit2', 'Digit3'), null)), ['crowbar', 'pause', 'rock', 'smoke', 'stance']);
  assert.equal(frameFrom('play', keys('ShiftLeft'), null).runHeld, true);
});

test('menu mode never produces movement and maps A/B/D-pad to confirm/back/navigation', () => {
  const f = frameFrom('menu', keys('KeyW'), pad([PAD.south, PAD.down], [0, -1, 1, 0]));
  assert.deepEqual(f.move, { x: 0, y: 0 });
  assert.equal(f.lookYaw, 0);
  assert.ok(f.held.has('confirm') && f.held.has('navUp') === true && f.held.has('navDown'));
  assert.ok(frameFrom('menu', keys(), pad([PAD.east])).held.has('back'));
  assert.ok(frameFrom('menu', keys(), pad([PAD.start])).held.has('back'));
  assert.ok(frameFrom('menu', keys('Enter'), null).held.has('confirm'));
  assert.ok(frameFrom('menu', keys('Escape'), null).held.has('back'));
});

test('Back/View held is reported for the hold-to-quit gesture', () => {
  assert.equal(frameFrom('play', keys(), pad([PAD.back])).quitHeld, true);
  assert.equal(frameFrom('play', keys(), pad([])).quitHeld, false);
});

test('EdgeTracker fires once per press; NavRepeater repeats after the delay', () => {
  const e = new EdgeTracker();
  const held = new Set(['pause'] as const);
  assert.deepEqual(e.step(held), ['pause']);
  assert.deepEqual(e.step(held), []);
  assert.deepEqual(e.step(new Set()), []);
  assert.deepEqual(e.step(held), ['pause']);
  const n = new NavRepeater(300, 100);
  const d = new Set(['navDown'] as const);
  assert.equal(n.step(d, 0), 'navDown');
  assert.equal(n.step(d, 150), null);
  assert.equal(n.step(d, 310), 'navDown');
  assert.equal(n.step(d, 350), null);
  assert.equal(n.step(d, 420), 'navDown');
  assert.equal(n.step(new Set(), 430), null);
  assert.equal(n.step(d, 440), 'navDown');
});

test('spatial focus: same-row neighbour beats a nearer one in the next row', () => {
  const back: Rect = { left: 360, top: 273, width: 100, height: 44 };
  const start: Rect = { left: 820, top: 273, width: 100, height: 44 };
  const w: Rect = { left: 416, top: 329, width: 52, height: 44 };
  assert.equal(pickNext(back, [back, w, start], 'right'), 2);
  assert.equal(pickNext(back, [back, w, start], 'down'), 1);
  assert.equal(pickNext(back, [back, w, start], 'left'), -1);
  assert.equal(pickNext(back, [back, w, start], 'up'), -1);
  assert.equal(pickInitial([back, start], { width: 1280, height: 800 }), 0);
});

test('padFamily: Deck and Steam Input -> Xbox layout with the Deck flag, PlayStation, Switch', () => {
  assert.deepEqual(padFamily('Steam Deck Controller (Vendor: 28de Product: 11ff)'), { family: 'xbox', deck: true });
  assert.deepEqual(padFamily('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)'), { family: 'xbox', deck: false });
  assert.equal(padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)').family, 'playstation');
  assert.equal(padFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)').family, 'switch');
  assert.equal(padFamily('Mystery Pad').family, 'xbox');
});

test('prompt style: manual override wins, auto follows the last device, no flicker', () => {
  assert.equal(resolveFamily('playstation', 'keyboard', 'xbox'), 'playstation');
  assert.equal(resolveFamily('auto', 'keyboard', 'xbox'), 'keyboard');
  assert.equal(resolveFamily('auto', 'pad', 'switch'), 'switch');
  assert.equal(resolveFamily('auto', null, null), 'keyboard');
  const t = new DeviceTracker(1000);
  assert.equal(t.note('pad', 0), true);
  assert.equal(t.note('keyboard', 200), false);
  assert.equal(t.current, 'pad');
  assert.equal(t.note('keyboard', 1500), true);
  assert.equal(nextStyle('keyboard'), 'auto');
});

test('every prompt resolves to a glyph file or a text chip in every family and mode', () => {
  for (const family of ['xbox', 'playstation', 'switch', 'keyboard'] as const) {
    for (const mode of ['play', 'menu'] as const) {
      for (const p of promptsFor(family, mode)) {
        assert.ok(p.files.length > 0 || p.chip, `${family}/${mode}/${p.key} has no artwork`);
      }
    }
  }
  assert.ok(Object.keys(GLYPHS).length === 4);
});

test('BackStack: newest handler first, a true return consumes the press, removal works', () => {
  const s = new BackStack();
  const calls: string[] = [];
  s.add(() => (calls.push('a'), true));
  const sub = s.add(() => (calls.push('b'), false));
  assert.equal(s.press(), true);
  assert.deepEqual(calls, ['b', 'a']);
  sub.remove();
  calls.length = 0;
  assert.equal(s.press(), true);
  assert.deepEqual(calls, ['a']);
  assert.equal(new BackStack().press(), false);
});

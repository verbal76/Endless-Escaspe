import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FATAL_AFTER, startLoop } from '../src/game/Loop';

// Manual clock + frame queue so the loop can be stepped deterministically.
function harness(update: (dt: number) => void, render: (a: number) => void = () => {}) {
  let t = 0;
  let pending: ((now: number) => void) | null = null;
  const errors: string[] = [];
  const fatals: unknown[] = [];
  const handle = startLoop({
    update,
    render,
    now: () => t,
    schedule: (cb) => {
      pending = cb;
    },
    onError: (e, phase) => errors.push(`${phase}:${(e as Error).message}`),
    onFatal: (e) => fatals.push(e),
  });
  const frame = (ms = 1000 / 60) => {
    t += ms;
    const cb = pending;
    pending = null;
    cb?.(t);
    return pending !== null;
  };
  return { frame, errors, fatals, handle };
}

test('loop keeps running after update throws, and reports the error', () => {
  let calls = 0;
  const h = harness(() => {
    calls++;
    if (calls === 3) throw new Error('boom');
  });
  for (let i = 0; i < 10; i++) assert.equal(h.frame(), true, 'next frame scheduled');
  assert.ok(calls >= 7, `update kept being called (${calls})`);
  assert.deepEqual(h.errors, ['update:boom']);
  assert.equal(h.fatals.length, 0);
});

test('a render exception is caught too', () => {
  let n = 0;
  const h = harness(
    () => {},
    () => {
      if (n++ === 1) throw new Error('gl');
    },
  );
  for (let i = 0; i < 5; i++) assert.equal(h.frame(), true);
  assert.deepEqual(h.errors, ['render:gl']);
});

test('onFatal fires once after consecutive failures, and re-arms after recovery', () => {
  let failing = true;
  const h = harness(() => {
    if (failing) throw new Error('stuck');
  });
  for (let i = 0; i < FATAL_AFTER * 3; i++) h.frame(20);
  assert.equal(h.fatals.length, 1);
  failing = false;
  h.frame(40); // long enough to guarantee a clean sim step
  failing = true;
  for (let i = 0; i < FATAL_AFTER * 3; i++) h.frame(20);
  assert.equal(h.fatals.length, 2);
});

test('stop() ends the loop and huge frame gaps are clamped', () => {
  let steps = 0;
  const h = harness(() => {
    steps++;
  });
  h.frame(5000); // 5 s gap -> clamped to 0.1 s = 6 steps
  assert.ok(steps <= 7, `clamped (${steps})`);
  h.handle.stop();
  assert.equal(h.frame(), false);
});

// C-5: vsync jitter at 60 Hz must not alternate 0 / 2 sim steps per
// rendered frame (repeated position, then a double step).
test('60 Hz with vsync jitter runs exactly one sim step per rendered frame', () => {
  let steps = 0;
  const perFrame: number[] = [];
  const h = harness(
    () => {
      steps++;
    },
    () => {
      perFrame.push(steps);
      steps = 0;
    },
  );
  let seed = 1;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.6; // +-0.3 ms
  for (let i = 0; i < 600; i++) h.frame(1000 / 60 + jitter());
  const odd = perFrame.slice(2).filter((n) => n !== 1).length;
  assert.equal(odd, 0, `${odd} frames ran 0 or 2 steps`);
});

test('snapping never drifts the sim clock on a 59 Hz / 61 Hz display', () => {
  for (const hz of [59, 61, 90, 120, 30]) {
    let steps = 0;
    const h = harness(() => {
      steps++;
    });
    const frames = hz * 20; // 20 s
    for (let i = 0; i < frames; i++) h.frame(1000 / hz);
    const want = 20 * 60;
    assert.ok(Math.abs(steps - want) <= 1, `${hz} Hz: ${steps} steps for ${want}`);
  }
});

// C-10: a static picture (paused) is redrawn at a quarter rate; the
// sim keeps its normal cadence and full-rate drawing resumes at once.
test('static frames are rendered at a throttled rate', () => {
  let t = 0;
  let pending: ((now: number) => void) | null = null;
  let renders = 0;
  let paused = true;
  startLoop({
    update: () => {},
    render: () => {
      renders++;
    },
    isStatic: () => paused,
    now: () => t,
    schedule: (cb) => {
      pending = cb;
    },
  });
  const frame = () => {
    t += 1000 / 60;
    const cb = pending;
    pending = null;
    cb?.(t);
  };
  for (let i = 0; i < 40; i++) frame();
  assert.equal(renders, 10);
  paused = false;
  frame();
  frame();
  assert.equal(renders, 12);
});

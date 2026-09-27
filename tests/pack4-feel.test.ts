import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MusicIntensity,
  ALERT_ENTER,
  ALERT_EXIT,
  ALERT_HOLD_S,
  CHASE_HOLD_S,
  FADE_S,
} from '../src/util/musicIntensity';

const DT = 1 / 60;
const run = (m: MusicIntensity, danger: number, chasing: boolean, seconds: number) => {
  let mix = m.update(danger, chasing, DT);
  for (let t = DT; t < seconds; t += DT) mix = m.update(danger, chasing, DT);
  return mix;
};

test('music escalates calm -> alert -> chase with danger', () => {
  const m = new MusicIntensity();
  assert.equal(run(m, 0.1, false, 1).state, 'calm');
  const alert = run(m, 0.5, false, FADE_S + 0.1);
  assert.equal(alert.state, 'alert');
  assert.ok(alert.tensionGain > 0.5 && alert.calmGain < 0.5);
  const chase = run(m, 0.7, true, FADE_S + 0.1);
  assert.equal(chase.state, 'chase');
  assert.ok(chase.tensionGain > 0.99 && chase.rate > 1);
});

test('no rapid toggling when the meter hovers around the thresholds', () => {
  const m = new MusicIntensity();
  run(m, 0.5, false, 0.5); // alert
  let flips = 0;
  let last = m.state;
  // Oscillate right around the alert-enter threshold for 20 s.
  for (let t = 0; t < 20; t += DT) {
    const d = ALERT_ENTER + Math.sin(t * 9) * 0.12; // dips under exit? no: min 0.33 > ALERT_EXIT
    m.update(d, false, DT);
    if (m.state !== last) {
      flips++;
      last = m.state;
    }
  }
  assert.ok(ALERT_ENTER - 0.12 > ALERT_EXIT);
  assert.equal(flips, 0);
  // Short dips below the exit threshold don't drop out of alert either.
  for (let i = 0; i < 20; i++) {
    run(m, 0.1, false, ALERT_HOLD_S * 0.5);
    run(m, 0.3, false, 0.3);
  }
  assert.equal(m.state, 'alert');
  // A sustained calm does.
  assert.equal(run(m, 0.05, false, ALERT_HOLD_S + 0.2).state, 'calm');
});

test('chase holds through brief lulls and gains glide rather than jump', () => {
  const m = new MusicIntensity();
  run(m, 1, true, 2);
  const lull = run(m, 0.3, false, CHASE_HOLD_S * 0.6);
  assert.equal(lull.state, 'chase');
  let prev = m.tensionGain;
  let maxJump = 0;
  for (let t = 0; t < CHASE_HOLD_S + 3; t += DT) {
    const mix = m.update(0.0, false, DT);
    maxJump = Math.max(maxJump, Math.abs(mix.tensionGain - prev));
    prev = mix.tensionGain;
  }
  assert.equal(m.state, 'calm');
  assert.ok(maxJump <= DT / FADE_S + 1e-9, `gain jumped by ${maxJump}`);
});

test('danger edge tint is silent at low detection and capped', async () => {
  const { dangerTintOpacity } = await import('../src/util/feel');
  assert.equal(dangerTintOpacity(0), 0);
  assert.equal(dangerTintOpacity(0.3), 0);
  assert.ok(dangerTintOpacity(0.6) > 0 && dangerTintOpacity(0.6) < dangerTintOpacity(0.9));
  assert.ok(Math.abs(dangerTintOpacity(1) - 0.5) < 1e-9);
  let prev = 0;
  for (let l = 0; l <= 1; l += 0.01) {
    const v = dangerTintOpacity(l);
    assert.ok(v >= prev - 1e-12, 'monotonic');
    prev = v;
  }
});

test('stage tips: one mechanic per early stage, each shown once per save', async () => {
  const { stageStartTip, contextTip } = await import('../src/util/stageTips');
  const seen: string[] = [];
  const shown: string[] = [];
  for (let stage = 1; stage <= 6; stage++) {
    const tip = stageStartTip(stage, seen);
    assert.ok(tip, `no tip on stage ${stage}`);
    shown.push(tip!);
    seen.push(tip!);
    // Replaying the stage doesn't repeat it.
    assert.equal(stageStartTip(stage, seen), null);
  }
  assert.equal(new Set(shown).size, 6);
  assert.equal(stageStartTip(7, seen), null);
  assert.equal(stageStartTip(8, seen), 'dogs');
  // A veteran save loaded at stage 20 isn't lectured on stage-1 basics.
  assert.equal(stageStartTip(20, []), null);
  assert.equal(contextTip('crowbar', []), 'crowbar');
  assert.equal(contextTip('crowbar', ['crowbar']), null);
});

test('old saves (no tipsSeen) load with every other field intact', async () => {
  const { parseSaves } = await import('../src/util/storage');
  const legacy = JSON.stringify({
    ann: { name: 'Ann', skin: 'beige', stage: 12, bestStars: { 1: 3, 2: 2, 11: 1 }, updatedAt: 123 },
    bob: { name: 'Bob', skin: 'brown', stage: 3, bestStars: {}, updatedAt: 456, tipsSeen: ['stage1', 42, 'stage1', 'stage2'] },
    bad: { name: 7 },
  });
  const saves = parseSaves(legacy)!;
  assert.deepEqual(Object.keys(saves).sort(), ['ann', 'bob']);
  assert.equal(saves.ann.stage, 12);
  assert.deepEqual(saves.ann.bestStars, { 1: 3, 2: 2, 11: 1 });
  assert.equal(saves.ann.updatedAt, 123);
  assert.deepEqual(saves.ann.tipsSeen, []);
  assert.deepEqual(saves.bob.tipsSeen, ['stage1', 'stage2']);
  // Round trip is stable (no repeated migration effects).
  const again = parseSaves(JSON.stringify(saves))!;
  assert.deepEqual(again, saves);
});

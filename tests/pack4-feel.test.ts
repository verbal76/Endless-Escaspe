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

test('stage tips: a rule is taught on the stage that introduces it, once per save', async () => {
  const { stageStartTips, levelTips, contextTip, TIPS } = await import('../src/util/stageTips');
  const seen: string[] = [];
  const at = (stage: number) => {
    const ids = stageStartTips(stage, seen);
    seen.push(...ids);
    return ids;
  };
  assert.deepEqual(at(1), ['stage1']);
  assert.deepEqual(at(1), [], 'replaying the stage does not repeat it');
  assert.deepEqual(at(2), []);
  assert.deepEqual(at(5), ['stage5']);
  assert.deepEqual(at(6), ['stage6']);
  assert.deepEqual(at(8), ['dogs', 'searchlight']);
  assert.deepEqual(at(12), ['stage12']);
  assert.deepEqual(at(14), ['razor']);
  assert.deepEqual(at(20), ['hearts1']);
  // A veteran save loaded at stage 20 isn't lectured on earlier rules.
  assert.deepEqual(stageStartTips(20, []), ['hearts1']);
  // Endless / Daily get the same rules as the level rises.
  assert.deepEqual(levelTips(8, []), ['dogs', 'searchlight']);
  assert.deepEqual(levelTips(14, ['razor']), []);
  assert.equal(contextTip('crowbar', []), 'crowbar');
  assert.equal(contextTip('crowbar', ['crowbar']), null);
  // Short enough to read while playing.
  for (const t of Object.values(TIPS)) assert.ok(t.length <= 75, t);
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

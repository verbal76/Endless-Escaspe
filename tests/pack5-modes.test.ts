import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ProcgenSystem, SPAWN_X, SPAWN_Z, generateChunk, createWalkability, type ChunkOptions } from '../src/systems/ProcgenSystem';
import { chunkDensityFor } from '../src/util/progression';
import { dailySeed, utcDayKey, fnv1a, DAILY_RULES_VERSION } from '../src/util/daily';
import { mulberry32 } from '../src/util/rng';
import { CHUNK_LEN } from '../src/util/geometry';
import { playerCanReach } from './helpers';
import type { Obstacle } from '../src/types/world';

test('layout density rises with stage and caps', () => {
  const a = chunkDensityFor(1);
  const b = chunkDensityFor(12);
  const c = chunkDensityFor(60);
  assert.deepEqual(a, { obstacleMin: 4, obstacleMax: 8, coverMin: 1, coverMax: 3 });
  assert.ok(b.obstacleMax > a.obstacleMax && b.obstacleMin >= a.obstacleMin);
  assert.ok(c.obstacleMax <= 11 && c.coverMax <= 5);
});

test('denser late-stage layouts are still always walkable', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const spec = chunkDensityFor(20);
    const p = new ProcgenSystem(seed * 13, new THREE.Group(), 9, 0, spec);
    p.init();
    assert.ok(playerCanReach(p.obstacles(), SPAWN_X, SPAWN_Z, 9 * CHUNK_LEN), `seed ${seed}`);
  }
});

function forkSegment(seed: number, side: -1 | 1) {
  const plan = (i: number): ChunkOptions => (i === 2 ? { fork: side } : {});
  const p = new ProcgenSystem(seed, new THREE.Group(), 5, 0, plan);
  p.init();
  return p;
}

test('fork: both lanes are independently passable and the safe lane is longer', () => {
  let forks = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const side = seed % 2 ? 1 : -1;
    const p = forkSegment(seed * 7, side);
    const f = p.forks()[0];
    if (!f) continue; // fell back (previous chunk blocked the lanes)
    forks++;
    const obs = p.obstacles();
    const endZ = 5 * CHUNK_LEN;
    // Plug each lane at the guard post line and prove the other lane
    // alone still reaches the end.
    const plug = (x: number): Obstacle => ({ id: -1, kind: 'hedgerow', x, z: f.postZ - 3, r: 4.7, halfW: 4.6, halfL: 0.4, rotY: 0, height: 1, isCover: false, mesh: null });
    assert.ok(playerCanReach([...obs, plug(-4.5)], SPAWN_X, SPAWN_Z, endZ), `right lane blocked seed ${seed}`);
    assert.ok(playerCanReach([...obs, plug(4.5)], SPAWN_X, SPAWN_Z, endZ), `left lane blocked seed ${seed}`);
    // Danger lane carries the reward pickups.
    const inLane = p.pickups().filter((k) => k.z >= f.startZ && k.z <= f.endZ && Math.sign(k.x) === f.dangerSide);
    assert.equal(inLane.length, 2);
    assert.equal(Math.sign(f.postX), f.dangerSide);
  }
  assert.ok(forks >= 24, `only ${forks}/30 forks generated`);
});

test('fork safe lane forces a real detour (slalom barriers)', () => {
  const walk = createWalkability(0, 1, -2, 80);
  const rng = mulberry32(5);
  // Start from an empty approach chunk so the fork is generated as designed.
  generateChunk(rng, 0, 0, undefined, walk, { spec: { obstacleMin: 0, obstacleMax: 1, coverMin: 0, coverMax: 1 } });
  const c = generateChunk(rng, CHUNK_LEN, 1, undefined, walk, { fork: 1 });
  assert.ok(c.fork);
  const safeSide = c.obstacles.filter((o) => o.rotY === 0 && Math.sign(o.x) === -c.fork!.dangerSide);
  assert.ok(safeSide.length >= 6, 'slalom gates missing');
  const gateZs = new Set(safeSide.map((o) => o.z));
  assert.ok(gateZs.size >= 3);
});

test('endless streaming stays walkable and deterministic while trimming behind', () => {
  const build = (seed: number) => {
    const plan = (i: number): ChunkOptions => ({ spec: chunkDensityFor(1 + Math.floor(i / 5)), fork: i % 10 === 7 ? (i % 20 === 7 ? 1 : -1) : undefined });
    const p = new ProcgenSystem(seed, new THREE.Group(), 4, 0, plan);
    p.init();
    const sig: string[] = [];
    let playerZ = 1;
    for (let step = 0; step < 40; step++) {
      playerZ += CHUNK_LEN;
      p.extendTo(playerZ + 4 * CHUNK_LEN);
      p.trimBefore(playerZ - 2 * CHUNK_LEN);
      const window = p.gameplayChunks();
      assert.ok(window.length <= 8, `window grew to ${window.length}`);
      // The live window must be walkable from its start to its end.
      const startZ = window[0].startZ;
      const endZ = window[window.length - 1].endZ;
      const shifted = p.obstacles().map((o) => ({ ...o, z: o.z - startZ }));
      // Spawn at a free spot on the window's first row.
      let ok = false;
      for (let x = -8; x <= 8 && !ok; x += 0.5) ok = playerCanReach(shifted, x, 0.3, endZ - startZ);
      assert.ok(ok, `window ${startZ}-${endZ} not walkable`);
      sig.push(window.map((c) => c.obstacles.map((o) => `${o.kind}${o.x.toFixed(2)}`).join(',')).join('|'));
    }
    return sig.join('#');
  };
  const a = build(4242);
  const b = build(4242);
  assert.equal(a, b, 'same seed must stream the same world');
  assert.notEqual(a, build(4243));
});

test('daily seed: deterministic per UTC day and rules version', () => {
  const d = utcDayKey(new Date('2026-09-27T23:59:59Z'));
  assert.equal(d, '2026-09-27');
  assert.equal(utcDayKey(new Date('2026-09-28T00:00:01+02:00')), '2026-09-27');
  assert.equal(dailySeed(d), dailySeed('2026-09-27'));
  assert.notEqual(dailySeed('2026-09-27'), dailySeed('2026-09-28'));
  assert.notEqual(dailySeed(d, DAILY_RULES_VERSION), dailySeed(d, DAILY_RULES_VERSION + 1));
  // Known-answer check pins the hash so it can't drift between builds.
  assert.equal(fnv1a('a'), 0xe40c292c);
  assert.throws(() => dailySeed('27/09/2026'));
  // Same daily seed => identical generated layout.
  const sig = (seed: number) => {
    const p = new ProcgenSystem(seed, new THREE.Group(), 5, 0);
    p.init();
    return p.obstacles().map((o) => `${o.kind}:${o.x.toFixed(4)}:${o.z.toFixed(4)}`).join('|');
  };
  assert.equal(sig(dailySeed(d)), sig(dailySeed(d)));
});

import { parseSaves, newSave } from '../src/util/storage';
import { applyRunResult, purchaseOutfit, equipOutfit, campaignReward, COINS_PER_STAR, FIRST_CLEAR_BONUS } from '../src/util/economy';

test('economy: stars pay once per stage, improvements pay the difference', () => {
  let s = newSave('Ann', 'beige');
  let r = applyRunResult(s, { kind: 'campaign', runId: 'r1', stage: 1, stars: 2 });
  assert.equal(r.earned, 2 * COINS_PER_STAR + FIRST_CLEAR_BONUS);
  s = r.save;
  // Same run reported twice: no double pay.
  assert.equal(applyRunResult(s, { kind: 'campaign', runId: 'r1', stage: 1, stars: 2 }).earned, 0);
  // Replaying for the same stars: nothing.
  r = applyRunResult(s, { kind: 'campaign', runId: 'r2', stage: 1, stars: 2 });
  assert.equal(r.earned, 0);
  s = r.save;
  // Improving to 3 stars pays exactly one more star.
  r = applyRunResult(s, { kind: 'campaign', runId: 'r3', stage: 1, stars: 3 });
  assert.equal(r.earned, COINS_PER_STAR);
  s = r.save;
  // Dropping back to 1 star never un-pays or re-pays.
  r = applyRunResult(s, { kind: 'campaign', runId: 'r4', stage: 1, stars: 1 });
  assert.equal(r.earned, 0);
  assert.equal(r.save.coins, 3 * COINS_PER_STAR + FIRST_CLEAR_BONUS);
  assert.equal(campaignReward(3, 3), 0);
  assert.equal(campaignReward(-1, 0), 0);
});

test('economy: endless / daily pay by distance; daily bonus once per day; bests tracked', () => {
  let s = newSave('Bob', 'brown');
  let r = applyRunResult(s, { kind: 'endless', runId: 'e1', distanceM: 263.9 });
  assert.equal(r.earned, 10);
  assert.equal(r.save.endlessBest, 263);
  s = r.save;
  r = applyRunResult(s, { kind: 'endless', runId: 'e2', distanceM: 100 });
  assert.equal(r.save.endlessBest, 263);
  s = r.save;
  r = applyRunResult(s, { kind: 'daily', runId: 'd1', distanceM: 100, day: '2026-09-27' });
  assert.equal(r.earned, 5 + 10);
  s = r.save;
  r = applyRunResult(s, { kind: 'daily', runId: 'd2', distanceM: 300, day: '2026-09-27' });
  assert.equal(r.earned, 15);
  assert.deepEqual(r.save.daily, { day: '2026-09-27', best: 300 });
  s = r.save;
  r = applyRunResult(s, { kind: 'daily', runId: 'd3', distanceM: 40, day: '2026-09-28' });
  assert.equal(r.earned, 2 + 10);
  assert.deepEqual(r.save.daily, { day: '2026-09-28', best: 40 });
  assert.equal(applyRunResult(s, { kind: 'endless', runId: 'x', distanceM: NaN }).earned, 0);
});

test('outfits: purchase needs funds, never goes negative, cannot be bought twice; cosmetic only', () => {
  let s = { ...newSave('Cy', 'beige'), coins: 130 };
  assert.deepEqual(purchaseOutfit(s, 'gold'), { ok: false, reason: 'funds' });
  const p = purchaseOutfit(s, 'orange');
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.save.coins, 10);
  assert.equal(p.save.outfit, 'orange');
  assert.deepEqual(purchaseOutfit(p.save, 'orange'), { ok: false, reason: 'owned' });
  assert.deepEqual(purchaseOutfit(p.save, 'nope' as never), { ok: false, reason: 'unknown' });
  // Can't equip what you don't own.
  assert.equal(equipOutfit(p.save, 'gold').outfit, 'orange');
  assert.equal(equipOutfit(p.save, 'grey').outfit, 'grey');
});

test('save migration: pre-economy saves convert stars once and keep all progress', () => {
  const legacy = JSON.stringify({
    ann: { name: 'Ann', skin: 'brown', stage: 7, bestStars: { 1: 3, 2: 1, 3: 2 }, updatedAt: 99 },
  });
  const a = parseSaves(legacy)!.ann;
  assert.equal(a.stage, 7);
  assert.deepEqual(a.bestStars, { 1: 3, 2: 1, 3: 2 });
  const expected = campaignReward(3, 0) + campaignReward(1, 0) + campaignReward(2, 0);
  assert.equal(a.coins, expected);
  assert.deepEqual(a.coinStars, { 1: 3, 2: 1, 3: 2 });
  assert.equal(a.outfit, 'grey');
  assert.ok(a.outfits.includes('classic') && a.outfits.includes('grey'));
  // Idempotent: parsing the migrated save again changes nothing.
  const again = parseSaves(JSON.stringify({ ann: a }))!.ann;
  assert.deepEqual(again, a);
  // Replaying a stage whose stars were converted pays nothing extra.
  assert.equal(applyRunResult(a, { kind: 'campaign', runId: 'z', stage: 1, stars: 3 }).earned, 0);
  // Corrupt economy fields are repaired, not trusted.
  const bad = parseSaves(JSON.stringify({ x: { ...a, coins: -50, outfits: ['gold', 7], outfit: 'gold', daily: { day: 'yesterday', best: 5 } } }))!.ann;
  assert.equal(bad.coins, 0);
  assert.ok(bad.outfits.includes('gold'));
  assert.equal(bad.daily, null);
});

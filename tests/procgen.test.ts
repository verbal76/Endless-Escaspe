import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ProcgenSystem, SPAWN_X, SPAWN_Z } from '../src/systems/ProcgenSystem';
import { CHUNK_LEN } from '../src/util/geometry';
import { playerCanReach } from './helpers';

// Regression: the old slab check ignored cover props (which do block
// movement), judged each 1 m slab in isolation, and left a chunk
// completely empty after 5 failures. Every generated segment must now
// be walkable end to end under the real collision rules.
test('every generated campaign segment is walkable from spawn to the win line', () => {
  let checked = 0;
  for (let seed = 1; seed <= 160; seed++) {
    const chunks = 5 + (seed % 5);
    const p = new ProcgenSystem(seed * 7919, new THREE.Group(), chunks, 0);
    p.init();
    const ok = playerCanReach(p.obstacles(), SPAWN_X, SPAWN_Z, chunks * CHUNK_LEN);
    assert.ok(ok, `seed ${seed * 7919} (${chunks} chunks) is not walkable`);
    checked++;
  }
  assert.equal(checked, 160);
});

test('chunks are rarely left empty (thinning retries instead of giving up)', () => {
  let empty = 0;
  let total = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const p = new ProcgenSystem(seed, new THREE.Group(), 7, 0);
    p.init();
    for (const c of p.gameplayChunks()) {
      total++;
      if (c.obstacles.length === 0) empty++;
    }
  }
  assert.ok(empty / total < 0.02, `${empty}/${total} chunks empty`);
});

test('generation is deterministic for a given seed', () => {
  const a = new ProcgenSystem(1234, new THREE.Group(), 6, 0);
  const b = new ProcgenSystem(1234, new THREE.Group(), 6, 0);
  a.init();
  b.init();
  const sig = (p: ProcgenSystem) =>
    p.obstacles().map((o) => `${o.kind}:${o.x.toFixed(3)}:${o.z.toFixed(3)}`).join('|');
  assert.equal(sig(a), sig(b));
});

test('pickups are placed on reachable ground', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const p = new ProcgenSystem(seed * 31, new THREE.Group(), 6, 0);
    p.init();
    for (const pk of p.pickups()) {
      assert.ok(
        playerCanReach(p.obstacles(), SPAWN_X, SPAWN_Z, (x, z) => Math.hypot(x - pk.x, z - pk.z) <= pk.r),
        `pickup at ${pk.x},${pk.z} seed ${seed * 31}`,
      );
    }
  }
});

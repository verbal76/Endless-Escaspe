import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { NavGrid, type Cell } from '../src/systems/NavGrid';
import { ProcgenSystem, type ChunkPlan } from '../src/systems/ProcgenSystem';
import { CHUNK_LEN, CHUNKS_AHEAD } from '../src/util/geometry';
import { chunkDensityFor, forksEnabledFor } from '../src/util/progression';
import { mulberry32, type Rng } from '../src/util/rng';
import type { Obstacle } from '../src/types/world';

// The flood that shipped before the allocation-free rewrite (C-2),
// kept verbatim as the reference.
function referenceFlood(g: NavGrid, seeds: readonly Cell[], rowLimit: number = g.rows - 1): Uint8Array {
  const visited = new Uint8Array(g.rows * g.cols);
  const queue = new Int32Array(g.rows * g.cols);
  let head = 0;
  let tail = 0;
  for (const s of seeds) {
    if (s.row > rowLimit || g.isBlocked(s.col, s.row)) continue;
    const i = s.row * g.cols + s.col;
    if (visited[i]) continue;
    visited[i] = 1;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++];
    const row = (i / g.cols) | 0;
    const col = i - row * g.cols;
    const tryPush = (c: number, r: number) => {
      if (c < 0 || c >= g.cols || r < 0 || r > rowLimit) return;
      if (visited[r * g.cols + c] || g.isBlocked(c, r)) return;
      visited[r * g.cols + c] = 1;
      queue[tail++] = r * g.cols + c;
    };
    tryPush(col + 1, row);
    tryPush(col - 1, row);
    tryPush(col, row + 1);
    tryPush(col, row - 1);
  }
  return visited;
}

let oid = 1;
function blob(x: number, z: number, r: number): Obstacle {
  return { id: oid++, kind: 'boulder', x, z, r, height: 1, isCover: false, mesh: null } as Obstacle;
}
function wall(x: number, z: number, halfW: number, rotY: number): Obstacle {
  return { id: oid++, kind: 'hedgerow', x, z, r: halfW + 0.4, halfW, halfL: 0.35, rotY, height: 1, isCover: false, mesh: null } as Obstacle;
}

// A cluttered grid: lots of blobs and walls so it splits into many
// pockets, including pockets only joined far below.
function clutteredGrid(rng: Rng, len = 60): NavGrid {
  const g = new NavGrid(0.3, 0.57, -2, len);
  for (let k = 0; k < 70; k++) g.addObstacle(blob(-9 + rng() * 18, rng() * len, 0.2 + rng() * 0.9));
  for (let k = 0; k < 25; k++) g.addObstacle(wall(-9 + rng() * 18, rng() * len, 1 + rng() * 4, rng() < 0.5 ? 0 : Math.PI / 2));
  return g;
}
function randomSeeds(rng: Rng, g: NavGrid, row: number, n: number): Cell[] {
  const out: Cell[] = [];
  for (let k = 0; k < n; k++) out.push({ col: Math.floor(rng() * g.cols), row });
  return out;
}
function sameRows(a: Uint8Array, b: Uint8Array, g: NavGrid, fromRow: number, msg: string) {
  for (let i = fromRow * g.cols; i < g.rows * g.cols; i++) {
    if (a[i] !== b[i]) assert.fail(`${msg}: cell ${i % g.cols},${Math.floor(i / g.cols)} ${a[i]} vs ${b[i]}`);
  }
}

test('flood matches the reference flood on cluttered grids (incl. after trims)', () => {
  const rng = mulberry32(17);
  for (let t = 0; t < 40; t++) {
    const g = clutteredGrid(rng);
    if (t % 3 === 0) g.trimBelow(5 + rng() * 10);
    const row = Math.floor(rng() * g.rows);
    const seeds = randomSeeds(rng, g, row, 1 + Math.floor(rng() * 12));
    const limit = rng() < 0.5 ? g.rows - 1 : row + Math.floor(rng() * (g.rows - row));
    const got = g.flood(seeds, limit);
    const want = referenceFlood(g, seeds, limit);
    assert.equal(got.length, want.length);
    assert.deepEqual(Array.from(got), Array.from(want), `trial ${t}`);
  }
});

test('flood reuses its scratch mask unless given an output buffer', () => {
  const g = clutteredGrid(mulberry32(3));
  const a = g.flood([{ col: 5, row: 4 }]);
  const b = g.flood([{ col: 9, row: 30 }]);
  assert.equal(a.buffer, b.buffer);
  const own = g.newMask();
  const c = g.flood([{ col: 5, row: 4 }], g.rows - 1, own);
  assert.equal(c, own);
});

test('banded flood with row links equals the whole-grid flood above the band floor', () => {
  const rng = mulberry32(99);
  for (let t = 0; t < 60; t++) {
    const g = clutteredGrid(rng, 80);
    const floor = Math.floor(rng() * (g.rows - 20));
    const seedRow = floor + Math.floor(rng() * 15);
    const seeds = randomSeeds(rng, g, seedRow, 1 + Math.floor(rng() * 10));
    const limit = seedRow + Math.floor(rng() * (g.rows - seedRow));
    const links = g.rowLinks(floor);
    const out = g.newMask();
    g.floodBand(seeds, floor, limit, links, out);
    const want = referenceFlood(g, seeds, limit);
    sameRows(out, want, g, floor, `trial ${t}`);
    // Early-exit reachability answer agrees too.
    const target = seedRow + Math.floor(rng() * (limit - seedRow + 1));
    let wantHit = false;
    for (let c = 0; c < g.cols; c++) if (want[target * g.cols + c]) wantHit = true;
    assert.equal(g.floodBand(seeds, floor, limit, links, g.newMask(), target), wantHit, `stop trial ${t}`);
  }
});

test('incrementally extended row links equal links built from scratch', () => {
  const rng = mulberry32(5);
  for (let t = 0; t < 40; t++) {
    const g = clutteredGrid(rng, 80);
    const b1 = Math.floor(rng() * (g.rows / 2));
    const b2 = b1 + Math.floor(rng() * (g.rows / 2));
    const b3 = Math.min(g.rows - 1, b2 + Math.floor(rng() * 40));
    const chained = g.rowLinks(b3, b2, g.rowLinks(b2, b1, g.rowLinks(b1)));
    assert.deepEqual(Array.from(chained), Array.from(g.rowLinks(b3)), `trial ${t}`);
  }
});

test('paintFloor reports the lowest painted row since reset', () => {
  const g = new NavGrid(0.3, 0.57, -2, 40);
  g.resetPaintFloor();
  assert.equal(g.paintFloor, Infinity);
  g.addObstacle(blob(0, 20, 1));
  const r = g.paintFloor;
  assert.ok(r > 0 && r < g.rowOf(20));
  g.addObstacle(blob(0, 30, 1));
  assert.equal(g.paintFloor, r);
});

// Endless-style stream used by the procgen equivalence checks below.
const LEN = CHUNKS_AHEAD * CHUNK_LEN;
function endlessPlan(seed: number): ChunkPlan {
  const levelAtZ = (z: number) => Math.min(30, 1 + Math.floor(Math.max(0, z) / LEN));
  const side: -1 | 1 = (seed & 2) === 0 ? 1 : -1;
  return (i) => ({
    spec: chunkDensityFor(levelAtZ(i * CHUNK_LEN)),
    fork: i % 10 === 8 && forksEnabledFor(levelAtZ(i * CHUNK_LEN)) ? (Math.floor(i / 10) % 2 === 0 ? side : (-side as -1 | 1)) : undefined,
  });
}
function streamSignature(seed: number, metres: number, prefetch: boolean): string {
  const p = new ProcgenSystem(seed, new THREE.Group(), 6, 0, endlessPlan(seed));
  p.init();
  // Every chunk ever generated, keyed by its start (prefetch makes
  // chunks appear earlier; the content must not change).
  const parts = new Map<number, string>();
  let next = 0;
  for (let k = 0; k < 2; k++) {
    p.extendTo((k + 1) * LEN + CHUNK_LEN);
    next = k + 1;
  }
  for (let pz = 0; pz < metres; pz += 5) {
    if (prefetch) p.prefetch((next + 1) * LEN + CHUNK_LEN, 1);
    while (next * LEN < pz + 2 * LEN) {
      p.extendTo((next + 1) * LEN + CHUNK_LEN);
      next++;
    }
    p.trimBefore(Math.min(pz - 50, Math.max(0, (next - 4) * LEN)));
    for (const c of p.gameplayChunks()) {
      if (parts.has(c.startZ) || c.endZ > next * LEN + CHUNK_LEN) continue;
      const s: string[] = [];
      for (const o of c.obstacles) s.push(`${o.kind}${o.x.toFixed(4)},${o.z.toFixed(4)}`);
      for (const k of c.pickups) s.push(`${k.kind}${k.x.toFixed(4)},${k.z.toFixed(4)}`);
      parts.set(c.startZ, s.join(' '));
    }
  }
  p.dispose();
  const keys = [...parts.keys()].sort((a, b) => a - b);
  assert.ok(keys.length > 20);
  return createHash('sha1').update(keys.map((k) => `${k}:${parts.get(k)}`).join('|')).digest('hex');
}

test('Endless generation with banded floods equals whole-grid floods', () => {
  const proto = NavGrid.prototype as unknown as Record<string, unknown>;
  const banded = proto.floodBand as NavGrid['floodBand'];
  for (const seed of [4242, 99]) {
    const fast = streamSignature(seed, 900, false);
    // Old behaviour: every flood walks the whole grid.
    proto.floodBand = function (this: NavGrid, seeds: readonly Cell[], _min: number, limit: number, _l: unknown, out: Uint8Array, stop = -1) {
      const m = referenceFlood(this, seeds, limit);
      out.fill(0);
      out.set(m);
      if (stop < 0) return true;
      for (let c = 0; c < this.cols; c++) if (m[stop * this.cols + c]) return true;
      return false;
    };
    try {
      assert.equal(streamSignature(seed, 900, false), fast, `seed ${seed}`);
    } finally {
      proto.floodBand = banded;
    }
  }
});

test('prefetching chunks over several frames yields the same level as extendTo', () => {
  for (const seed of [7, 2024]) {
    assert.equal(streamSignature(seed, 700, true), streamSignature(seed, 700, false), `seed ${seed}`);
  }
});

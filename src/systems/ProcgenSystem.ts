import * as THREE from 'three';
import type { Chunk, Obstacle, ObstacleKind } from '../types/world';
import { mulberry32, pick, randInt, type Rng } from '../util/rng';
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
  COVER_RADIUS,
  PLAYER_RADIUS,
  PLAY_HALF_W,
} from '../util/geometry';
import {
  NON_COVER_KINDS,
  OBSTACLE_HEIGHT,
  OBSTACLE_RADIUS,
  buildObstacleMesh,
} from '../scenes/Obstacles';

let nextObstacleId = 1;
let nextChunkId = 1;

const SPAWN_X_MIN = -PLAY_HALF_W + 0.7;
const SPAWN_X_MAX = PLAY_HALF_W - 0.7;
const SPACING_BUFFER = 0.6; // extra metres on top of (a.r + b.r)
const SLAB_STEP = 1.0;
const SLAB_HALF_DEPTH = 1.2;
const REQUIRED_GAP_W = PLAYER_RADIUS * 4;

function tooClose(obstacles: Obstacle[], x: number, z: number, r: number): boolean {
  for (const o of obstacles) {
    const dx = o.x - x;
    const dz = o.z - z;
    const minD = o.r + r + SPACING_BUFFER;
    if (dx * dx + dz * dz < minD * minD) return true;
  }
  return false;
}

function placeNonCoverScatter(rng: Rng, obstacles: Obstacle[], startZ: number, count: number) {
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 14 && !placed; attempt++) {
      const kind: ObstacleKind = pick(rng, NON_COVER_KINDS);
      const r = OBSTACLE_RADIUS[kind];
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 1.5 + rng() * (CHUNK_LEN - 3);
      if (tooClose(obstacles, x, z, r)) continue;
      obstacles.push({
        id: nextObstacleId++,
        kind,
        x,
        z,
        r,
        height: OBSTACLE_HEIGHT[kind],
        isCover: false,
        mesh: null,
      });
      placed = true;
    }
  }
}

function placeCoverScatter(rng: Rng, obstacles: Obstacle[], startZ: number, count: number) {
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 14 && !placed; attempt++) {
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 1.5 + rng() * (CHUNK_LEN - 3);
      if (tooClose(obstacles, x, z, COVER_RADIUS)) continue;
      obstacles.push({
        id: nextObstacleId++,
        kind: 'cover',
        x,
        z,
        r: COVER_RADIUS,
        height: OBSTACLE_HEIGHT.cover,
        isCover: true,
        mesh: null,
      });
      placed = true;
    }
  }
}

// Sweep across Z slabs; require at least one X-window of width
// REQUIRED_GAP_W that is free of non-cover obstacles. Cover blocks
// are pass-through, so they don't count as obstructions.
function isSolvable(obstacles: Obstacle[], startZ: number, endZ: number): boolean {
  for (let z = startZ; z <= endZ; z += SLAB_STEP) {
    const blockers: Array<{ lo: number; hi: number }> = [];
    for (const o of obstacles) {
      if (o.isCover) continue;
      if (o.z < z - SLAB_HALF_DEPTH || o.z > z + SLAB_HALF_DEPTH) continue;
      blockers.push({ lo: o.x - o.r - PLAYER_RADIUS, hi: o.x + o.r + PLAYER_RADIUS });
    }
    blockers.sort((a, b) => a.lo - b.lo);
    let cursor = -PLAY_HALF_W;
    let widest = 0;
    for (const b of blockers) {
      if (b.lo > cursor) widest = Math.max(widest, b.lo - cursor);
      cursor = Math.max(cursor, b.hi);
    }
    if (cursor < PLAY_HALF_W) widest = Math.max(widest, PLAY_HALF_W - cursor);
    if (widest < REQUIRED_GAP_W) return false;
  }
  return true;
}

function generateChunkContents(rng: Rng, startZ: number): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const obstacleCount = randInt(rng, 8, 14);
  placeNonCoverScatter(rng, obstacles, startZ, obstacleCount);
  const coverCount = randInt(rng, 2, 5);
  placeCoverScatter(rng, obstacles, startZ, coverCount);
  return obstacles;
}

export function generateChunk(rng: Rng, startZ: number): Chunk {
  for (let attempt = 0; attempt < 5; attempt++) {
    const obstacles = generateChunkContents(rng, startZ);
    if (isSolvable(obstacles, startZ, startZ + CHUNK_LEN)) {
      return {
        id: nextChunkId++,
        startZ,
        endZ: startZ + CHUNK_LEN,
        obstacles,
      };
    }
  }
  return {
    id: nextChunkId++,
    startZ,
    endZ: startZ + CHUNK_LEN,
    obstacles: [],
  };
}

export class ProcgenSystem {
  private chunks: Chunk[] = [];
  private rng: Rng;
  private worldRoot: THREE.Group;

  // Number of chunks the segment will hold. Defaults to the engine
  // baseline (CHUNKS_AHEAD); late stages pass a larger value so
  // segments physically lengthen with difficulty.
  private chunkCount: number;

  constructor(seed: number, worldRoot: THREE.Group, chunkCount: number = CHUNKS_AHEAD) {
    this.rng = mulberry32(seed);
    this.worldRoot = worldRoot;
    this.chunkCount = Math.max(1, chunkCount | 0);
  }

  init() {
    for (let i = 0; i < this.chunkCount; i++) {
      this.spawnChunk(i * CHUNK_LEN);
    }
  }

  private spawnChunk(startZ: number) {
    const chunk = generateChunk(this.rng, startZ);
    for (const o of chunk.obstacles) {
      const m = buildObstacleMesh(o);
      o.mesh = m;
      this.worldRoot.add(m);
    }
    this.chunks.push(chunk);
  }

  private despawnChunk(chunk: Chunk) {
    for (const o of chunk.obstacles) {
      if (o.mesh) this.worldRoot.remove(o.mesh);
    }
  }

  // v1: fixed 5-chunk segment, no recycling.
  update(_playerZ: number) {}

  obstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const c of this.chunks) for (const o of c.obstacles) out.push(o);
    return out;
  }

  endZ(): number {
    return this.chunks.length ? this.chunks[this.chunks.length - 1].endZ : 0;
  }

  dispose() {
    for (const c of this.chunks) this.despawnChunk(c);
    this.chunks = [];
  }
}

import * as THREE from 'three';
import type { Chunk, Obstacle } from '../types/world';
import { mulberry32, pick, randInt, type Rng } from '../util/rng';
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
  COVER_RADIUS,
  OBSTACLE_RADIUS,
  PLAYER_RADIUS,
  PLAY_HALF_W,
} from '../util/geometry';

let nextObstacleId = 1;
let nextChunkId = 1;

const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
const wallGeo = new THREE.BoxGeometry(1.6, 0.6, 0.6);
const coverGeo = new THREE.BoxGeometry(2.0, 1.4, 1.0);

const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3d, roughness: 0.85 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.95 });
const coverMat = new THREE.MeshStandardMaterial({ color: 0x2c3a4d, roughness: 0.9 });

const SPAWN_X_MIN = -PLAY_HALF_W + 0.7;
const SPAWN_X_MAX = PLAY_HALF_W - 0.7;
const MIN_OBSTACLE_GAP = 2.5;
const SLAB_STEP = 1.0;
const SLAB_HALF_DEPTH = 1.2;
const REQUIRED_GAP_W = PLAYER_RADIUS * 4; // ~1.8m walkable corridor at every Z slab

function buildObstacleMesh(o: Obstacle): THREE.Mesh {
  if (o.kind === 'crate') {
    const m = new THREE.Mesh(crateGeo, crateMat);
    m.position.set(o.x, 0.55, o.z);
    return m;
  }
  if (o.kind === 'cover') {
    const m = new THREE.Mesh(coverGeo, coverMat);
    m.position.set(o.x, 0.7, o.z);
    return m;
  }
  const m = new THREE.Mesh(wallGeo, wallMat);
  m.position.set(o.x, 0.3, o.z);
  return m;
}

function tooClose(obstacles: Obstacle[], x: number, z: number): boolean {
  for (const o of obstacles) {
    const dx = o.x - x;
    const dz = o.z - z;
    if (dx * dx + dz * dz < MIN_OBSTACLE_GAP * MIN_OBSTACLE_GAP) return true;
  }
  return false;
}

function placeScatter(
  rng: Rng,
  obstacles: Obstacle[],
  startZ: number,
  count: number,
  kindFn: () => Obstacle['kind'],
  isCover: boolean,
  radius: number,
) {
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 12 && !placed; attempt++) {
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 1.5 + rng() * (CHUNK_LEN - 3);
      if (tooClose(obstacles, x, z)) continue;
      obstacles.push({
        id: nextObstacleId++,
        kind: kindFn(),
        x,
        z,
        r: radius,
        isCover,
        mesh: null,
      });
      placed = true;
    }
  }
}

// Sweep across Z slabs; require at least one X-window of width REQUIRED_GAP_W
// that is free of non-cover obstacles. Cover blocks are pass-through, so they
// don't count as obstructions.
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

  // Scaled to the wider playfield (PLAY_HALF_W = 9 -> 18m across).
  // Density target: visibly populated edge-to-edge without strangling
  // the player's path. Solvability sweep guarantees corridors.
  const obstacleCount = randInt(rng, 10, 16);
  placeScatter(
    rng,
    obstacles,
    startZ,
    obstacleCount,
    () => pick(rng, ['crate', 'lowwall'] as const),
    false,
    OBSTACLE_RADIUS,
  );

  const coverCount = randInt(rng, 2, 5);
  placeScatter(rng, obstacles, startZ, coverCount, () => 'cover', true, COVER_RADIUS);

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

  constructor(seed: number, worldRoot: THREE.Group) {
    this.rng = mulberry32(seed);
    this.worldRoot = worldRoot;
  }

  init() {
    for (let i = 0; i < CHUNKS_AHEAD; i++) {
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

  // v1: fixed 5-chunk segment, no recycling. Multi-segment ships in v2.
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

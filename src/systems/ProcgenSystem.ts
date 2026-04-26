import * as THREE from 'three';
import type { Chunk, Obstacle } from '../types/world';
import { mulberry32, pick, randInt, type Rng } from '../util/rng';
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
  COVER_RADIUS,
  LANES,
  OBSTACLE_RADIUS,
} from '../util/geometry';

let nextObstacleId = 1;
let nextChunkId = 1;

const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
const wallGeo = new THREE.BoxGeometry(1.6, 0.6, 0.6);
const coverGeo = new THREE.BoxGeometry(2.0, 1.4, 1.0);

const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3d, roughness: 0.85 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.95 });
const coverMat = new THREE.MeshStandardMaterial({ color: 0x2c3a4d, roughness: 0.9 });

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

// Solver: simulate a "ghost runner" greedily picking least-blocked lane along the chunk.
// Returns true if the runner can traverse without hitting a non-cover obstacle.
function isSolvable(obstacles: Obstacle[], startZ: number, endZ: number): boolean {
  const stepZ = 1.0;
  let lane = 1; // start middle
  for (let z = startZ; z < endZ; z += stepZ) {
    // Find best lane: prefer current, switch only if blocked.
    const blocked = (l: number) =>
      obstacles.some(
        (o) =>
          !o.isCover &&
          o.lane === l &&
          o.z >= z - 1.2 &&
          o.z <= z + 1.2,
      );
    if (blocked(lane)) {
      const candidates = [lane - 1, lane + 1].filter(
        (l) => l >= 0 && l < LANES.length && !blocked(l),
      );
      if (candidates.length === 0) return false;
      lane = candidates[0];
    }
  }
  return true;
}

function generateChunkContents(rng: Rng, startZ: number): Obstacle[] {
  const obstacles: Obstacle[] = [];
  // ~3 obstacles per chunk + 0–1 cover.
  const obstacleCount = randInt(rng, 2, 5);
  for (let i = 0; i < obstacleCount; i++) {
    const lane = randInt(rng, 0, LANES.length);
    const z = startZ + 4 + (i * (CHUNK_LEN - 8)) / Math.max(1, obstacleCount - 1) + (rng() - 0.5) * 2;
    const kind = pick(rng, ['crate', 'lowwall'] as const);
    obstacles.push({
      id: nextObstacleId++,
      kind,
      lane,
      x: LANES[lane],
      z,
      r: OBSTACLE_RADIUS,
      isCover: false,
      mesh: null,
    });
  }
  if (rng() < 0.7) {
    const lane = randInt(rng, 0, LANES.length);
    const z = startZ + CHUNK_LEN * (0.4 + rng() * 0.4);
    obstacles.push({
      id: nextObstacleId++,
      kind: 'cover',
      lane,
      x: LANES[lane],
      z,
      r: COVER_RADIUS,
      isCover: true,
      mesh: null,
    });
  }
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
  // Last resort: empty chunk.
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

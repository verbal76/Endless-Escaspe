import * as THREE from 'three';
import type { Chunk, Obstacle, ObstacleKind, Pickup, PickupKind } from '../types/world';
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
import { PICKUP_RADIUS, buildPickupMesh } from '../scenes/Pickup';

let nextObstacleId = 1;
let nextChunkId = 1;
let nextPickupId = 1;

const SPAWN_X_MIN = -PLAY_HALF_W + 0.7;
const SPAWN_X_MAX = PLAY_HALF_W - 0.7;
const SPACING_BUFFER = 0.6; // extra metres on top of (a.r + b.r)
const SLAB_STEP = 1.0;
const SLAB_HALF_DEPTH = 1.2;
const REQUIRED_GAP_W = PLAYER_RADIUS * 4;

// Distance gate. The optional `seam` list lets the caller include
// obstacles from the previous chunk so the check spans the chunk
// boundary - otherwise placements at z close to startZ ignored
// neighbours sitting just past z = startZ - epsilon, producing
// impassable choke points across the seam.
function tooClose(
  obstacles: readonly Obstacle[],
  x: number,
  z: number,
  r: number,
  seam?: readonly Obstacle[],
): boolean {
  for (const o of obstacles) {
    const dx = o.x - x;
    const dz = o.z - z;
    const minD = o.r + r + SPACING_BUFFER;
    if (dx * dx + dz * dz < minD * minD) return true;
  }
  if (seam) {
    for (const o of seam) {
      const dx = o.x - x;
      const dz = o.z - z;
      const minD = o.r + r + SPACING_BUFFER;
      if (dx * dx + dz * dz < minD * minD) return true;
    }
  }
  return false;
}

function placeNonCoverScatter(
  rng: Rng,
  obstacles: Obstacle[],
  startZ: number,
  count: number,
  seam?: readonly Obstacle[],
) {
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 14 && !placed; attempt++) {
      const kind: ObstacleKind = pick(rng, NON_COVER_KINDS);
      const r = OBSTACLE_RADIUS[kind];
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 1.5 + rng() * (CHUNK_LEN - 3);
      if (tooClose(obstacles, x, z, r, seam)) continue;
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

function placeCoverScatter(
  rng: Rng,
  obstacles: Obstacle[],
  startZ: number,
  count: number,
  seam?: readonly Obstacle[],
) {
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 14 && !placed; attempt++) {
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 1.5 + rng() * (CHUNK_LEN - 3);
      if (tooClose(obstacles, x, z, COVER_RADIUS, seam)) continue;
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

function generateChunkContents(
  rng: Rng,
  startZ: number,
  seam?: readonly Obstacle[],
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  // Roughly half the prior density (was 8-14 + 2-5 cover). The
  // Kenney prop kit's larger footprints + the bumped car radius
  // were turning the play area into a maze; cutting per-chunk
  // counts lets the player thread between props without constant
  // back-and-forth while keeping enough cover to actually hide
  // behind.
  const obstacleCount = randInt(rng, 4, 8);
  placeNonCoverScatter(rng, obstacles, startZ, obstacleCount, seam);
  const coverCount = randInt(rng, 1, 3);
  placeCoverScatter(rng, obstacles, startZ, coverCount, seam);
  return obstacles;
}

// Crowbar drops are scaled to 90% of an even split with smoke bombs,
// so the kind-pick lands on crowbar 45% of the time and smoke bomb
// 55%. Smoke bombs (vision blocker) are slightly more useful in the
// general case, so weighting them up reads correctly to the player.
const CROWBAR_PICK_THRESHOLD = 0.45;

// Pickups: roll a small count per chunk; place where they don't
// overlap obstacles. Skip the first chunk so the player isn't
// handed a freebie at spawn (and so the very first segment ramps
// the player past at least one bare-handed encounter).
function placePickups(rng: Rng, chunkIndex: number, obstacles: Obstacle[], startZ: number): Pickup[] {
  if (chunkIndex === 0) return [];
  // Roll: 8% chance of zero pickups, 76% one, 16% two. Expected count
  // per chunk = 1.08, which is 10% below the 5/70/25 split we shipped
  // initially.
  const roll = rng();
  const count = roll < 0.08 ? 0 : roll < 0.84 ? 1 : 2;
  const pickups: Pickup[] = [];
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 14 && !placed; attempt++) {
      const kind: PickupKind =
        rng() < CROWBAR_PICK_THRESHOLD ? 'crowbar' : 'smokebomb';
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 2 + rng() * (CHUNK_LEN - 4);
      // Don't drop a pickup on top of an obstacle. We treat the
      // pickup as having radius PICKUP_RADIUS for spacing too so
      // the player can grab it without being stuck inside a crate.
      if (tooClose(obstacles, x, z, PICKUP_RADIUS)) continue;
      // Also don't bunch two pickups on top of each other in the
      // same chunk - cheap distance check against the ones we've
      // already placed in this pass.
      let bunched = false;
      for (const existing of pickups) {
        const dx = existing.x - x;
        const dz = existing.z - z;
        if (dx * dx + dz * dz < 4 * 4) {
          bunched = true;
          break;
        }
      }
      if (bunched) continue;
      pickups.push({
        id: nextPickupId++,
        kind,
        x,
        z,
        r: PICKUP_RADIUS,
        collected: false,
        mesh: null,
      });
      placed = true;
    }
  }
  return pickups;
}

export function generateChunk(
  rng: Rng,
  startZ: number,
  chunkIndex: number,
  seam?: readonly Obstacle[],
): Chunk {
  for (let attempt = 0; attempt < 5; attempt++) {
    const obstacles = generateChunkContents(rng, startZ, seam);
    if (isSolvable(obstacles, startZ, startZ + CHUNK_LEN)) {
      return {
        id: nextChunkId++,
        startZ,
        endZ: startZ + CHUNK_LEN,
        obstacles,
        pickups: placePickups(rng, chunkIndex, obstacles, startZ),
      };
    }
  }
  return {
    id: nextChunkId++,
    startZ,
    endZ: startZ + CHUNK_LEN,
    obstacles: [],
    pickups: [],
  };
}

export class ProcgenSystem {
  private chunks: Chunk[] = [];
  private rng: Rng;
  private worldRoot: THREE.Group;

  // Number of gameplay chunks the segment will hold. Defaults to
  // the engine baseline (CHUNKS_AHEAD); late stages pass a larger
  // value so segments physically lengthen with difficulty.
  private chunkCount: number;

  // Number of cosmetic "horizon" chunks generated past the
  // gameplay end. They render the same obstacle silhouettes the
  // gameplay chunks do, so the path appears to continue toward the
  // mountains instead of stopping at the win line. They contribute
  // no gameplay state - obstacles() / pickups() exclude them.
  private horizonChunks: number;

  constructor(
    seed: number,
    worldRoot: THREE.Group,
    chunkCount: number = CHUNKS_AHEAD,
    horizonChunks: number = 0,
  ) {
    this.rng = mulberry32(seed);
    this.worldRoot = worldRoot;
    this.chunkCount = Math.max(1, chunkCount | 0);
    this.horizonChunks = Math.max(0, horizonChunks | 0);
  }

  init() {
    for (let i = 0; i < this.chunkCount; i++) {
      this.spawnChunk(i, i * CHUNK_LEN, false);
    }
    for (let i = 0; i < this.horizonChunks; i++) {
      const idx = this.chunkCount + i;
      this.spawnChunk(idx, idx * CHUNK_LEN, true);
    }
  }

  private spawnChunk(chunkIndex: number, startZ: number, isHorizon: boolean) {
    // Cross-chunk seam: feed the previous chunk's near-the-boundary
    // obstacles into the placement check so we don't drop a new
    // obstacle within SPACING_BUFFER of one sitting just past the
    // previous chunk's far edge. SEAM_DEPTH is the worst-case
    // obstacle radius (CAR / HEDGE = ~1.35) plus a buffer.
    const SEAM_DEPTH = 3;
    const previous = this.chunks.length > 0 ? this.chunks[this.chunks.length - 1] : null;
    const seam =
      previous && previous.endZ === startZ
        ? previous.obstacles.filter((o) => o.z >= startZ - SEAM_DEPTH)
        : undefined;
    const chunk = generateChunk(this.rng, startZ, chunkIndex, seam);
    if (isHorizon) {
      chunk.isHorizon = true;
      // Strip pickups from horizon chunks - their meshes would tease
      // the player toward something they can never collect (the win
      // line ends the segment first), and the gameplay queries
      // already filter horizon chunks out anyway.
      chunk.pickups = [];
    }
    for (const o of chunk.obstacles) {
      const m = buildObstacleMesh(o);
      o.mesh = m;
      this.worldRoot.add(m);
    }
    for (const p of chunk.pickups) {
      const m = buildPickupMesh(p.kind);
      m.position.set(p.x, 0.08, p.z);
      p.mesh = m;
      this.worldRoot.add(m);
    }
    this.chunks.push(chunk);
  }

  private despawnChunk(chunk: Chunk) {
    for (const o of chunk.obstacles) {
      if (o.mesh) this.worldRoot.remove(o.mesh);
    }
    for (const p of chunk.pickups) {
      if (p.mesh) this.worldRoot.remove(p.mesh);
    }
  }

  // v1: fixed 5-chunk segment, no recycling.
  update(_playerZ: number) {}

  // Gameplay queries skip horizon chunks so their decorative
  // obstacles never block the player's collision pass and never
  // factor into guard line-of-sight. The horizon meshes are
  // already in the scene; they just exist for the eye.
  obstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const c of this.chunks) {
      if (c.isHorizon) continue;
      for (const o of c.obstacles) out.push(o);
    }
    return out;
  }

  pickups(): Pickup[] {
    const out: Pickup[] = [];
    for (const c of this.chunks) {
      if (c.isHorizon) continue;
      for (const p of c.pickups) out.push(p);
    }
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

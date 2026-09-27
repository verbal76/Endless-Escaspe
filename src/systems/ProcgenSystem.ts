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
import { NavGrid, type Cell } from './NavGrid';
import { createPropShadows } from '../scenes/BlobShadows';
import { disposeSubtree } from '../util/dispose';

let nextObstacleId = 1;
let nextChunkId = 1;
let nextPickupId = 1;

const SPAWN_X_MIN = -PLAY_HALF_W + 0.7;
const SPAWN_X_MAX = PLAY_HALF_W - 0.7;
const SPACING_BUFFER = 0.6; // extra metres on top of (a.r + b.r)

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

// Per-spawn hitbox metadata. For elongated obstacles (cars, jersey
// barriers, low walls, hedgerows) we roll a Y rotation up-front and
// store the OBB half-extents + rotation so the player's collision
// can use circle-vs-OBB instead of circle-vs-circle (the bounding
// circle is much wider than the actual silhouette in one axis and
// would block the player ~2 m away from the visible face). Square-
// footprint obstacles (crate, boulder, barrel, tree) leave the OBB
// fields undefined so the collision falls back to the circle.
type ObstacleHitbox = {
  r: number;
  halfW?: number;
  halfL?: number;
  rotY?: number;
  subKind?: 'police' | 'firetruck';
};

function rollObstacleHitbox(kind: ObstacleKind, rng: Rng): ObstacleHitbox {
  if (kind === 'car') {
    // 80/20 police / firetruck. Each has its own OBB; rotation is in
    // 90-deg steps so cars sit length-wise OR width-wise across
    // the path.
    const subKind: 'police' | 'firetruck' = rng() < 0.8 ? 'police' : 'firetruck';
    const halfW = subKind === 'firetruck' ? 1.755 : 1.17;
    const halfL = subKind === 'firetruck' ? 3.98 : 2.42;
    const rotY = (Math.floor(rng() * 4) * Math.PI) / 2;
    // Bounding circle radius (worst-case diagonal) so procgen
    // spacing leaves room for the rotated rectangle.
    const r = Math.hypot(halfW, halfL) + 0.05;
    return { r, halfW, halfL, rotY, subKind };
  }
  if (kind === 'lowwall') {
    // barrierA scaled to 1.6 x 0.6 x 0.6.
    const halfW = 0.8;
    const halfL = 0.3;
    const rotY = rng() < 0.5 ? 0 : Math.PI / 2;
    return { r: Math.hypot(halfW, halfL) + 0.05, halfW, halfL, rotY };
  }
  if (kind === 'cover') {
    // barrierB scaled to 2.0 x 1.4 x 1.0.
    const halfW = 1.0;
    const halfL = 0.5;
    const rotY = rng() < 0.5 ? 0 : Math.PI / 2;
    return { r: Math.hypot(halfW, halfL) + 0.05, halfW, halfL, rotY };
  }
  if (kind === 'hedgerow') {
    // block stretched to 2.6 x 1.1 x 0.7.
    const halfW = 1.3;
    const halfL = 0.35;
    const rotY = rng() < 0.5 ? 0 : Math.PI / 2;
    return { r: Math.hypot(halfW, halfL) + 0.05, halfW, halfL, rotY };
  }
  if (kind === 'crate') {
    // dumpsterClosed scaled 5.2x: 3.12 m wide x 2.39 m deep. OBB
    // so the player can walk up to the actual face; full 2*PI
    // rotation is supported by the OBB collision path.
    const halfW = 1.56;
    const halfL = 1.20;
    const rotY = rng() * Math.PI * 2;
    return { r: Math.hypot(halfW, halfL) + 0.05, halfW, halfL, rotY };
  }
  return { r: OBSTACLE_RADIUS[kind] };
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
      const meta = rollObstacleHitbox(kind, rng);
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 1.5 + rng() * (CHUNK_LEN - 3);
      if (tooClose(obstacles, x, z, meta.r, seam)) continue;
      obstacles.push({
        id: nextObstacleId++,
        kind,
        subKind: meta.subKind,
        x,
        z,
        r: meta.r,
        halfW: meta.halfW,
        halfL: meta.halfL,
        rotY: meta.rotY,
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
      // Cover obstacles use the same elongated barrierB hitbox as the
      // non-cover spawns, so apply the same OBB roll - otherwise the
      // 1.12 m bounding circle would block the player ~0.6 m past
      // the visible face on the short axis.
      const meta = rollObstacleHitbox('cover', rng);
      const x = SPAWN_X_MIN + rng() * (SPAWN_X_MAX - SPAWN_X_MIN);
      const z = startZ + 1.5 + rng() * (CHUNK_LEN - 3);
      if (tooClose(obstacles, x, z, meta.r, seam)) continue;
      obstacles.push({
        id: nextObstacleId++,
        kind: 'cover',
        x,
        z,
        r: meta.r,
        halfW: meta.halfW,
        halfL: meta.halfL,
        rotY: meta.rotY,
        height: OBSTACLE_HEIGHT.cover,
        isCover: true,
        mesh: null,
      });
      placed = true;
    }
  }
}

// Per-chunk population ranges. Pack-5 difficulty scaling feeds a
// denser spec for later stages; the default is the original tuning.
export type ChunkSpec = {
  obstacleMin: number;
  obstacleMax: number; // exclusive
  coverMin: number;
  coverMax: number; // exclusive
};
export const DEFAULT_CHUNK_SPEC: ChunkSpec = {
  obstacleMin: 4,
  obstacleMax: 8,
  coverMin: 1,
  coverMax: 3,
};

function generateChunkContents(
  rng: Rng,
  startZ: number,
  spec: ChunkSpec,
  // 0..1 thinning applied on retry attempts so a crowded roll that
  // keeps failing the walkability check converges instead of giving
  // up and leaving the chunk empty.
  thin: number,
  seam?: readonly Obstacle[],
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const obstacleCount = Math.round(randInt(rng, spec.obstacleMin, spec.obstacleMax) * (1 - thin));
  placeNonCoverScatter(rng, obstacles, startZ, obstacleCount, seam);
  const coverCount = Math.max(1, Math.round(randInt(rng, spec.coverMin, spec.coverMax) * (1 - thin * 0.5)));
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
function placePickups(
  rng: Rng,
  chunkIndex: number,
  obstacles: Obstacle[],
  startZ: number,
  reachable: (x: number, z: number) => boolean,
): Pickup[] {
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
      // Only on ground the player can actually walk to.
      if (!reachable(x, z)) continue;
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

// Walkability context shared across the chunks of one segment (or
// one Endless run). `grid` holds every gameplay obstacle rasterised
// at the player's radius; `seeds` are grid cells already proven
// reachable from spawn, sitting in rows that no future chunk can
// alter (future obstacles start at least 1.5 m into their own chunk
// and are at most ~3 m in radius, so they never reach more than
// SEED_BACKOFF below their chunk's start).
export type Walkability = {
  grid: NavGrid;
  seeds: Cell[];
};
const SEED_BACKOFF = 2.5;
const SOLVE_CELL = 0.3;
const SOLVE_MARGIN = 0.12;

export function createWalkability(spawnX: number, spawnZ: number, zMin: number, zMax: number): Walkability {
  // A little wider than the player so accepted paths aren't
  // pixel-tight squeezes between two props.
  const grid = new NavGrid(SOLVE_CELL, PLAYER_RADIUS + SOLVE_MARGIN, zMin, zMax);
  return { grid, seeds: [{ col: grid.colOf(spawnX), row: grid.rowOf(spawnZ) }] };
}

// Try to populate a chunk so that the player can still walk from the
// proven-reachable seeds to the chunk's far edge. Every obstacle kind
// - cover included - is rasterised with its real footprint (OBB for
// elongated props), which is exactly what PlayerController collides
// against. Returns the chunk plus the reachability mask of the
// successful flood so pickups can be placed on reachable ground.
export function generateChunk(
  rng: Rng,
  startZ: number,
  chunkIndex: number,
  seam: readonly Obstacle[] | undefined,
  walk: Walkability,
  spec: ChunkSpec = DEFAULT_CHUNK_SPEC,
): Chunk {
  const endZ = startZ + CHUNK_LEN;
  const grid = walk.grid;
  grid.extendTo(endZ + 1);
  const endRow = grid.rowOf(endZ - 0.01);
  const ATTEMPTS = 8;
  for (let attempt = 0; attempt <= ATTEMPTS; attempt++) {
    // Final attempt is deliberately empty: always walkable because
    // the previous chunk was proven to reach this chunk's start.
    const obstacles =
      attempt === ATTEMPTS
        ? []
        : generateChunkContents(rng, startZ, spec, Math.min(0.75, attempt * 0.12), seam);
    for (const o of obstacles) grid.addObstacle(o);
    const reach = grid.flood(walk.seeds, endRow);
    let reachesEnd = false;
    for (let c = 0; c < grid.cols; c++) {
      if (reach[endRow * grid.cols + c]) {
        reachesEnd = true;
        break;
      }
    }
    if (!reachesEnd) {
      for (const o of obstacles) grid.removeObstacle(o);
      continue;
    }
    const pickups = placePickups(rng, chunkIndex, obstacles, startZ, (x, z) => {
      const col = grid.colOf(x);
      const row = grid.rowOf(z);
      return reach[row * grid.cols + col] === 1 && Math.abs(grid.colX(col) - x) < grid.cell;
    });
    // Advance the proven-reachable seed row to just below the next
    // chunk's earliest possible footprint.
    const seedRow = grid.rowOf(endZ - SEED_BACKOFF);
    const next: Cell[] = [];
    for (let c = 0; c < grid.cols; c++) {
      if (reach[seedRow * grid.cols + c]) next.push({ col: c, row: seedRow });
    }
    // Seeds from this flood are only sound if the flood didn't need
    // rows above the seed row, which future chunks may alter. Re-run
    // it capped at the seed row; fall back to the uncapped result if
    // (unusually) the capped fill loses every cell.
    const capped = grid.flood(walk.seeds, seedRow);
    const safe: Cell[] = [];
    for (let c = 0; c < grid.cols; c++) {
      if (capped[seedRow * grid.cols + c]) safe.push({ col: c, row: seedRow });
    }
    walk.seeds = safe.length > 0 ? safe : next;
    return {
      id: nextChunkId++,
      startZ,
      endZ,
      obstacles,
      pickups,
    };
  }
  // Unreachable: the empty attempt always succeeds.
  throw new Error('procgen: empty chunk failed walkability');
}

// Guard / dog navigation grid resolution and clearance radius.
export const NAV_CELL = 0.5;
// Deliberately a little larger than the movers' collision radius
// (GUARD_MOVE_RADIUS / dog radius) so a path through free cell centres
// never scrapes a prop corner between two cells.
export const NAV_INFLATE = 0.7;
// Player spawn point; the walkability flood starts here.
export const SPAWN_X = 0;
export const SPAWN_Z = 1;
export const PLAYFIELD_BACK_Z = -2;

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

  private spec: ChunkSpec;
  private walk: Walkability;
  // Pathfinding grid for guards and dogs (gameplay obstacles only).
  readonly nav: NavGrid;
  // Cached gameplay query results. Rebuilt only when chunks change,
  // so the per-frame callers don't allocate fresh arrays.
  private obstacleCache: Obstacle[] = [];
  private pickupCache: Pickup[] = [];

  constructor(
    seed: number,
    worldRoot: THREE.Group,
    chunkCount: number = CHUNKS_AHEAD,
    horizonChunks: number = 0,
    spec: ChunkSpec = DEFAULT_CHUNK_SPEC,
  ) {
    this.rng = mulberry32(seed);
    this.worldRoot = worldRoot;
    this.chunkCount = Math.max(1, chunkCount | 0);
    this.horizonChunks = Math.max(0, horizonChunks | 0);
    this.spec = spec;
    const zMax = this.chunkCount * CHUNK_LEN + 2;
    this.walk = createWalkability(SPAWN_X, SPAWN_Z, PLAYFIELD_BACK_Z, zMax);
    this.nav = new NavGrid(NAV_CELL, NAV_INFLATE, PLAYFIELD_BACK_Z, zMax);
  }

  init() {
    for (let i = 0; i < this.chunkCount; i++) {
      this.spawnChunk(i, i * CHUNK_LEN, false);
    }
    for (let i = 0; i < this.horizonChunks; i++) {
      const idx = this.chunkCount + i;
      this.spawnChunk(idx, idx * CHUNK_LEN, true);
    }
    this.rebuildCaches();
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
    let chunk: Chunk;
    if (isHorizon) {
      // Horizon chunks are scenery only (excluded from collision), so
      // they skip the walkability check and carry no pickups - their
      // meshes would tease the player toward something they can never
      // collect.
      const obstacles = generateChunkContents(this.rng, startZ, this.spec, 0, seam);
      chunk = { id: nextChunkId++, startZ, endZ: startZ + CHUNK_LEN, obstacles, pickups: [], isHorizon: true };
    } else {
      chunk = generateChunk(this.rng, startZ, chunkIndex, seam, this.walk, this.spec);
      this.nav.extendTo(chunk.endZ + 1);
      for (const o of chunk.obstacles) this.nav.addObstacle(o);
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
    chunk.shadow = createPropShadows(chunk.obstacles);
    if (chunk.shadow) this.worldRoot.add(chunk.shadow);
    this.chunks.push(chunk);
  }

  // Detach AND free a chunk's meshes. (Previously meshes were only
  // detached here, before the scene-level dispose walk ran, so every
  // obstacle's per-instance GPU buffers leaked on each rebuild -
  // roughly 2000 geometries per stage change.)
  private despawnChunk(chunk: Chunk) {
    for (const o of chunk.obstacles) {
      if (o.mesh) {
        this.worldRoot.remove(o.mesh);
        disposeSubtree(o.mesh);
        o.mesh = null;
      }
    }
    for (const p of chunk.pickups) {
      if (p.mesh) {
        this.worldRoot.remove(p.mesh);
        disposeSubtree(p.mesh);
        p.mesh = null;
      }
    }
    if (chunk.shadow) {
      this.worldRoot.remove(chunk.shadow);
      (chunk.shadow as THREE.InstancedMesh).dispose?.();
      chunk.shadow = null;
    }
  }

  private rebuildCaches() {
    this.obstacleCache = [];
    this.pickupCache = [];
    for (const c of this.chunks) {
      if (c.isHorizon) continue;
      for (const o of c.obstacles) this.obstacleCache.push(o);
      for (const p of c.pickups) this.pickupCache.push(p);
    }
  }

  // Fixed-length campaign segments don't recycle chunks.
  update(_playerZ: number) {}

  // Gameplay queries skip horizon chunks so their decorative
  // obstacles never block the player's collision pass and never
  // factor into guard line-of-sight. The horizon meshes are
  // already in the scene; they just exist for the eye. Both return
  // a cached array - callers must not mutate it.
  obstacles(): readonly Obstacle[] {
    return this.obstacleCache;
  }

  pickups(): readonly Pickup[] {
    return this.pickupCache;
  }

  endZ(): number {
    return this.chunks.length ? this.chunks[this.chunks.length - 1].endZ : 0;
  }

  // Test / debug hook: the gameplay chunks in order.
  gameplayChunks(): readonly Chunk[] {
    return this.chunks.filter((c) => !c.isHorizon);
  }

  dispose() {
    for (const c of this.chunks) this.despawnChunk(c);
    this.chunks = [];
    this.rebuildCaches();
  }
}

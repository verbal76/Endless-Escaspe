import * as THREE from 'three';
import type { Chunk, ForkInfo, Obstacle, ObstacleKind, Pickup, PickupKind } from '../types/world';
import { mulberry32, pick, randInt, type Rng } from '../util/rng';
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
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
import { batchStaticMeshes } from '../scenes/StaticBatch';
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
const CROWBAR_PICK_THRESHOLD = 0.35;
const SMOKE_PICK_THRESHOLD = 0.75; // 35% crowbar / 40% smoke / 25% rock

function rollPickupKind(rng: Rng): PickupKind {
  const r = rng();
  return r < CROWBAR_PICK_THRESHOLD ? 'crowbar' : r < SMOKE_PICK_THRESHOLD ? 'smokebomb' : 'rock';
}

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
      const kind = rollPickupKind(rng);
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
//
// `links` caches how the cells of one row (`row`, at grid origin
// `zMin`) are joined through every row below it (NavGrid.rowLinks), so
// a chunk's walkability floods only walk a band of ~100 rows above it
// instead of the whole retained grid (Endless keeps several hundred
// metres). The answers are identical to whole-grid floods: the band
// floods treat linked cells as connected, and the cache is rebuilt
// whenever the rows under it change (a paint at or below `row`, or a
// trim that moves the grid origin).
export type Walkability = {
  grid: NavGrid;
  seeds: Cell[];
  links?: { row: number; zMin: number; labels: Int32Array } | null;
  masks?: { reach: Uint8Array; probe: Uint8Array };
};
const SEED_BACKOFF = 2.5;
const SOLVE_CELL = 0.3;
const SOLVE_MARGIN = 0.12;
// Band floor below a chunk's start. Must clear the deepest footprint a
// chunk's own obstacles can paint below its start (a car rolled 90 deg
// at startZ + 1.5 reaches ~3.1 m below once inflated); if one ever does
// reach it, generateChunk notices via paintFloor and floods the whole
// grid for that chunk instead.
const BAND_BACKOFF = 6;

export function createWalkability(spawnX: number, spawnZ: number, zMin: number, zMax: number): Walkability {
  // A little wider than the player so accepted paths aren't
  // pixel-tight squeezes between two props.
  const grid = new NavGrid(SOLVE_CELL, PLAYER_RADIUS + SOLVE_MARGIN, zMin, zMax);
  return { grid, seeds: [{ col: grid.colOf(spawnX), row: grid.rowOf(spawnZ) }], links: null };
}

// Labels for row `floorRow` (see Walkability.links), extended from the
// cached row when the rows under it are unchanged, else rebuilt.
function linksFor(walk: Walkability, floorRow: number): Int32Array {
  const grid = walk.grid;
  const cached = walk.links;
  let labels: Int32Array;
  if (cached && cached.zMin === grid.zMin && cached.row <= floorRow && grid.paintFloor > cached.row) {
    labels = cached.row === floorRow ? cached.labels : grid.rowLinks(floorRow, cached.row, cached.labels);
  } else {
    labels = grid.rowLinks(floorRow);
  }
  walk.links = { row: floorRow, zMin: grid.zMin, labels };
  grid.resetPaintFloor();
  return labels;
}

// Try to populate a chunk so that the player can still walk from the
// proven-reachable seeds to the chunk's far edge. Every obstacle kind
// - cover included - is rasterised with its real footprint (OBB for
// elongated props), which is exactly what PlayerController collides
// against. Returns the chunk plus the reachability mask of the
// successful flood so pickups can be placed on reachable ground.
function makeObstacle(kind: ObstacleKind, x: number, z: number, rotY: number, isCover: boolean): Obstacle {
  const halfW = kind === 'hedgerow' ? 1.3 : kind === 'cover' ? 1.0 : 0.8;
  const halfL = kind === 'hedgerow' ? 0.35 : kind === 'cover' ? 0.5 : 0.3;
  return {
    id: nextObstacleId++,
    kind,
    x,
    z,
    r: Math.hypot(halfW, halfL) + 0.05,
    halfW,
    halfL,
    rotY,
    height: OBSTACLE_HEIGHT[kind],
    isCover,
    mesh: null,
  };
}

// Fork layout: a wall of hedgerows down the middle for most of the
// chunk. Danger lane: straight and open (the game puts a guard post
// in it and it gets extra pickups). Safe lane: barriers alternately
// jut out from the divider and from the fence, forcing a slalom that
// roughly doubles the walking distance through the chunk.
const FORK_WALL_START = 1.5;
const FORK_WALL_END = CHUNK_LEN - 1.5;

function forkContents(startZ: number, dangerSide: -1 | 1): { obstacles: Obstacle[]; fork: ForkInfo } {
  const obstacles: Obstacle[] = [];
  const piece = 2.6;
  for (let z = startZ + FORK_WALL_START + piece / 2; z <= startZ + FORK_WALL_END - piece / 2 + 0.01; z += piece) {
    obstacles.push(makeObstacle('hedgerow', 0, z, Math.PI / 2, false));
  }
  const safe = -dangerSide;
  // Slalom gates on the safe side (x from 0 to +-9).
  const gates: Array<[number, 'inner' | 'outer']> = [
    [5, 'inner'],
    [11.5, 'outer'],
    [18, 'inner'],
  ];
  for (const [dz, where] of gates) {
    const z = startZ + dz;
    const xs = where === 'inner' ? [1.65, 4.25] : [5.95, 8.4];
    for (const ax of xs) obstacles.push(makeObstacle('hedgerow', safe * ax, z, 0, false));
  }
  return {
    obstacles,
    fork: {
      dangerSide,
      startZ,
      endZ: startZ + CHUNK_LEN,
      postX: dangerSide * 4.6,
      postZ: startZ + 15,
    },
  };
}

export type ChunkOptions = { spec?: ChunkSpec; fork?: -1 | 1 };

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
  opts: ChunkOptions = {},
): Chunk {
  const spec = opts.spec ?? DEFAULT_CHUNK_SPEC;
  const endZ = startZ + CHUNK_LEN;
  const grid = walk.grid;
  grid.extendTo(endZ + 1);
  const endRow = grid.rowOf(endZ - 0.01);
  const reaches = (mask: Uint8Array) => {
    for (let c = 0; c < grid.cols; c++) if (mask[endRow * grid.cols + c]) return true;
    return false;
  };
  // Floods walk only the band above floorRow (see Walkability.links);
  // the masks are reused across chunks.
  let floorRow = grid.rowOf(startZ - BAND_BACKOFF);
  for (const sd of walk.seeds) if (sd.row < floorRow) floorRow = Math.max(0, sd.row);
  const links = linksFor(walk, floorRow);
  const n = grid.rows * grid.cols;
  if (!walk.masks || walk.masks.reach.length < n) {
    walk.masks = { reach: new Uint8Array(Math.ceil(n * 1.25)), probe: new Uint8Array(Math.ceil(n * 1.25)) };
  }
  const { reach, probe } = walk.masks;
  // Mask of everything reachable from the seeds within rows <= limit.
  // Falls back to a whole-grid flood if this chunk painted at or below
  // the band floor (then the cached links no longer describe it).
  const floodTo = (limit: number, out: Uint8Array) => {
    if (grid.paintFloor > floorRow) grid.floodBand(walk.seeds, floorRow, limit, links, out);
    else grid.flood(walk.seeds, limit, out);
  };
  const reachesEnd = (): boolean => {
    if (grid.paintFloor > floorRow) return grid.floodBand(walk.seeds, floorRow, endRow, links, probe, endRow);
    return reaches(grid.flood(walk.seeds, endRow, probe));
  };
  const ATTEMPTS = 8;
  for (let attempt = 0; attempt <= ATTEMPTS; attempt++) {
    let obstacles: Obstacle[];
    let fork: ForkInfo | undefined;
    if (opts.fork && attempt < ATTEMPTS) {
      const f = forkContents(startZ, opts.fork);
      obstacles = f.obstacles;
      fork = f.fork;
    } else {
      // Final attempt is deliberately empty: always walkable because
      // the previous chunk was proven to reach this chunk's start.
      obstacles =
        attempt === ATTEMPTS
          ? []
          : generateChunkContents(rng, startZ, spec, Math.min(0.75, attempt * 0.12), seam);
    }
    for (const o of obstacles) grid.addObstacle(o);
    floodTo(endRow, reach);
    let ok = reaches(reach);
    if (ok && fork) {
      // Both lanes must be passable on their own: block each lane in
      // turn and re-check.
      for (const side of [-1, 1] as const) {
        const plug = makeObstacle('hedgerow', side * 4.5, fork.postZ - 3, 0, false);
        plug.halfW = 4.6;
        plug.halfL = 0.4;
        plug.r = Math.hypot(4.6, 0.4);
        grid.addObstacle(plug);
        const alone = reachesEnd();
        grid.removeObstacle(plug);
        if (!alone) ok = false;
      }
    }
    if (!ok) {
      for (const o of obstacles) grid.removeObstacle(o);
      // A fork that can't be made walkable (neighbouring props from
      // the previous chunk) falls back to a normal chunk.
      if (opts.fork) opts = { ...opts, fork: undefined };
      continue;
    }
    let pickups = placePickups(rng, chunkIndex, obstacles, startZ, (x, z) => {
      const col = grid.colOf(x);
      const row = grid.rowOf(z);
      return reach[row * grid.cols + col] === 1 && Math.abs(grid.colX(col) - x) < grid.cell;
    });
    if (fork) {
      // The danger lane's reward: two pickups on the straight path.
      pickups = [
        { id: nextPickupId++, kind: 'rock', x: fork.dangerSide * 4.6, z: startZ + 8, r: PICKUP_RADIUS, collected: false, mesh: null },
        { id: nextPickupId++, kind: rollPickupKind(rng), x: fork.dangerSide * 3.2, z: startZ + 20, r: PICKUP_RADIUS, collected: false, mesh: null },
      ];
    }
    // Advance the proven-reachable seed row to just below the next
    // chunk's earliest possible footprint. Seeds must only use rows no
    // future chunk can alter, so the flood is re-run capped at the
    // seed row; fall back to the uncapped result if (unusually) the
    // capped fill loses every cell.
    const seedRow = grid.rowOf(endZ - SEED_BACKOFF);
    const next: Cell[] = [];
    for (let c = 0; c < grid.cols; c++) {
      if (reach[seedRow * grid.cols + c]) next.push({ col: c, row: seedRow });
    }
    floodTo(seedRow, probe);
    const safe: Cell[] = [];
    for (let c = 0; c < grid.cols; c++) {
      if (probe[seedRow * grid.cols + c]) safe.push({ col: c, row: seedRow });
    }
    walk.seeds = safe.length > 0 ? safe : next;
    return {
      id: nextChunkId++,
      startZ,
      endZ,
      obstacles,
      pickups,
      fork,
    };
  }
  // Unreachable: the empty attempt always succeeds.
  throw new Error('procgen: empty chunk failed walkability');
}

// Distance culling of whole chunks (ProcgenSystem.updateVisibility).
// The camera trails the player 8 m back, 7 m up, and can yaw at most
// 45 deg, so it never sees behind CULL_BEHIND. CULL_AHEAD is where a
// prop is down to a few pixels and well into the fog.
export const CULL_AHEAD = 140;
export const CULL_BEHIND = 40;
// Props reach a little past their chunk's ends (a car's OBB is ~4.4 m).
const CULL_MARGIN = 5;

// Is any part of a chunk [startZ, endZ] inside the drawn range around
// viewZ? null = culling not started: everything is drawn.
export function chunkVisible(
  c: { startZ: number; endZ: number },
  viewZ: number | null,
  ahead: number = CULL_AHEAD,
  behind: number = CULL_BEHIND,
): boolean {
  if (viewZ === null) return true;
  return c.startZ - CULL_MARGIN <= viewZ + ahead && c.endZ + CULL_MARGIN >= viewZ - behind;
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

// Per-chunk plan supplied by the caller (campaign: fixed for the
// segment; Endless: rises with distance).
export type ChunkPlan = (chunkIndex: number) => ChunkOptions;

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

  private plan: ChunkPlan;
  private walk: Walkability;
  // Pathfinding grid for guards and dogs (gameplay obstacles only).
  readonly nav: NavGrid;
  // Cached gameplay query results. Rebuilt only when chunks change,
  // so the per-frame callers don't allocate fresh arrays.
  private obstacleCache: Obstacle[] = [];
  private pickupCache: Pickup[] = [];
  // Next gameplay chunk index / start Z (streaming).
  private nextIndex = 0;
  private nextZ = 0;

  constructor(
    seed: number,
    worldRoot: THREE.Group,
    chunkCount: number = CHUNKS_AHEAD,
    horizonChunks: number = 0,
    plan: ChunkPlan | ChunkSpec = DEFAULT_CHUNK_SPEC,
  ) {
    this.rng = mulberry32(seed);
    this.worldRoot = worldRoot;
    this.chunkCount = Math.max(1, chunkCount | 0);
    this.horizonChunks = Math.max(0, horizonChunks | 0);
    this.plan = typeof plan === 'function' ? plan : () => ({ spec: plan });
    const zMax = this.chunkCount * CHUNK_LEN + 2;
    this.walk = createWalkability(SPAWN_X, SPAWN_Z, PLAYFIELD_BACK_Z, zMax);
    this.nav = new NavGrid(NAV_CELL, NAV_INFLATE, PLAYFIELD_BACK_Z, zMax);
  }

  init() {
    for (let i = 0; i < this.chunkCount; i++) this.appendGameplayChunk();
    for (let i = 0; i < this.horizonChunks; i++) {
      const idx = this.chunkCount + i;
      this.spawnChunk(idx, idx * CHUNK_LEN, true);
    }
    this.rebuildCaches();
  }

  private appendGameplayChunk() {
    this.spawnChunk(this.nextIndex, this.nextZ, false);
    this.nextIndex++;
    this.nextZ += CHUNK_LEN;
  }

  // Start of the oldest chunk still generated (Endless trims behind the
  // player, so this is the earliest ground that still exists).
  startZ(): number {
    return this.chunks[0]?.startZ ?? 0;
  }

  // Endless mode: keep gameplay chunks generated through `z`.
  // Returns the chunks added (so the caller can populate guards etc).
  extendTo(z: number): Chunk[] {
    const added: Chunk[] = [];
    while (this.nextZ < z) {
      this.appendGameplayChunk();
      added.push(this.chunks[this.chunks.length - 1]);
    }
    if (added.length) this.rebuildCaches();
    return added;
  }

  // Endless mode, time-sliced: generate at most `maxChunks` of the
  // chunks a later extendTo(z) would add, so a section's generation can
  // be spread over frames before the section is needed. Chunks come out
  // in the same order from the same RNG, so the level is identical to
  // calling extendTo(z) in one go. Returns true while chunks are still
  // missing below `z`.
  prefetch(z: number, maxChunks: number = 1): boolean {
    let made = 0;
    while (this.nextZ < z && made < maxChunks) {
      this.appendGameplayChunk();
      made++;
    }
    if (made) this.rebuildCaches();
    return this.nextZ < z;
  }

  // Endless mode: free chunks that end before `z` (well behind the
  // player) and the grid rows under them.
  trimBefore(z: number) {
    let removed = false;
    while (this.chunks.length > 1 && this.chunks[0].endZ < z && !this.chunks[0].isHorizon) {
      const c = this.chunks.shift() as Chunk;
      this.despawnChunk(c);
      removed = true;
    }
    if (!removed) return;
    const first = this.chunks[0]?.startZ ?? z;
    this.nav.trimBelow(first - 4);
    // Keep the walkability grid's seed rows intact.
    let minSeedZ = Infinity;
    for (const sd of this.walk.seeds) minSeedZ = Math.min(minSeedZ, this.walk.grid.rowZ(sd.row));
    const cut = Math.min(first - 4, minSeedZ - 2);
    const before = this.walk.grid.zMin;
    this.walk.grid.trimBelow(cut);
    const shift = Math.round((this.walk.grid.zMin - before) / this.walk.grid.cell);
    if (shift > 0) this.walk.seeds = this.walk.seeds.map((c) => ({ col: c.col, row: c.row - shift }));
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
    const opts = this.plan(chunkIndex);
    if (isHorizon) {
      // Horizon chunks are scenery only (excluded from collision), so
      // they skip the walkability check and carry no pickups - their
      // meshes would tease the player toward something they can never
      // collect.
      const obstacles = generateChunkContents(this.rng, startZ, opts.spec ?? DEFAULT_CHUNK_SPEC, 0, seam);
      chunk = { id: nextChunkId++, startZ, endZ: startZ + CHUNK_LEN, obstacles, pickups: [], isHorizon: true };
    } else {
      chunk = generateChunk(this.rng, startZ, chunkIndex, seam, this.walk, opts);
      this.nav.extendTo(chunk.endZ + 1);
      for (const o of chunk.obstacles) this.nav.addObstacle(o);
    }
    // Everything the chunk draws hangs off one group: far chunks are
    // hidden as a whole (updateVisibility) and despawn frees one tree.
    const root = new THREE.Group();
    root.name = 'chunk';
    this.worldRoot.add(root);
    chunk.root = root;
    const props: THREE.Object3D[] = [];
    for (const o of chunk.obstacles) {
      const m = buildObstacleMesh(o);
      o.mesh = m;
      root.add(m);
      props.push(m);
    }
    // One instanced draw per prop part instead of one per prop.
    batchStaticMeshes(root, props);
    for (const p of chunk.pickups) {
      const m = buildPickupMesh(p.kind);
      m.position.set(p.x, 0.08, p.z);
      p.mesh = m;
      root.add(m);
    }
    chunk.shadow = createPropShadows(chunk.obstacles);
    if (chunk.shadow) root.add(chunk.shadow);
    root.visible = chunkVisible(chunk, this.viewZ);
    this.chunks.push(chunk);
  }

  // Distance culling. Chunks wholly beyond CULL_AHEAD in front of the
  // player (or CULL_BEHIND behind) are hidden: past that range a prop
  // is a few pixels tall, yet they were ~45 % of all draw calls. Call
  // once per frame with the player's Z (cheap: one compare per chunk).
  updateVisibility(playerZ: number) {
    this.viewZ = playerZ;
    for (const c of this.chunks) {
      if (!c.root) continue;
      const v = chunkVisible(c, playerZ);
      if (c.root.visible !== v) c.root.visible = v;
    }
  }
  private viewZ: number | null = null;

  // Detach AND free a chunk's meshes. (Previously meshes were only
  // detached here, before the scene-level dispose walk ran, so every
  // obstacle's per-instance GPU buffers leaked on each rebuild -
  // roughly 2000 geometries per stage change.)
  private despawnChunk(chunk: Chunk) {
    // A pickup collected moments ago may still be fading out under the
    // chunk group; the game holds it and removes it itself.
    for (const p of chunk.pickups) {
      if (p.mesh) {
        p.mesh.parent?.remove(p.mesh);
        disposeSubtree(p.mesh);
        p.mesh = null;
      }
    }
    if (chunk.root) {
      this.worldRoot.remove(chunk.root);
      // Frees the instanced batches and per-chunk shadow buffers;
      // shared template geometry / materials are skipped.
      disposeSubtree(chunk.root);
      chunk.root = null;
    }
    for (const o of chunk.obstacles) o.mesh = null;
    chunk.shadow = null;
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

  // Campaign segments are generated up front; Endless streams via
  // extendTo / trimBefore.
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

  forks(): ForkInfo[] {
    const out: ForkInfo[] = [];
    for (const c of this.chunks) if (c.fork && !c.isHorizon) out.push(c.fork);
    return out;
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

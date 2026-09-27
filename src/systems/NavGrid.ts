import type { Obstacle } from '../types/world';
import { PLAY_HALF_W } from '../util/geometry';

// Occupancy grid over the playfield (XZ plane). Each cell is marked
// blocked when its centre sits within `inflate` metres of an
// obstacle's real footprint (OBB when the obstacle has one, circle
// otherwise), so a mover of radius `inflate` can stand on any free
// cell centre without overlapping an obstacle.
//
// Two consumers:
//   - Procgen solvability: flood-fill from spawn to the segment end
//     using the player's radius, so a layout is only accepted when a
//     real walkable path exists (cover props included - they block
//     movement just like every other prop).
//   - Guard / dog navigation: A* over a guard-radius grid so pursuers
//     route around props instead of wedging against them.
//
// Rows grow on demand (extendTo) and can be trimmed from the back
// (trimBelow) so Endless mode can keep a rolling window.

export type Cell = { col: number; row: number };

export class NavGrid {
  readonly cell: number;
  readonly inflate: number;
  readonly xMin: number;
  readonly cols: number;
  // World Z of row 0's lower edge.
  zMin: number;
  rows = 0;
  private blocked: Uint8Array = new Uint8Array(0);

  constructor(cell: number, inflate: number, zMin: number, zMax: number, halfW: number = PLAY_HALF_W) {
    this.cell = cell;
    this.inflate = inflate;
    // Movers are clamped to +/-(halfW - inflate); cells outside that
    // are never walkable, so the grid simply doesn't include them.
    const usable = Math.max(cell, halfW - inflate);
    this.xMin = -usable;
    this.cols = Math.max(1, Math.floor((usable * 2) / cell) + 1);
    this.zMin = zMin;
    this.extendTo(zMax);
  }

  colX(col: number): number {
    return this.xMin + col * this.cell;
  }
  rowZ(row: number): number {
    return this.zMin + (row + 0.5) * this.cell;
  }
  colOf(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.round((x - this.xMin) / this.cell)));
  }
  rowOf(z: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.zMin) / this.cell)));
  }
  zMax(): number {
    return this.zMin + this.rows * this.cell;
  }

  extendTo(zMax: number) {
    const want = Math.max(this.rows, Math.ceil((zMax - this.zMin) / this.cell));
    if (want === this.rows) return;
    const next = new Uint8Array(want * this.cols);
    next.set(this.blocked);
    this.blocked = next;
    this.rows = want;
  }

  // Drop whole rows below world z (Endless mode rolling window).
  trimBelow(z: number) {
    const drop = Math.floor((z - this.zMin) / this.cell);
    if (drop <= 0 || drop >= this.rows) return;
    this.blocked = this.blocked.slice(drop * this.cols);
    this.rows -= drop;
    this.zMin += drop * this.cell;
  }

  isBlocked(col: number, row: number): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
    return this.blocked[row * this.cols + col] > 0;
  }

  isFreeAt(x: number, z: number): boolean {
    const col = Math.round((x - this.xMin) / this.cell);
    const row = Math.floor((z - this.zMin) / this.cell);
    return !this.isBlocked(col, row);
  }

  // Rasterise an obstacle footprint (inflated by this grid's radius).
  // Counts rather than flags so removeObstacle can undo exactly.
  addObstacle(o: Obstacle) {
    this.paint(o, 1);
  }
  removeObstacle(o: Obstacle) {
    this.paint(o, -1);
  }

  private paint(o: Obstacle, delta: number) {
    const reach = o.r + this.inflate;
    const c0 = Math.max(0, Math.floor((o.x - reach - this.xMin) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.ceil((o.x + reach - this.xMin) / this.cell));
    const r0 = Math.max(0, Math.floor((o.z - reach - this.zMin) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.ceil((o.z + reach - this.zMin) / this.cell));
    const inflSq = this.inflate * this.inflate;
    const hasObb = o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined;
    const cosR = hasObb ? Math.cos(-(o.rotY as number)) : 1;
    const sinR = hasObb ? Math.sin(-(o.rotY as number)) : 0;
    const circleSq = (o.r + this.inflate) * (o.r + this.inflate);
    for (let row = r0; row <= r1; row++) {
      const z = this.rowZ(row);
      for (let col = c0; col <= c1; col++) {
        const x = this.colX(col);
        const dx = x - o.x;
        const dz = z - o.z;
        let hit: boolean;
        if (hasObb) {
          const lx = dx * cosR - dz * sinR;
          const lz = dx * sinR + dz * cosR;
          const cx = Math.max(-(o.halfW as number), Math.min(o.halfW as number, lx));
          const cz = Math.max(-(o.halfL as number), Math.min(o.halfL as number, lz));
          const ex = lx - cx;
          const ez = lz - cz;
          hit = ex * ex + ez * ez <= inflSq;
        } else {
          hit = dx * dx + dz * dz <= circleSq;
        }
        if (!hit) continue;
        const i = row * this.cols + col;
        this.blocked[i] = Math.max(0, this.blocked[i] + delta);
      }
    }
  }

  // Breadth-first flood from every free cell within `seeds`. Returns
  // a visited mask (1 = reachable). 4-connected so the fill never
  // squeezes diagonally between two touching footprints.
  flood(seeds: readonly Cell[], rowLimit: number = this.rows - 1): Uint8Array {
    const visited = new Uint8Array(this.rows * this.cols);
    const queue = new Int32Array(this.rows * this.cols);
    let head = 0;
    let tail = 0;
    for (const s of seeds) {
      if (s.row > rowLimit || this.isBlocked(s.col, s.row)) continue;
      const i = s.row * this.cols + s.col;
      if (visited[i]) continue;
      visited[i] = 1;
      queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++];
      const row = (i / this.cols) | 0;
      const col = i - row * this.cols;
      const tryPush = (c: number, r: number) => {
        if (c < 0 || c >= this.cols || r < 0 || r > rowLimit) return;
        const j = r * this.cols + c;
        if (visited[j] || this.blocked[j] > 0) return;
        visited[j] = 1;
        queue[tail++] = j;
      };
      tryPush(col + 1, row);
      tryPush(col - 1, row);
      tryPush(col, row + 1);
      tryPush(col, row - 1);
    }
    return visited;
  }

  // Nearest free cell to (x, z), searched in growing square rings up
  // to maxRing cells out. Null if everything nearby is blocked.
  nearestFree(x: number, z: number, maxRing: number = 12): Cell | null {
    const c0 = this.colOf(x);
    const r0 = this.rowOf(z);
    if (!this.isBlocked(c0, r0)) return { col: c0, row: r0 };
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: Cell | null = null;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (this.isBlocked(c, r)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = { col: c, row: r };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // A* from (sx, sz) to (tx, tz). 8-connected without corner cutting.
  // The search is limited to a padded bounding box around start and
  // goal and to maxExpand node expansions so a pathological query
  // can't stall a frame. Returns world-space waypoints (excluding the
  // start cell). When the goal can't be reached inside the budget the
  // path leads to the closest cell found instead; null only when no
  // progress at all is possible.
  findPath(
    sx: number,
    sz: number,
    tx: number,
    tz: number,
    maxExpand: number = 3000,
    pad: number = 10,
  ): Array<{ x: number; z: number }> | null {
    const start = this.nearestFree(sx, sz, 4);
    const goal = this.nearestFree(tx, tz, 8);
    if (!start || !goal) return null;
    if (start.col === goal.col && start.row === goal.row) {
      return [{ x: this.colX(goal.col), z: this.rowZ(goal.row) }];
    }
    const padCells = Math.ceil(pad / this.cell);
    const minC = Math.max(0, Math.min(start.col, goal.col) - padCells);
    const maxC = Math.min(this.cols - 1, Math.max(start.col, goal.col) + padCells);
    const minR = Math.max(0, Math.min(start.row, goal.row) - padCells);
    const maxR = Math.min(this.rows - 1, Math.max(start.row, goal.row) + padCells);
    const w = maxC - minC + 1;
    const h = maxR - minR + 1;
    const n = w * h;
    const g = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    // Binary heap of (f, index).
    const heapF: number[] = [];
    const heapI: number[] = [];
    const push = (f: number, i: number) => {
      let k = heapF.length;
      heapF.push(f);
      heapI.push(i);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p] <= f) break;
        heapF[k] = heapF[p];
        heapI[k] = heapI[p];
        k = p;
      }
      heapF[k] = f;
      heapI[k] = i;
    };
    const pop = (): number => {
      const top = heapI[0];
      const lastF = heapF.pop() as number;
      const lastI = heapI.pop() as number;
      const len = heapF.length;
      if (len > 0) {
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          if (l >= len) break;
          const r = l + 1;
          const c = r < len && heapF[r] < heapF[l] ? r : l;
          if (heapF[c] >= lastF) break;
          heapF[k] = heapF[c];
          heapI[k] = heapI[c];
          k = c;
        }
        heapF[k] = lastF;
        heapI[k] = lastI;
      }
      return top;
    };
    const idx = (c: number, r: number) => (r - minR) * w + (c - minC);
    const hCost = (c: number, r: number) => {
      const dc = Math.abs(c - goal.col);
      const dr = Math.abs(r - goal.row);
      return dc + dr + (Math.SQRT2 - 2) * Math.min(dc, dr);
    };
    const si = idx(start.col, start.row);
    const gi = idx(goal.col, goal.row);
    g[si] = 0;
    push(hCost(start.col, start.row), si);
    let expanded = 0;
    let found = false;
    // Closest node to the goal seen so far, so an unreachable goal
    // (e.g. the player squeezed through a gap too narrow for a guard)
    // still yields a path to the nearest approachable spot.
    let bestI = si;
    let bestH = hCost(start.col, start.row);
    while (heapF.length > 0 && expanded < maxExpand) {
      const i = pop();
      if (closed[i]) continue;
      closed[i] = 1;
      expanded++;
      if (i === gi) {
        found = true;
        break;
      }
      const r = minR + ((i / w) | 0);
      const c = minC + (i % w);
      const hi = hCost(c, r);
      if (hi < bestH) {
        bestH = hi;
        bestI = i;
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < minC || nc > maxC || nr < minR || nr > maxR) continue;
          if (this.isBlocked(nc, nr)) continue;
          // No corner cutting past a blocked orthogonal neighbour.
          if (dr !== 0 && dc !== 0 && (this.isBlocked(c + dc, r) || this.isBlocked(c, r + dr))) {
            continue;
          }
          const j = idx(nc, nr);
          if (closed[j]) continue;
          const ng = g[i] + (dr !== 0 && dc !== 0 ? Math.SQRT2 : 1);
          if (ng < g[j]) {
            g[j] = ng;
            parent[j] = i;
            push(ng + hCost(nc, nr), j);
          }
        }
      }
    }
    const endI = found ? gi : bestI;
    if (endI === si) return null;
    const out: Array<{ x: number; z: number }> = [];
    let cur = endI;
    while (cur !== si && cur >= 0) {
      const r = minR + ((cur / w) | 0);
      const c = minC + (cur % w);
      out.push({ x: this.colX(c), z: this.rowZ(r) });
      cur = parent[cur];
    }
    out.reverse();
    return simplifyPath(this, sx, sz, out);
  }

  // True when the straight segment between two points only crosses
  // free cells (sampled at half-cell spacing).
  segmentClear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!this.isFreeAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }
}

// String-pulling: drop waypoints that are directly visible from the
// previous kept point so movers walk straight lines instead of
// staircase grid steps.
function simplifyPath(
  grid: NavGrid,
  sx: number,
  sz: number,
  pts: Array<{ x: number; z: number }>,
): Array<{ x: number; z: number }> {
  if (pts.length <= 1) return pts;
  const out: Array<{ x: number; z: number }> = [];
  let ax = sx;
  let az = sz;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !grid.segmentClear(ax, az, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]);
    ax = pts[j].x;
    az = pts[j].z;
    i = j + 1;
  }
  return out;
}

export function buildNavGrid(
  obstacles: readonly Obstacle[],
  cell: number,
  inflate: number,
  zMin: number,
  zMax: number,
): NavGrid {
  const grid = new NavGrid(cell, inflate, zMin, zMax);
  for (const o of obstacles) grid.addObstacle(o);
  return grid;
}

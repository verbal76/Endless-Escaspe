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
    if (r0 <= r1 && r0 < this.paintFloor) this.paintFloor = r0;
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
  //
  // Allocation-free: the mask is written into `out` when given, else
  // into a scratch buffer owned by the grid that the NEXT flood call
  // overwrites - copy it (or pass your own `out`) to keep it.
  flood(seeds: readonly Cell[], rowLimit: number = this.rows - 1, out?: Uint8Array): Uint8Array {
    const mask = this.maskBuffer(out);
    this.fill(seeds, 0, rowLimit, null, mask, -1);
    const n = this.rows * this.cols;
    return mask.length === n ? mask : mask.subarray(0, n);
  }

  // A mask buffer big enough for flood / floodBand output right now.
  newMask(): Uint8Array {
    return new Uint8Array(this.rows * this.cols);
  }

  // flood() restricted to rows [rowMin, rowLimit]. `links` (one entry
  // per column of row rowMin, from rowLinks) says which cells of row
  // rowMin are joined to each other through the rows below it, so the
  // mask equals flood()'s on every row >= rowMin while the fill only
  // walks the band. Rows below rowMin are left 0. With stopRow >= 0 the
  // fill stops as soon as a cell of that row is reached (the mask is
  // then partial); the return value says whether it was.
  floodBand(
    seeds: readonly Cell[],
    rowMin: number,
    rowLimit: number,
    links: Int32Array | null,
    out: Uint8Array,
    stopRow: number = -1,
  ): boolean {
    return this.fill(seeds, rowMin, rowLimit, links, this.maskBuffer(out), stopRow);
  }

  // Connectivity labels for the free cells of `row`, under 4-connected
  // movement within rows [baseRow, row]; cells of baseRow that share a
  // non-negative `baseLinks` label count as already joined (through
  // rows below baseRow). out[col] is the lowest column of that cell's
  // component on `row`, or -1 when the cell is blocked. baseRow 0 with
  // no baseLinks is plain connectivity over every row up to `row`.
  rowLinks(row: number, baseRow: number = 0, baseLinks: Int32Array | null = null, out?: Int32Array): Int32Array {
    const cols = this.cols;
    const labels = out && out.length === cols ? out : new Int32Array(cols);
    labels.fill(-1);
    if (row < 0 || row >= this.rows) return labels;
    const mask = this.maskBuffer(undefined);
    mask.fill(0);
    const expanded = this.expandedScratch();
    const seed: Cell[] = [{ col: 0, row }];
    for (let c = 0; c < cols; c++) {
      const i = row * cols + c;
      if (this.blocked[i] > 0 || mask[i]) continue;
      seed[0].col = c;
      // Components never share cells (or base labels), so one mask and
      // one expanded set serve every component of this call.
      this.fillInto(seed, baseRow, row, baseLinks, mask, -1, expanded, c, labels);
    }
    return labels;
  }

  // Lowest row painted (by add/removeObstacle) since the last
  // resetPaintFloor(); Infinity when none was. Lets a caller holding
  // rowLinks() labels check that the rows under them did not change.
  paintFloor = Infinity;
  resetPaintFloor() {
    this.paintFloor = Infinity;
  }

  private scratchMask: Uint8Array = new Uint8Array(0);
  private scratchQueue: Int32Array = new Int32Array(0);
  private scratchExpanded: Uint8Array = new Uint8Array(0);

  private maskBuffer(out: Uint8Array | undefined): Uint8Array {
    const n = this.rows * this.cols;
    if (out) {
      if (out.length < n) throw new Error('NavGrid: flood output buffer too small');
      return out;
    }
    if (this.scratchMask.length < n) this.scratchMask = new Uint8Array(n);
    return this.scratchMask;
  }

  private expandedScratch(): Uint8Array {
    if (this.scratchExpanded.length < this.cols) this.scratchExpanded = new Uint8Array(this.cols);
    this.scratchExpanded.fill(0);
    return this.scratchExpanded;
  }

  private fill(
    seeds: readonly Cell[],
    rowMin: number,
    rowLimit: number,
    links: Int32Array | null,
    mask: Uint8Array,
    stopRow: number,
  ): boolean {
    mask.fill(0);
    return this.fillInto(seeds, rowMin, rowLimit, links, mask, stopRow, links ? this.expandedScratch() : null, -1, null);
  }

  // The BFS behind flood / floodBand / rowLinks: inline neighbour
  // checks (no per-cell closure) and a reused queue. Every cell is
  // queued at most once, so the queue never outgrows the grid.
  private fillInto(
    seeds: readonly Cell[],
    rowMin: number,
    rowLimit: number,
    links: Int32Array | null,
    mask: Uint8Array,
    stopRow: number,
    expanded: Uint8Array | null,
    label: number,
    labels: Int32Array | null,
  ): boolean {
    const cols = this.cols;
    const blocked = this.blocked;
    const n = this.rows * cols;
    if (this.scratchQueue.length < n) this.scratchQueue = new Int32Array(n);
    const queue = this.scratchQueue;
    if (rowLimit > this.rows - 1) rowLimit = this.rows - 1;
    if (rowMin < 0) rowMin = 0;
    const lo = rowMin * cols;
    const hi = (rowLimit + 1) * cols; // exclusive
    const linkLo = links ? lo : -1;
    const linkHi = links ? lo + cols : -1;
    const labelLo = labels ? rowLimit * cols : -1;
    const labelHi = labels ? labelLo + cols : -1;
    const stopLo = stopRow >= 0 ? stopRow * cols : -1;
    const stopHi = stopRow >= 0 ? stopLo + cols : -1;
    let head = 0;
    let tail = 0;
    for (let k = 0; k < seeds.length; k++) {
      const s = seeds[k];
      if (s.row > rowLimit || s.row < rowMin || s.col < 0 || s.col >= cols) continue;
      const i = s.row * cols + s.col;
      if (mask[i] || blocked[i] > 0) continue;
      mask[i] = 1;
      queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++];
      if (i >= stopLo && i < stopHi) return true;
      if (labels && i >= labelLo && i < labelHi) labels[i - labelLo] = label;
      const col = i % cols;
      let j: number;
      if (col + 1 < cols) {
        j = i + 1;
        if (mask[j] === 0 && blocked[j] === 0) {
          mask[j] = 1;
          queue[tail++] = j;
        }
      }
      if (col > 0) {
        j = i - 1;
        if (mask[j] === 0 && blocked[j] === 0) {
          mask[j] = 1;
          queue[tail++] = j;
        }
      }
      j = i + cols;
      if (j < hi && mask[j] === 0 && blocked[j] === 0) {
        mask[j] = 1;
        queue[tail++] = j;
      }
      j = i - cols;
      if (j >= lo && mask[j] === 0 && blocked[j] === 0) {
        mask[j] = 1;
        queue[tail++] = j;
      }
      // Joined through the rows below the band: reaching one cell of a
      // linked group reaches all of them.
      if (links && expanded && i >= linkLo && i < linkHi) {
        const l = links[i - linkLo];
        if (l >= 0 && expanded[l] === 0) {
          expanded[l] = 1;
          for (let c = 0; c < cols; c++) {
            if (links[c] !== l) continue;
            j = linkLo + c;
            if (mask[j] === 0 && blocked[j] === 0) {
              mask[j] = 1;
              queue[tail++] = j;
            }
          }
        }
      }
    }
    return stopRow < 0;
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

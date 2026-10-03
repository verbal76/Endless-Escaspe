import { circleHit, circleHitObb } from '../../../../../../../home/user/Endless-Escaspe/src/util/collision';
import { PLAYER_RADIUS, PLAY_HALF_W } from '../../../../../../../home/user/Endless-Escaspe/src/util/geometry';
import type { Obstacle } from '../../../../../../../home/user/Endless-Escaspe/src/types/world';
// Bucketed version of tests/helpers.playerCanReach (same exact collision rules).
export function reachMask(obstacles: readonly Obstacle[], spawnX: number, spawnZ: number, zMin: number, zMax: number, step = 0.2) {
  const B = 4; const buckets = new Map<number, Obstacle[]>();
  for (const o of obstacles) { const a = Math.floor((o.z - o.r - 1) / B), b = Math.floor((o.z + o.r + 1) / B); for (let k = a; k <= b; k++) { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k)!.push(o); } }
  const hits = (x: number, z: number) => {
    const list = buckets.get(Math.floor(z / B)); if (!list) return false;
    for (const o of list) {
      if (Math.abs(o.z - z) > o.r + 1 || Math.abs(o.x - x) > o.r + 1) continue;
      if (o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined) { if (circleHitObb({ x, z, r: PLAYER_RADIUS }, { x: o.x, z: o.z, halfW: o.halfW, halfL: o.halfL, rotY: o.rotY })) return true; }
      else if (circleHit({ x, z, r: PLAYER_RADIUS }, { x: o.x, z: o.z, r: o.r })) return true;
    }
    return false;
  };
  const xLim = PLAY_HALF_W - PLAYER_RADIUS;
  const cols = Math.floor((2 * xLim) / step) + 1;
  const rows = Math.ceil((zMax - zMin) / step) + 1;
  const X = (c: number) => -xLim + c * step; const Z = (r: number) => zMin + r * step;
  const seen = new Uint8Array(cols * rows);
  const c0 = Math.round((spawnX + xLim) / step), r0 = Math.round((spawnZ - zMin) / step);
  const q: number[] = [];
  if (!hits(X(c0), Z(r0))) { seen[r0 * cols + c0] = 1; q.push(r0 * cols + c0); }
  while (q.length) {
    const i = q.pop()!; const r = (i / cols) | 0; const c = i % cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr; if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const j = nr * cols + nc; if (seen[j]) continue;
      if (hits(X(nc), Z(nr)) || hits((X(c) + X(nc)) / 2, (Z(r) + Z(nr)) / 2)) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return { seen, cols, rows, X, Z, step, zMin, hits,
    maxReachedZ() { for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) if (seen[r * cols + c]) return Z(r); return -Infinity; },
    at(x: number, z: number, rad = 0) { // any reached lattice point within rad
      const cs = Math.round((x + xLim) / step), rs = Math.round((z - zMin) / step), k = Math.ceil(rad / step) + 1;
      for (let r = rs - k; r <= rs + k; r++) for (let c = cs - k; c <= cs + k; c++) { if (r < 0 || c < 0 || r >= rows || c >= cols) continue; if (seen[r * cols + c] && Math.hypot(X(c) - x, Z(r) - z) <= rad + step * 0.75) return true; }
      return false; } };
}

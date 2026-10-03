import type { Obstacle } from '../src/types/world';
import { circleHit, circleHitObb } from '../src/util/collision';
import { PLAYER_RADIUS, PLAY_HALF_W } from '../src/util/geometry';

// Independent walkability oracle: BFS over a fine lattice using the
// exact collision tests PlayerController uses (circle / OBB at the
// player's radius), including the midpoint of every step. Returns
// true if the player can get from spawn to z >= endZ.
export function playerCanReach(
  obstacles: readonly Obstacle[],
  spawnX: number,
  spawnZ: number,
  goal: number | ((x: number, z: number) => boolean),
  step = 0.2,
): boolean {
  const endZ = typeof goal === 'number' ? goal : 400;
  const isGoal =
    typeof goal === 'number' ? (_x: number, z: number) => z >= goal - step : goal;
  const hits = (x: number, z: number) => {
    for (const o of obstacles) {
      if (Math.abs(o.z - z) > o.r + 1 || Math.abs(o.x - x) > o.r + 1) continue;
      if (o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined) {
        if (circleHitObb({ x, z, r: PLAYER_RADIUS }, { x: o.x, z: o.z, halfW: o.halfW, halfL: o.halfL, rotY: o.rotY })) return true;
      } else if (circleHit({ x, z, r: PLAYER_RADIUS }, { x: o.x, z: o.z, r: o.r })) {
        return true;
      }
    }
    return false;
  };
  const xLim = PLAY_HALF_W - PLAYER_RADIUS;
  const cols = Math.floor((2 * xLim) / step) + 1;
  const zMin = -2;
  const rows = Math.ceil((endZ - zMin) / step) + 1;
  const X = (c: number) => -xLim + c * step;
  const Z = (r: number) => zMin + r * step;
  const seen = new Uint8Array(cols * rows);
  const q: number[] = [];
  const c0 = Math.round((spawnX + xLim) / step);
  const r0 = Math.round((spawnZ - zMin) / step);
  if (hits(X(c0), Z(r0))) return false;
  seen[r0 * cols + c0] = 1;
  q.push(r0 * cols + c0);
  while (q.length) {
    const i = q.pop() as number;
    const r = (i / cols) | 0;
    const c = i % cols;
    if (isGoal(X(c), Z(r))) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const j = nr * cols + nc;
      if (seen[j]) continue;
      const mx = (X(c) + X(nc)) / 2;
      const mz = (Z(r) + Z(nr)) / 2;
      if (hits(X(nc), Z(nr)) || hits(mx, mz)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return false;
}

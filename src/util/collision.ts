import { dist2Sq } from './math';
import type { Obstacle } from '../types/world';

export type Circle = { x: number; z: number; r: number };

// Oriented bounding box: centre + per-axis half-extents in the OBB's
// local frame, plus the Y rotation that frame is applied at. Used for
// elongated obstacles (cars, jersey barriers, low walls, hedgerows)
// where a circular hitbox either lets the player clip into the long
// ends or blocks them with a ghost bumper on the short ends.
export type Obb = { x: number; z: number; halfW: number; halfL: number; rotY: number };

export const circleHit = (a: Circle, b: Circle) => {
  const sum = a.r + b.r;
  return dist2Sq(a.x, a.z, b.x, b.z) <= sum * sum;
};

// Circle-vs-OBB hit test. Transforms the circle centre into the OBB's
// local frame, clamps to find the closest box-interior point, and
// compares squared distance against the circle's radius. Returns true
// on overlap.
export function circleHitObb(c: Circle, o: Obb): boolean {
  const dx = c.x - o.x;
  const dz = c.z - o.z;
  const cosR = Math.cos(-o.rotY);
  const sinR = Math.sin(-o.rotY);
  const localX = dx * cosR - dz * sinR;
  const localZ = dx * sinR + dz * cosR;
  const closestX = Math.max(-o.halfW, Math.min(o.halfW, localX));
  const closestZ = Math.max(-o.halfL, Math.min(o.halfL, localZ));
  const ddx = localX - closestX;
  const ddz = localZ - closestZ;
  return ddx * ddx + ddz * ddz <= c.r * c.r;
}

// Eject a circle from the OBB along the shortest separation axis.
// Returns the corrected (x, z) the caller should snap to. If the
// circle isn't actually overlapping the OBB, returns the input
// position unchanged.
export function pushCircleFromObb(
  cx: number,
  cz: number,
  cr: number,
  o: Obb,
): { x: number; z: number } {
  const dx = cx - o.x;
  const dz = cz - o.z;
  const cosR = Math.cos(-o.rotY);
  const sinR = Math.sin(-o.rotY);
  const localX = dx * cosR - dz * sinR;
  const localZ = dx * sinR + dz * cosR;
  const insideX = localX > -o.halfW && localX < o.halfW;
  const insideZ = localZ > -o.halfL && localZ < o.halfL;
  let pushX = localX;
  let pushZ = localZ;
  if (insideX && insideZ) {
    // Circle centre is fully inside the OBB - eject along whichever
    // box face is closest.
    const overX = o.halfW - Math.abs(localX);
    const overZ = o.halfL - Math.abs(localZ);
    if (overX < overZ) {
      pushX = (localX < 0 ? -o.halfW : o.halfW) - cr * Math.sign(localX || 1);
      // Snap just outside the face (with a tiny epsilon so subsequent
      // checks don't immediately re-detect overlap).
      pushX = (localX < 0 ? -1 : 1) * (o.halfW + cr + 0.001);
    } else {
      pushZ = (localZ < 0 ? -1 : 1) * (o.halfL + cr + 0.001);
    }
  } else {
    // Circle centre is outside the box on at least one axis. Closest
    // point on the box is the clamped (localX, localZ); push outward
    // along the vector from that point to the centre.
    const closestX = Math.max(-o.halfW, Math.min(o.halfW, localX));
    const closestZ = Math.max(-o.halfL, Math.min(o.halfL, localZ));
    const ddx = localX - closestX;
    const ddz = localZ - closestZ;
    const distSq = ddx * ddx + ddz * ddz;
    if (distSq >= cr * cr) {
      // Already clear.
      return { x: cx, z: cz };
    }
    const dist = Math.sqrt(Math.max(distSq, 0.0001));
    pushX = closestX + (ddx / dist) * (cr + 0.001);
    pushZ = closestZ + (ddz / dist) * (cr + 0.001);
  }
  // Rotate back to world frame.
  const cosBack = Math.cos(o.rotY);
  const sinBack = Math.sin(o.rotY);
  const worldDx = pushX * cosBack - pushZ * sinBack;
  const worldDz = pushX * sinBack + pushZ * cosBack;
  return { x: o.x + worldDx, z: o.z + worldDz };
}

// Returns true if a ray from (sx,sz) toward (tx,tz) reaches its endpoint
// without intersecting any of the blocker circles.
export function lineOfSightClear(
  sx: number,
  sz: number,
  tx: number,
  tz: number,
  blockers: readonly Circle[],
): boolean {
  const dx = tx - sx;
  const dz = tz - sz;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return true;
  for (const b of blockers) {
    const fx = sx - b.x;
    const fz = sz - b.z;
    const a = lenSq;
    const bb = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - b.r * b.r;
    const disc = bb * bb - 4 * a * c;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    const t1 = (-bb - sq) / (2 * a);
    const t2 = (-bb + sq) / (2 * a);
    if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) return false;
  }
  return true;
}

// Real-footprint overlap test for a circular mover against one
// obstacle: circle-vs-OBB for elongated props (cars, barriers,
// dumpsters), circle-vs-circle otherwise. Shared by the player, the
// guards and the dogs so everything collides with the same shapes
// the navigation grid rasterises.
export function obstacleHitsCircle(o: Obstacle, x: number, z: number, r: number): boolean {
  if (o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined) {
    // Cheap reject before the rotation maths.
    const reach = o.r + r;
    if (Math.abs(o.x - x) > reach || Math.abs(o.z - z) > reach) return false;
    return circleHitObb({ x, z, r }, { x: o.x, z: o.z, halfW: o.halfW, halfL: o.halfL, rotY: o.rotY });
  }
  return circleHit({ x, z, r }, { x: o.x, z: o.z, r: o.r });
}

export function anyObstacleHitsCircle(
  obstacles: readonly Obstacle[],
  x: number,
  z: number,
  r: number,
): boolean {
  for (const o of obstacles) {
    if (obstacleHitsCircle(o, x, z, r)) return true;
  }
  return false;
}

// Does the segment A->B pass through the obstacle's footprint? Used
// for line of sight and bullets so both respect the same silhouettes
// the player collides with (OBB for elongated props). `shrink` pulls
// the footprint in slightly so grazing an edge doesn't count.
export function segmentHitsObstacle(
  o: Obstacle,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  shrink: number = 0,
): boolean {
  if (o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined) {
    const hw = o.halfW - shrink;
    const hl = o.halfL - shrink;
    if (hw <= 0 || hl <= 0) return false;
    const cosR = Math.cos(-o.rotY);
    const sinR = Math.sin(-o.rotY);
    const ax0 = ax - o.x;
    const az0 = az - o.z;
    const bx0 = bx - o.x;
    const bz0 = bz - o.z;
    const lax = ax0 * cosR - az0 * sinR;
    const laz = ax0 * sinR + az0 * cosR;
    const lbx = bx0 * cosR - bz0 * sinR;
    const lbz = bx0 * sinR + bz0 * cosR;
    // Liang-Barsky slab clip against [-hw,hw] x [-hl,hl].
    let t0 = 0;
    let t1 = 1;
    const dx = lbx - lax;
    const dz = lbz - laz;
    const clip = (p: number, q: number): boolean => {
      if (p === 0) return q >= 0;
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
      return true;
    };
    return (
      clip(-dx, lax + hw) &&
      clip(dx, hw - lax) &&
      clip(-dz, laz + hl) &&
      clip(dz, hl - laz) &&
      t0 <= t1
    );
  }
  const r = o.r - shrink;
  if (r <= 0) return false;
  return !lineOfSightClear(ax, az, bx, bz, [{ x: o.x, z: o.z, r }]);
}

// True if no obstacle at least `minHeight` tall blocks A->B.
export function clearLine(
  obstacles: readonly Obstacle[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minHeight: number,
  shrink: number = 0.05,
): boolean {
  const loX = Math.min(ax, bx);
  const hiX = Math.max(ax, bx);
  const loZ = Math.min(az, bz);
  const hiZ = Math.max(az, bz);
  for (const o of obstacles) {
    if (o.height < minHeight) continue;
    if (o.x + o.r < loX || o.x - o.r > hiX || o.z + o.r < loZ || o.z - o.r > hiZ) continue;
    if (segmentHitsObstacle(o, ax, az, bx, bz, shrink)) return false;
  }
  return true;
}

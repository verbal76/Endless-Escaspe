import { dist2Sq } from './math';

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

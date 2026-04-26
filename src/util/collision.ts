import { dist2Sq } from './math';

export type Circle = { x: number; z: number; r: number };

export const circleHit = (a: Circle, b: Circle) => {
  const sum = a.r + b.r;
  return dist2Sq(a.x, a.z, b.x, b.z) <= sum * sum;
};

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

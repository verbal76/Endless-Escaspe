import * as THREE from 'three';
import { markShared } from '../util/dispose';
import { PLAYER_X_LIMIT } from '../util/geometry';

// A thrown distraction: flies in an arc from the player to a point
// ahead, then "lands" (the game makes noise there that draws guards).
// Pooled: at most a couple in flight at once.

export const THROW_DISTANCE = 9;
export const THROW_TIME = 0.6;
// Guards within this radius of the landing point hear it.
export const THROW_HEAR_RADIUS = 14;

const ROCK_GEO = markShared(new THREE.DodecahedronGeometry(0.16, 0));
const ROCK_MAT = markShared(new THREE.MeshLambertMaterial({ color: 0x8b8680, emissive: 0x222222, emissiveIntensity: 0.3 }));

export type ThrownRock = {
  mesh: THREE.Mesh;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  t: number;
  active: boolean;
};

export function createRockPool(root: THREE.Object3D, size: number = 2): ThrownRock[] {
  const out: ThrownRock[] = [];
  for (let i = 0; i < size; i++) {
    const mesh = new THREE.Mesh(ROCK_GEO, ROCK_MAT);
    mesh.visible = false;
    root.add(mesh);
    out.push({ mesh, fromX: 0, fromZ: 0, toX: 0, toZ: 0, t: 0, active: false });
  }
  return out;
}

// Where a throw from (x, z) facing (dirX, dirZ) lands: THROW_DISTANCE
// ahead, kept inside the fences.
export function throwTarget(x: number, z: number, dirX: number, dirZ: number): { x: number; z: number } {
  const len = Math.hypot(dirX, dirZ);
  const ux = len > 1e-3 ? dirX / len : 0;
  const uz = len > 1e-3 ? dirZ / len : 1;
  return {
    x: Math.max(-PLAYER_X_LIMIT, Math.min(PLAYER_X_LIMIT, x + ux * THROW_DISTANCE)),
    z: z + uz * THROW_DISTANCE,
  };
}

export function launchRock(pool: ThrownRock[], fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  const r = pool.find((p) => !p.active);
  if (!r) return false;
  Object.assign(r, { fromX, fromZ, toX, toZ, t: 0, active: true });
  r.mesh.visible = true;
  return true;
}

// Advance flights; calls onLand(x, z) once per rock as it lands.
export function updateRocks(pool: ThrownRock[], dt: number, onLand: (x: number, z: number) => void) {
  for (const r of pool) {
    if (!r.active) continue;
    r.t += dt / THROW_TIME;
    const t = Math.min(1, r.t);
    r.mesh.position.set(
      r.fromX + (r.toX - r.fromX) * t,
      0.9 + 3.2 * t * (1 - t),
      r.fromZ + (r.toZ - r.fromZ) * t,
    );
    r.mesh.rotation.x += dt * 9;
    if (t >= 1) {
      r.active = false;
      r.mesh.visible = false;
      onLand(r.toX, r.toZ);
    }
  }
}

export function clearRocks(pool: ThrownRock[]) {
  for (const r of pool) {
    r.active = false;
    r.mesh.visible = false;
  }
}

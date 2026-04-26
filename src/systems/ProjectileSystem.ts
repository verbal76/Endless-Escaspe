import * as THREE from 'three';
import type { Player, Projectile } from '../types/world';
import { circleHit } from '../util/collision';
import { PLAYER_RADIUS, PLAY_HALF_W } from '../util/geometry';

const PROJECTILE_SPEED = 12;
const PROJECTILE_LIFE = 1.5;
const PROJECTILE_R = 0.18;
const HIT_RADIUS = 0.4;

let nextProjectileId = 1;

const projectileGeo = new THREE.SphereGeometry(PROJECTILE_R, 8, 8);
const projectileMat = new THREE.MeshStandardMaterial({
  color: 0xff5544,
  emissive: 0xff2222,
  emissiveIntensity: 0.6,
  roughness: 0.4,
});

export class ProjectileSystem {
  private worldRoot: THREE.Group;
  private projectiles: Projectile[] = [];

  constructor(worldRoot: THREE.Group) {
    this.worldRoot = worldRoot;
  }

  spawn(fromX: number, fromZ: number, targetX: number, targetZ: number) {
    const dx = targetX - fromX;
    const dz = targetZ - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    const mesh = new THREE.Mesh(projectileGeo, projectileMat);
    mesh.position.set(fromX, 0.9, fromZ);
    this.worldRoot.add(mesh);
    this.projectiles.push({
      id: nextProjectileId++,
      x: fromX,
      z: fromZ,
      vx: (dx / len) * PROJECTILE_SPEED,
      vz: (dz / len) * PROJECTILE_SPEED,
      life: PROJECTILE_LIFE,
      mesh,
    });
  }

  // Integrate, cull, and report whether anything hit the player this tick.
  // The caller owns the catch flow (heart loss, restart, runState).
  update(dt: number, p: Player): boolean {
    let hit = false;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.life -= dt;
      if (pr.mesh) {
        pr.mesh.position.x = pr.x;
        pr.mesh.position.z = pr.z;
      }

      const hitPlayer = circleHit(
        { x: pr.x, z: pr.z, r: HIT_RADIUS },
        { x: p.x, z: p.z, r: PLAYER_RADIUS },
      );
      const outOfBounds = Math.abs(pr.x) > PLAY_HALF_W + 1;
      if (hitPlayer) hit = true;
      if (hitPlayer || outOfBounds || pr.life <= 0) {
        if (pr.mesh) this.worldRoot.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }
    return hit;
  }

  clear() {
    for (const pr of this.projectiles) {
      if (pr.mesh) this.worldRoot.remove(pr.mesh);
    }
    this.projectiles = [];
  }
}

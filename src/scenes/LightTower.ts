import * as THREE from 'three';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';

// Scanning floodlight tower: vertical pole, head, downward translucent
// cone that rotates around the pole's vertical axis. The cone's
// footprint on the ground is what counts as "lit"; if the player is
// inside the footprint, they're considered illuminated and the game
// loop bumps detection on every guard.

const TOWER_HEIGHT = 4.5;
const POLE_RADIUS = 0.12;
const HEAD_RADIUS = 0.35;
// Bigger lit footprint + matching beam so the floodlight reads as
// an actual flashlight throw, not a small spotlight dot. The lit
// footprint and the visible beam share the same dimensions so the
// gameplay (player illuminated when inside the footprint) matches
// what they see on screen.
const BEAM_BASE_R = 4.0;
const BEAM_FOOTPRINT_OFFSET = 5.0;
export const LIGHT_FOOTPRINT_R = 4.0;
// Quarter-circle sector behind the current scan position showing
// recent sweep history - communicates "this tower scans this region".
const ARC_INNER_R = 0.5;
const ARC_OUTER_R = 7.5;
const ARC_SWEEP_RAD = Math.PI / 3; // 60 deg trailing arc

const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.7 });
const HEAD_MAT = new THREE.MeshStandardMaterial({
  color: 0xffe7a3,
  emissive: 0xffce6a,
  emissiveIntensity: 0.6,
  roughness: 0.3,
});
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xfff0a0,
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const FOOT_MAT = new THREE.MeshBasicMaterial({
  color: 0xfff0a0,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const ARC_MAT = new THREE.MeshBasicMaterial({
  color: 0xfff0a0,
  transparent: true,
  opacity: 0.08,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export type LightTower = {
  x: number;
  z: number;
  scanAngle: number;
  scanSpeed: number;
  pivot: THREE.Group;
};

function buildTower(
  x: number,
  z: number,
  scanSpeed: number,
  worldRoot: THREE.Group,
): LightTower {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, TOWER_HEIGHT, 8),
    POLE_MAT,
  );
  pole.position.set(x, TOWER_HEIGHT / 2, z);
  worldRoot.add(pole);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_RADIUS, 12, 12),
    HEAD_MAT,
  );
  head.position.set(x, TOWER_HEIGHT, z);
  worldRoot.add(head);

  // Pivot rotates around Y; beam + footprint live inside it so they
  // sweep around the pole as scanAngle changes.
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  worldRoot.add(pivot);

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(BEAM_BASE_R, TOWER_HEIGHT, 16, 1, true),
    BEAM_MAT,
  );
  beam.position.set(0, TOWER_HEIGHT / 2, BEAM_FOOTPRINT_OFFSET / 2);
  beam.rotation.x = -Math.atan2(BEAM_FOOTPRINT_OFFSET, TOWER_HEIGHT);
  pivot.add(beam);

  const foot = new THREE.Mesh(
    new THREE.CircleGeometry(LIGHT_FOOTPRINT_R, 24),
    FOOT_MAT,
  );
  foot.rotation.x = -Math.PI / 2;
  foot.position.set(0, 0.04, BEAM_FOOTPRINT_OFFSET);
  pivot.add(foot);

  // Trailing sector arc on the ground showing recent sweep history.
  // RingGeometry takes (innerR, outerR, segs, phiSegs, thetaStart,
  // thetaLength). It's drawn in the XY plane by default; rotated to
  // lay flat on the ground. The arc is OUTSIDE the pivot so it
  // doesn't sweep with the head - we attach it to worldRoot and
  // rotate it manually each frame to stay BEHIND the current scan.
  // For simplicity here, attach to pivot but offset its theta so
  // it trails - the swept ring rotates with the pivot which keeps
  // the trail aligned with the recent past.
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(
      ARC_INNER_R,
      ARC_OUTER_R,
      32,
      1,
      -ARC_SWEEP_RAD,
      ARC_SWEEP_RAD,
    ),
    ARC_MAT,
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(0, 0.03, 0);
  pivot.add(arc);

  return { x, z, scanAngle: 0, scanSpeed, pivot };
}

// Three rows of paired towers along the segment, alternating scan
// directions so they don't all sweep in unison.
export function spawnLightTowers(worldRoot: THREE.Group): LightTower[] {
  const segLen = CHUNK_LEN * CHUNKS_AHEAD;
  const towerX = PLAY_HALF_W + 0.6;
  const rows = [segLen * 0.18, segLen * 0.5, segLen * 0.82];

  const towers: LightTower[] = [];
  rows.forEach((rz, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    towers.push(buildTower(-towerX, rz, 0.55 * dir, worldRoot));
    towers.push(buildTower(towerX, rz, -0.55 * dir, worldRoot));
  });
  return towers;
}

export function updateLightTower(t: LightTower, dt: number) {
  t.scanAngle += t.scanSpeed * dt;
  t.pivot.rotation.y = t.scanAngle;
}

// True if the player is within the lit footprint of this tower.
export function isPlayerLit(t: LightTower, px: number, pz: number): boolean {
  // Pivot's local +Z rotated by scanAngle around Y in world frame:
  // world.x_offset =  sin(scanAngle) * BEAM_FOOTPRINT_OFFSET
  // world.z_offset =  cos(scanAngle) * BEAM_FOOTPRINT_OFFSET
  const fx = t.x + Math.sin(t.scanAngle) * BEAM_FOOTPRINT_OFFSET;
  const fz = t.z + Math.cos(t.scanAngle) * BEAM_FOOTPRINT_OFFSET;
  const dx = px - fx;
  const dz = pz - fz;
  return dx * dx + dz * dz <= LIGHT_FOOTPRINT_R * LIGHT_FOOTPRINT_R;
}

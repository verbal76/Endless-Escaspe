import * as THREE from 'three';
import type { Obstacle, Player } from '../types/world';
import { clearLine } from '../util/collision';
import { dist2Sq } from '../util/math';
import { PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';

// Wall-mounted security camera. Pointed inwards from one of the
// fence sides, fixed in place, narrow cone, no kill range. Detection
// from cameras feeds a separate "yard alarm" bar (store.alarmLevel)
// rather than per-guard detection. When the alarm fills, Game.tsx
// dispatches a reinforcement guard toward the sighting (up to two per
// segment), every guard hears the alarm and converges on the spot,
// and guard vision is boosted while the bar stays full.

export const CAM_RANGE = 11;
export const CAM_HALF_ANGLE_RAD = (35 * Math.PI) / 180; // 70deg cone
const CAM_RATE = 0.10; // alarm bar contribution per second at full proximity
const CAM_DECAY = 0.04; // alarm bar decay when no camera sees player

const POLE_MAT = new THREE.MeshStandardMaterial({
  color: 0x35373d,
  roughness: 0.8,
});
const HOUSING_MAT = new THREE.MeshStandardMaterial({
  color: 0x111114,
  roughness: 0.5,
});
const LENS_MAT = new THREE.MeshBasicMaterial({
  color: 0xff4040,
  transparent: true,
  opacity: 0.85,
});
const CONE_MAT = new THREE.MeshBasicMaterial({
  color: 0xff7070,
  transparent: true,
  opacity: 0.10,
  side: THREE.DoubleSide,
  depthWrite: false,
});

[POLE_MAT, HOUSING_MAT, LENS_MAT, CONE_MAT].forEach((m) => markShared(m));

export type Camera = {
  x: number;
  z: number;
  facing: number; // angle in radians; cone aims along (sin, cos)
};

function buildCamera(x: number, z: number, facing: number, worldRoot: THREE.Group): Camera {
  // Short pole mounted on the fence line.
  const POLE_H = 2.4;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, POLE_H, 14),
    POLE_MAT,
  );
  pole.position.set(x, POLE_H / 2, z);
  worldRoot.add(pole);

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.18, 0.42),
    HOUSING_MAT,
  );
  housing.position.set(x, POLE_H, z);
  housing.rotation.y = facing;
  worldRoot.add(housing);

  // Red lens on the front of the housing (forward = local +Z, so
  // place it in the rotated frame).
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), LENS_MAT);
  lens.position.set(
    x + Math.sin(facing) * 0.21,
    POLE_H,
    z + Math.cos(facing) * 0.21,
  );
  worldRoot.add(lens);

  // Translucent vision cone on the ground - readability cue so the
  // player can tell where each camera is looking. Triangular slab.
  const halfBase = Math.tan(CAM_HALF_ANGLE_RAD) * CAM_RANGE;
  const verts = new Float32Array([
    0, 0, 0,
    -halfBase, 0, CAM_RANGE,
    halfBase, 0, CAM_RANGE,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2]);
  const cone = new THREE.Mesh(geo, CONE_MAT);
  cone.position.set(x, 0.04, z);
  cone.rotation.y = facing;
  worldRoot.add(cone);

  return { x, z, facing };
}

// Spawn `count` cameras alternating fence sides along the segment.
export function spawnCameras(
  worldRoot: THREE.Group,
  segLen: number,
  count: number,
): Camera[] {
  if (count <= 0) return [];
  const out: Camera[] = [];
  const xMag = PLAY_HALF_W + 0.3;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const z = segLen * (0.18 + 0.74 * t);
    const onLeft = i % 2 === 0;
    // Cameras on the left fence look toward +X (into the yard);
    // facing is the angle whose (sin, cos) points roughly inward.
    // sin = +1, cos = 0 -> facing = pi/2 looks +X.
    const facing = onLeft ? Math.PI / 2 : -Math.PI / 2;
    out.push(buildCamera(onLeft ? -xMag : xMag, z, facing, worldRoot));
  }
  return out;
}

// Check whether camera sees the player. Same cone-and-LOS test as
// guard vision, but cone half-angle and range are camera-specific.
function cameraSeesPlayer(
  c: Camera,
  p: Player,
  obstacles: readonly Obstacle[],
): boolean {
  const dSq = dist2Sq(c.x, c.z, p.x, p.z);
  if (dSq > CAM_RANGE * CAM_RANGE) return false;
  const angleToPlayer = Math.atan2(p.x - c.x, p.z - c.z);
  let d = angleToPlayer - c.facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) > CAM_HALF_ANGLE_RAD) return false;
  // Cover blocks cameras the same way it blocks guards (real prop
  // footprints; crouched players hide behind hip-height props).
  return clearLine(obstacles, c.x, c.z, p.x, p.z, p.isCrouched ? 0.3 : 1.0);
}

// Per-frame alarm-bar update. Returns the new level (0..1). Caller
// (Game.tsx) feeds this into store.alarmLevel and uses the level to
// drive escalation.
export function updateCameraAlarm(
  cameras: readonly Camera[],
  player: Player,
  obstacles: readonly Obstacle[],
  prev: number,
  dt: number,
): number {
  let bestProximity = 0;
  for (const c of cameras) {
    if (cameraSeesPlayer(c, player, obstacles)) {
      const dSq = dist2Sq(c.x, c.z, player.x, player.z);
      const prox = 1 - dSq / (CAM_RANGE * CAM_RANGE);
      if (prox > bestProximity) bestProximity = prox;
    }
  }
  if (bestProximity > 0) {
    return Math.min(1, prev + CAM_RATE * bestProximity * dt);
  }
  return Math.max(0, prev - CAM_DECAY * dt);
}

// Stage-driven count.
export function cameraCountFor(stage: number): number {
  const s = Math.max(1, stage | 0);
  if (s < 10) return 0;
  if (s < 16) return 2;
  if (s < 22) return 4;
  return 6;
}

// Boss flag: a heavier guard variant at every 5th stage from 5 onwards.
export function isBossStage(stage: number): boolean {
  const s = Math.max(1, stage | 0);
  return s >= 5 && s % 5 === 0;
}


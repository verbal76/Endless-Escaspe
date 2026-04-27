import * as THREE from 'three';
import type { Guard, Player } from '../types/world';
import {
  CHUNK_LEN,
  CHUNKS_AHEAD,
  PLAY_HALF_W,
  VISION_CONE_DEG,
} from '../util/geometry';
import { createBlockyFigure, type BlockyFigure } from './BlockyFigure';

// Muted, brownish DOC jumpsuit orange (the bright safety-cone version
// reads as cosplay; this sits closer to washed-out coverall fabric).
export const PLAYER_COLOR = 0xa05423;
// Police-blue uniform.
export const GUARD_COLOR = 0x2b4f8e;

export function createPlayer(): Player {
  return {
    x: 0,
    z: 1,
    vx: 0,
    vz: 0,
    stance: 'walk',
    isRunning: false,
    isCrouched: false,
    isProne: false,
    isHidden: false,
  };
}

export function createPlayerFigure(): BlockyFigure {
  return createBlockyFigure(PLAYER_COLOR);
}

export type GuardConfig = {
  id: number;
  homeX: number;
  homeZ: number;
  homeRadius: number;
};

export function createGuard(cfg: GuardConfig): Guard {
  return {
    id: cfg.id,
    x: cfg.homeX,
    z: cfg.homeZ,
    facing: 0,
    state: 'wander',
    homeX: cfg.homeX,
    homeZ: cfg.homeZ,
    homeRadius: cfg.homeRadius,
    wanderTarget: { x: cfg.homeX, z: cfg.homeZ },
    wanderTimer: 0,
    behaviorTimer: 0,
    investigationTarget: null,
    fireCooldown: 0,
    mesh: null,
    visionMesh: null,
  };
}

// Two guards split the segment vertically. Left guard patrols the
// near-left half; right guard patrols the far-right half. Their
// home radii overlap slightly in the middle so the player can be
// pinched if they aren't careful.
export function createGuardConfigs(): GuardConfig[] {
  const segLen = CHUNK_LEN * CHUNKS_AHEAD;
  const halfX = Math.max(2, PLAY_HALF_W * 0.55);
  return [
    { id: 1, homeX: -halfX, homeZ: segLen * 0.32, homeRadius: 9 },
    { id: 2, homeX: halfX, homeZ: segLen * 0.68, homeRadius: 9 },
  ];
}

export function createGuardFigure(): BlockyFigure {
  return createBlockyFigure(GUARD_COLOR);
}

// Flat triangular cone on the ground showing the guard's actual
// vision footprint: VISION_CONE_DEG wide, `visionRange` long. Apex
// sits at the guard, base spans the full cone angle at max range.
// Visual matches DetectionSystem behavior 1:1; guards are blind
// outside this footprint.
export function createFacingMarker(visionRange: number): THREE.Mesh {
  const halfAngle = (VISION_CONE_DEG * Math.PI) / 180 / 2;
  const baseHalfWidth = Math.tan(halfAngle) * visionRange;
  const verts = new Float32Array([
    0, 0, 0,
    -baseHalfWidth, 0, visionRange,
    baseHalfWidth, 0, visionRange,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd14a,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

export function createGround(): THREE.Mesh {
  // Grass-covered yard: you're outside the prison complex now,
  // making for the property-line fence at the far end of the
  // segment. Wide enough to cover the playfield with margin in
  // landscape FOV.
  const geo = new THREE.PlaneGeometry(PLAY_HALF_W * 2 + 10, CHUNK_LEN * (CHUNKS_AHEAD + 2));
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3f6a2c,
    roughness: 1,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0, (CHUNK_LEN * CHUNKS_AHEAD) / 2);
  return m;
}

export function createWinLine(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(8, 0.4);
  const mat = new THREE.MeshBasicMaterial({ color: 0x55ff88 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.02, CHUNK_LEN * CHUNKS_AHEAD - 0.5);
  return m;
}

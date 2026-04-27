import * as THREE from 'three';
import type { Guard, Player } from '../types/world';
import { CHUNK_LEN, CHUNKS_AHEAD, PLAY_HALF_W } from '../util/geometry';

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

export function createPlayerMesh(): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(0.4, 0.8, 4, 8);
  // transparent so the mesh can dim when hidden; opacity is normally 1.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe5cc7d,
    roughness: 0.6,
    transparent: true,
    opacity: 1,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, 0.7, 0);
  return m;
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

export function createGuardMesh(): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(0.45, 0.9, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xb33b3b, roughness: 0.5 });
  const m = new THREE.Mesh(geo, mat);
  return m;
}

export function createFacingMarker(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(0.8, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd14a,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function createGround(): THREE.Mesh {
  // Wide enough to cover the playfield with margin in landscape FOV.
  const geo = new THREE.PlaneGeometry(PLAY_HALF_W * 2 + 10, CHUNK_LEN * (CHUNKS_AHEAD + 2));
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 1 });
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

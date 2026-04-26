import * as THREE from 'three';
import type { Guard, Player } from '../types/world';
import { CHUNK_LEN, CHUNKS_AHEAD } from '../util/geometry';

export function createPlayer(): Player {
  return {
    x: 0,
    z: 1,
    vx: 0,
    vz: 0,
    isCrouched: false,
    isRunning: false,
    isHidden: false,
  };
}

export function createPlayerMesh(): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(0.4, 0.8, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe5cc7d, roughness: 0.6 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, 0.7, 0);
  return m;
}

export function createGuard(): Guard {
  // Patrol between two waypoints at the segment's midpoint.
  const segMid = (CHUNK_LEN * CHUNKS_AHEAD) / 2;
  return {
    id: 1,
    x: -2,
    z: segMid,
    facing: 0,
    state: 'patrol',
    waypoints: [
      { x: -2, z: segMid - 4 },
      { x: 2, z: segMid + 4 },
    ],
    waypointIndex: 0,
    mesh: null,
    visionMesh: null,
  };
}

export function createGuardMesh(): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(0.45, 0.9, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xb33b3b, roughness: 0.5 });
  const m = new THREE.Mesh(geo, mat);
  return m;
}

export function createFacingMarker(): THREE.Mesh {
  // Thin elongated quad placed in front of the guard to show facing.
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
  const geo = new THREE.PlaneGeometry(60, CHUNK_LEN * (CHUNKS_AHEAD + 2));
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

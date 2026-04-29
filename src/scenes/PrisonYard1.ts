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

// Skin tone palette - shared by player choice and randomised guard
// heads. Beige is a warm pale tan; brown is a deeper, warmer tan.
export const SKIN_BEIGE = 0xe8c697;
export const SKIN_BROWN = 0x7e4f2a;

export function skinHex(skin: 'beige' | 'brown'): number {
  return skin === 'brown' ? SKIN_BROWN : SKIN_BEIGE;
}

export function createPlayer(): Player {
  return {
    x: 0,
    z: 1,
    vx: 0,
    vz: 0,
    stance: 'walk',
    isRunning: false,
    isCrouched: false,
    isHidden: false,
    stamina: 1,
  };
}

export function createPlayerFigure(skin: 'beige' | 'brown' = 'beige'): BlockyFigure {
  return createBlockyFigure(PLAYER_COLOR, skinHex(skin));
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
    stunTimer: 0,
    mesh: null,
    visionMesh: null,
  };
}

// Guards split the segment along Z into vertical zones; they
// alternate sides on X. Two-guard layout for early stages; later
// stages add up to three more, packed across the segment so coverage
// scales with difficulty without leaving the player nowhere to go.
export function createGuardConfigs(
  guardCount: number,
  segLen: number,
): GuardConfig[] {
  const n = Math.max(1, guardCount | 0);
  const halfX = Math.max(2, PLAY_HALF_W * 0.55);
  const configs: GuardConfig[] = [];
  for (let i = 0; i < n; i++) {
    // Zones evenly distributed along Z: i / n .. (i+1) / n.
    const t = (i + 0.5) / n;
    const homeZ = segLen * (0.18 + 0.74 * t);
    const sideX = i % 2 === 0 ? -halfX : halfX;
    configs.push({
      id: i + 1,
      homeX: sideX,
      homeZ,
      // Home radius shrinks slightly with more guards so they keep
      // distinct turf rather than overlapping into one mob.
      homeRadius: Math.max(5, 10 - n),
    });
  }
  return configs;
}

// Guards get randomised beige or brown heads at spawn time so the
// crew feels less cloned. 50/50 split.
export function createGuardFigure(): BlockyFigure {
  const skin = Math.random() < 0.5 ? SKIN_BEIGE : SKIN_BROWN;
  return createBlockyFigure(GUARD_COLOR, skin);
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
  // Grass-covered yard. Plane is intentionally enormous (800m wide,
  // 100m+ longer than the playfield in either direction) so the
  // grass always reaches the screen edge regardless of camera yaw,
  // resolution, or how far the player has traversed within the
  // segment. The Z dimension explicitly extends past the backdrop
  // mountain row (z ~= 720) so the mountains visually root in the
  // same plane the player walks on rather than floating above an
  // empty fog field.
  const geo = new THREE.PlaneGeometry(800, 1800);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3f6a2c,
    roughness: 1,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  // Centred so the plane spans roughly z = -500 .. +1300, which
  // covers everything from a few metres behind the start line out
  // to the mountain row plus its depth.
  m.position.set(0, 0, 400);
  return m;
}

export function createWinLine(segLen: number = CHUNK_LEN * CHUNKS_AHEAD): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(8, 0.4);
  const mat = new THREE.MeshBasicMaterial({ color: 0x55ff88 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.02, segLen - 0.5);
  return m;
}

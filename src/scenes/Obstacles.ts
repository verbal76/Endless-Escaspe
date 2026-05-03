import * as THREE from 'three';
import type { Obstacle, ObstacleKind } from '../types/world';
import { markShared } from '../util/dispose';

// Obstacle mesh factory + per-kind metadata. Procgen picks a kind
// randomly, then this module produces the matching three.js mesh
// and reports the collision radius the procgen should reserve.
//
// All shapes are built from primitives - no asset pipeline. Heights
// are tuned so guards' line of sight rule (crates and cover block,
// low walls don't) reads sensibly: anything tall enough to hide
// behind blocks; anything below knee height doesn't.

const CRATE_GEO = markShared(new THREE.BoxGeometry(1.1, 1.1, 1.1));
const WALL_GEO = markShared(new THREE.BoxGeometry(1.6, 0.6, 0.6));
const COVER_GEO = markShared(new THREE.BoxGeometry(2.0, 1.4, 1.0));
// Segment counts bumped from the prototype values to give curved
// shapes a bit more polish without blowing the per-frame budget:
// barrels go 14 -> 20 sides, car wheels 12 -> 18, tree trunks
// 10 -> 16. Boulder + leaves moved up an icosahedron-detail tier
// for less-faceted silhouettes (20 faces -> 80, 80 faces -> 320).
const BARREL_GEO = markShared(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 20));
const BOULDER_GEO = markShared(new THREE.IcosahedronGeometry(0.7, 1));
const HEDGE_GEO = markShared(new THREE.BoxGeometry(2.6, 1.1, 0.7));
const CAR_BODY_GEO = markShared(new THREE.BoxGeometry(2.4, 0.9, 1.25));
const CAR_CABIN_GEO = markShared(new THREE.BoxGeometry(1.6, 0.6, 1.1));
const CAR_WHEEL_GEO = markShared(new THREE.CylinderGeometry(0.27, 0.27, 0.18, 18));
const TRUNK_GEO = markShared(new THREE.CylinderGeometry(0.22, 0.28, 1.6, 16));
const LEAVES_GEO = markShared(new THREE.IcosahedronGeometry(0.95, 2));

// Each obstacle material carries an emissive matching its diffuse
// hue so the silhouette stays legible under deep-night ambient.
// Intensity is high enough (~0.40) to lift surfaces out of pitch-
// black at night while still reading as an unlit material in full
// daylight (the daylight ambient + sun overwhelms the ~30% emissive
// contribution).
const CRATE_MAT = new THREE.MeshStandardMaterial({
  color: 0x8a6a3d,
  emissive: 0x6e553e,
  emissiveIntensity: 0.40,
  roughness: 0.85,
});
const WALL_MAT = new THREE.MeshStandardMaterial({
  color: 0x6a7080,
  emissive: 0x52596a,
  emissiveIntensity: 0.42,
  roughness: 0.95,
});
const COVER_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a5e7a,
  emissive: 0x3c4d68,
  emissiveIntensity: 0.45,
  roughness: 0.9,
});
const BARREL_MAT = new THREE.MeshStandardMaterial({
  color: 0x8a4634,
  emissive: 0x6c3528,
  emissiveIntensity: 0.42,
  roughness: 0.7,
  metalness: 0.2,
});
const BOULDER_MAT = new THREE.MeshStandardMaterial({
  color: 0x8a8e94,
  emissive: 0x6c707a,
  emissiveIntensity: 0.40,
  roughness: 1,
  flatShading: true,
});
const HEDGE_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a7a40,
  emissive: 0x386030,
  emissiveIntensity: 0.42,
  roughness: 0.9,
  flatShading: true,
});
const CAR_BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x6286a4,
  emissive: 0x466782,
  emissiveIntensity: 0.42,
  roughness: 0.55,
  metalness: 0.4,
});
const CAR_CABIN_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a607a,
  emissive: 0x394a60,
  emissiveIntensity: 0.42,
  roughness: 0.5,
  metalness: 0.4,
});
const CAR_WHEEL_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a2a30,
  emissive: 0x202024,
  emissiveIntensity: 0.40,
  roughness: 0.95,
});
const TRUNK_MAT = new THREE.MeshStandardMaterial({
  color: 0x70502c,
  emissive: 0x563d22,
  emissiveIntensity: 0.40,
  roughness: 0.95,
});
const LEAVES_MAT = new THREE.MeshStandardMaterial({
  color: 0x528840,
  emissive: 0x3e6c30,
  emissiveIntensity: 0.42,
  roughness: 0.9,
  flatShading: true,
});

// Mark every module-level material as shared so the scene-rebuild
// disposal pass leaves them alone (they're reused across every
// future obstacle spawn).
[
  CRATE_MAT, WALL_MAT, COVER_MAT, BARREL_MAT, BOULDER_MAT,
  HEDGE_MAT, CAR_BODY_MAT, CAR_CABIN_MAT, CAR_WHEEL_MAT,
  TRUNK_MAT, LEAVES_MAT,
].forEach((m) => markShared(m));

// Collision radius the procgen should treat each kind as for the
// min-spacing rule. Long shapes (car, hedgerow) get larger radii so
// the procgen leaves room around them.
export const OBSTACLE_RADIUS: Record<ObstacleKind, number> = {
  crate: 0.6,
  lowwall: 0.6,
  cover: 0.9,
  boulder: 0.65,
  barrel: 0.45,
  car: 1.35,
  tree: 0.4,
  hedgerow: 1.35,
};

// Approximate top-of-mesh height (m). DetectionSystem compares this
// to the player's stance threshold to decide whether the obstacle
// blocks line of sight for that stance:
//   standing requires height >= 1.0
//   crouched requires height >= 0.55
//   prone    requires height >= 0.25
// So a low wall hides a crouching player but not a standing one;
// a tree trunk blocks all stances; a barrel hides anyone, etc.
export const OBSTACLE_HEIGHT: Record<ObstacleKind, number> = {
  crate: 1.1,
  lowwall: 0.6,
  cover: 1.4,
  boulder: 1.0,
  barrel: 1.05,
  car: 1.5,
  tree: 1.6, // trunk; the leaves above don't matter for ground LOS
  hedgerow: 1.1,
};

// True if guards can see THROUGH this obstacle. Knee-high stuff yes;
// torso/head-high stuff no. Used by DetectionSystem (crate already
// included; this map keeps the rule explicit).
export function blocksLineOfSight(kind: ObstacleKind): boolean {
  return kind !== 'lowwall';
}

// Non-cover obstacle palette - cover is spawned separately by the
// procgen. Weights bias toward the more-common props (crates,
// boulders) over the standout-but-rarer ones (cars, trees).
export const NON_COVER_KINDS: ObstacleKind[] = [
  'crate',
  'crate',
  'lowwall',
  'lowwall',
  'boulder',
  'boulder',
  'barrel',
  'barrel',
  'hedgerow',
  'tree',
  'car',
];

export function buildObstacleMesh(o: Obstacle): THREE.Object3D {
  switch (o.kind) {
    case 'crate': {
      const m = new THREE.Mesh(CRATE_GEO, CRATE_MAT);
      m.position.set(o.x, 0.55, o.z);
      return m;
    }
    case 'lowwall': {
      const m = new THREE.Mesh(WALL_GEO, WALL_MAT);
      m.position.set(o.x, 0.3, o.z);
      return m;
    }
    case 'cover': {
      const m = new THREE.Mesh(COVER_GEO, COVER_MAT);
      m.position.set(o.x, 0.7, o.z);
      return m;
    }
    case 'barrel': {
      const m = new THREE.Mesh(BARREL_GEO, BARREL_MAT);
      m.position.set(o.x, 0.525, o.z);
      return m;
    }
    case 'boulder': {
      const m = new THREE.Mesh(BOULDER_GEO, BOULDER_MAT);
      // Random rotation for variety so they don't all look identical.
      m.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      m.position.set(o.x, 0.55, o.z);
      return m;
    }
    case 'hedgerow': {
      const m = new THREE.Mesh(HEDGE_GEO, HEDGE_MAT);
      m.position.set(o.x, 0.55, o.z);
      // Random orientation so some hedgerows run along Z, some along X.
      m.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      return m;
    }
    case 'car': {
      const g = new THREE.Group();
      const body = new THREE.Mesh(CAR_BODY_GEO, CAR_BODY_MAT);
      body.position.y = 0.55;
      g.add(body);
      const cabin = new THREE.Mesh(CAR_CABIN_GEO, CAR_CABIN_MAT);
      cabin.position.set(-0.1, 1.2, 0);
      g.add(cabin);
      const wheelOffsets: Array<[number, number]> = [
        [-0.85, -0.55],
        [-0.85, 0.55],
        [0.85, -0.55],
        [0.85, 0.55],
      ];
      for (const [wx, wz] of wheelOffsets) {
        const wheel = new THREE.Mesh(CAR_WHEEL_GEO, CAR_WHEEL_MAT);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.27, wz);
        g.add(wheel);
      }
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      return g;
    }
    case 'tree': {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(TRUNK_GEO, TRUNK_MAT);
      trunk.position.y = 0.8;
      g.add(trunk);
      const leaves = new THREE.Mesh(LEAVES_GEO, LEAVES_MAT);
      leaves.position.y = 2.0;
      g.add(leaves);
      g.position.set(o.x, 0, o.z);
      return g;
    }
  }
}

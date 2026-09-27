import * as THREE from 'three';
import type { Obstacle, ObstacleKind } from '../types/world';
import { createKitProp, type KitKind } from './KitProps';
import { createVehicle } from './Vehicle';

// Build a tree group from one of the two Kenney tall-pine OBJs.
// Real 3D geometry (trunk + stacked leaf cones) - no procedural
// trunk cylinder + no alpha-cut billboards needed. The 50/50 roll
// between the simple and detailed variants gives some silhouette
// variation across a tree row without an explicit second model.
//
// `sceneScale` is the uniform scale applied to the OBJ. Native
// height is 1.53 m so 2.5x lands a tree at ~3.8 m which reads as
// real game-scale.
export function buildTreeGroup(scale: number): THREE.Group {
  const kind: KitKind = Math.random() < 0.5 ? 'treePineTallA' : 'treePineTallADetailed';
  return createKitProp(kind, scale);
}

// Obstacle mesh factory + per-kind metadata. Procgen picks a kind
// randomly, then this module produces the matching three.js mesh
// and reports the collision radius the procgen should reserve.
//
// Every kind now resolves to a Kenney 3D model (KitProps for static
// props, Vehicle for cars). Heights are tuned so guards' line of
// sight rule (crates and cover block, low walls don't) reads
// sensibly:
//   standing requires height >= 1.0
//   crouched requires height >= 0.55
//   prone    requires height >= 0.25

// Per-kind anisotropic scale that brings the small kit native bbox
// (typically 0.5-0.7 m) up to the gameplay-relevant footprint each
// obstacle kind expects. Computed by hand from each model's native
// bbox vs. the target W x H x L the existing detection / hitbox
// code was tuned around.
// Closed dumpster scaled 5.2x (the prior 4x bumped 30% per request).
// Footprint ~3.12 x 2.4 m, top at ~2.81 m. Fits a real dumpster
// silhouette next to a 1.85 m player.
const SCALE_CRATE = new THREE.Vector3(5.2, 5.2, 5.2);
// barrierA native 0.66 x 0.33 x 0.24 -> 1.6 x 0.6 x 0.6
const SCALE_LOWWALL = new THREE.Vector3(2.42, 1.82, 2.50);
// barrierB native 0.66 x 0.33 x 0.24 -> ~2.0 x 1.4 x 1.0
const SCALE_COVER = new THREE.Vector3(3.03, 4.24, 4.17);
// block native 0.5 x 0.5 x 0.5 -> 1.0 x 1.0 x 1.0
const SCALE_BOULDER = new THREE.Vector3(2.0, 2.0, 2.0);
// dumpsterOpen native 0.6 x 0.55 x 0.48 -> 0.84 x 1.05 x 0.84
// Open dumpster at the same 30%-bigger tier as the closed variant.
const SCALE_BARREL = new THREE.Vector3(3.64, 4.97, 4.55);
// Tall-pine OBJ is real 3D geometry (~0.4 m wide x 1.53 m tall
// native). 2.5x uniform scale lands the visible tree at ~1 m wide
// x 3.8 m tall - a proper game-scale evergreen the player can
// hide behind.
const SCALE_TREE = 2.5;
// block native 0.5 x 0.5 x 0.5 -> 2.6 x 1.1 x 0.7 (long concrete wall)
const SCALE_HEDGEROW = new THREE.Vector3(5.20, 2.20, 1.40);

// Collision radius the procgen should treat each kind as for the
// min-spacing rule. Long shapes (car, hedgerow) get larger radii so
// the procgen leaves room around them.
export const OBSTACLE_RADIUS: Record<ObstacleKind, number> = {
  // Crate (dumpsterClosed scaled 5.2x = 3.12 x 2.39 m footprint).
  // OBB hitbox dims are rolled by the procgen so the player can walk
  // up to the actual face; `r` here is the bounding circle used for
  // procgen min-spacing only.
  crate: 1.97,
  lowwall: 0.6,
  cover: 0.9,
  // Block scaled to a 1 m cube. Inscribed (= half-width) is 0.5;
  // tightening from 0.65 eliminates the ~0.15 m phantom zone the
  // larger r left around every cube face. The block is rotationally
  // symmetric enough that a circle approximation is correct here.
  boulder: 0.5,
  // Open dumpster scaled 30%-bigger: footprint ~2.18 x 2.18 m;
  // r = 1.17 sits just outside the inscribed circle.
  barrel: 1.17,
  car: 2.7,
  // Tall-pine OBJ scaled 2.5x has a ~1 m wide trunk + leaf cluster.
  // r = 0.5 sits roughly at the visible foliage edge so the player
  // can walk close without hitting a phantom bumper.
  tree: 0.5,
  hedgerow: 1.35,
};

// Approximate top-of-mesh height (m). DetectionSystem compares this
// to the player's stance threshold to decide whether the obstacle
// blocks line of sight for that stance.
export const OBSTACLE_HEIGHT: Record<ObstacleKind, number> = {
  crate: 2.81,    // dumpsterClosed scaled 5.2x top
  lowwall: 0.6,   // barrierA scaled top
  cover: 1.40,    // barrierB scaled top
  boulder: 1.0,   // block scaled top
  barrel: 2.73,   // dumpsterOpen scaled 30%-bigger top
  // 2x police cruiser tops at ~2.03 m; 3x fire truck at ~3.98 m.
  // Use the smaller value so the LOS rule reflects the worst-case
  // obstruction (police): both still block standing line of sight
  // since 2.03 > 1.0.
  car: 2.0,
  tree: 2.0,      // pine scaled top
  hedgerow: 1.10, // block stretched top
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

// Visual Y rotation for an obstacle with a pre-rolled OBB. The OBB
// maths (collision, nav grid, LOS) maps local->world with a standard
// 2D rotation by +rotY in (x, z); three.js' rotation.y = t maps
// (x, z) -> (x cos t + z sin t, -x sin t + z cos t), which is a
// rotation by -t in that frame. Using +rotY here (as before) mirrored
// every non-90-degree prop against its hitbox - dumpsters, which roll
// a fully random angle, visibly didn't match what you bumped into.
export function meshYaw(o: Obstacle, fallback: () => number): number {
  return o.rotY !== undefined ? -o.rotY : fallback();
}

export function buildObstacleMesh(o: Obstacle): THREE.Object3D {
  switch (o.kind) {
    case 'crate': {
      // Closed dumpster as a chest-high prop the player can hide
      // behind. Sits flat on the ground (model bottom at y=0 native).
      // rotY is pre-rolled by the procgen so the OBB hitbox stays
      // synced with the visual rotation.
      const g = createKitProp('dumpsterClosed', SCALE_CRATE);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = meshYaw(o, () => Math.random() * Math.PI * 2);
      return g;
    }
    case 'lowwall': {
      // Concrete jersey barrier - knee-high, doesn't block standing
      // line of sight but breaks crouched LOS. rotY is pre-rolled by
      // the procgen so the OBB hitbox + visual mesh stay synced.
      const g = createKitProp('barrierA', SCALE_LOWWALL);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = meshYaw(o, () => (Math.random() < 0.5 ? 0 : Math.PI / 2));
      return g;
    }
    case 'cover': {
      // Tall concrete barrier with sign panel - blocks standing LOS
      // and reads as a "warning sign" landmark.
      const g = createKitProp('barrierB', SCALE_COVER);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = meshYaw(o, () => (Math.random() < 0.5 ? 0 : Math.PI / 2));
      return g;
    }
    case 'barrel': {
      // Open dumpster as a barrel-equivalent - hip-height with a
      // visible interior. Reads as kit clutter rather than a clean
      // cylindrical drum but fills the same gameplay role.
      const g = createKitProp('dumpsterOpen', SCALE_BARREL);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      return g;
    }
    case 'boulder': {
      // Concrete block with random Y rotation for variety. Native
      // model is a clean cube; rotation swings it into a diamond
      // silhouette half the time so a row of boulders doesn't read
      // as a uniform run of cubes.
      const g = createKitProp('block', SCALE_BOULDER);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      return g;
    }
    case 'hedgerow': {
      // Long concrete wall - same block model stretched along its
      // X axis. rotY is pre-rolled by the procgen so the OBB
      // hitbox + visual mesh stay synced.
      const g = createKitProp('block', SCALE_HEDGEROW);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = meshYaw(o, () => (Math.random() < 0.5 ? 0 : Math.PI / 2));
      return g;
    }
    case 'car': {
      // Procgen pre-rolls the variant + Y rotation (so the hitbox
      // OBB and the visual mesh stay synced).
      const kind: 'police' | 'firetruck' =
        o.subKind ?? (Math.random() < 0.8 ? 'police' : 'firetruck');
      const g = createVehicle(kind);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = meshYaw(o, () => (Math.floor(Math.random() * 4) * Math.PI) / 2);
      return g;
    }
    case 'tree': {
      // Real 3D Kenney tall-pine - 50/50 between the simple and
      // detailed variants. Built-in trunk + leaf cones, no
      // procedural trunk cylinder + no alpha-test billboard
      // needed.
      const g = buildTreeGroup(SCALE_TREE);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      return g;
    }
  }
}

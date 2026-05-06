import * as THREE from 'three';
import type { Obstacle, ObstacleKind } from '../types/world';
import { createKitProp } from './KitProps';
import { createVehicle } from './Vehicle';

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
const SCALE_CRATE = new THREE.Vector3(2.0, 2.0, 2.0);
// barrierA native 0.66 x 0.33 x 0.24 -> 1.6 x 0.6 x 0.6
const SCALE_LOWWALL = new THREE.Vector3(2.42, 1.82, 2.50);
// barrierB native 0.66 x 0.33 x 0.24 -> ~2.0 x 1.4 x 1.0
const SCALE_COVER = new THREE.Vector3(3.03, 4.24, 4.17);
// block native 0.5 x 0.5 x 0.5 -> 1.0 x 1.0 x 1.0
const SCALE_BOULDER = new THREE.Vector3(2.0, 2.0, 2.0);
// dumpsterOpen native 0.6 x 0.55 x 0.48 -> 0.84 x 1.05 x 0.84
const SCALE_BARREL = new THREE.Vector3(1.40, 1.91, 1.75);
// pine native 0.7 x 0.4 x 0.7 -> 1.05 x 2.0 x 1.05 (anisotropic to
// stretch the short Kenney pine into a full game-scale tree)
const SCALE_TREE = new THREE.Vector3(1.50, 5.00, 1.50);
// block native 0.5 x 0.5 x 0.5 -> 2.6 x 1.1 x 0.7 (long concrete wall)
const SCALE_HEDGEROW = new THREE.Vector3(5.20, 2.20, 1.40);

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
// blocks line of sight for that stance.
export const OBSTACLE_HEIGHT: Record<ObstacleKind, number> = {
  crate: 1.08,    // dumpsterClosed scaled top
  lowwall: 0.6,   // barrierA scaled top
  cover: 1.40,    // barrierB scaled top
  boulder: 1.0,   // block scaled top
  barrel: 1.05,   // dumpsterOpen scaled top
  // Police cruiser scaled tops at ~1.0 m, fire truck at ~1.33 m.
  // Pick the smaller to be conservative: even if the spawn rolls a
  // police cruiser the LOS rule still places it just above the
  // standing-cover threshold (1.0 m).
  car: 1.05,
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

export function buildObstacleMesh(o: Obstacle): THREE.Object3D {
  switch (o.kind) {
    case 'crate': {
      // Closed dumpster as a chest-high prop the player can hide
      // behind. Sits flat on the ground (model bottom at y=0 native).
      const g = createKitProp('dumpsterClosed', SCALE_CRATE);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      return g;
    }
    case 'lowwall': {
      // Concrete jersey barrier - knee-high, doesn't block standing
      // line of sight but breaks crouched LOS.
      const g = createKitProp('barrierA', SCALE_LOWWALL);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      return g;
    }
    case 'cover': {
      // Tall concrete barrier with sign panel - blocks standing LOS
      // and reads as a "warning sign" landmark.
      const g = createKitProp('barrierB', SCALE_COVER);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
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
      // X axis. Random Y rotation flips half of them width-wise so
      // they don't all run along the same axis.
      const g = createKitProp('block', SCALE_HEDGEROW);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      return g;
    }
    case 'car': {
      // 50/50 between police cruiser and fire truck so the yard reads
      // as a real impound mix rather than a fleet of identical cars.
      // createVehicle returns a pre-scaled Group; we just position +
      // yaw it.
      const kind = Math.random() < 0.5 ? 'police' : 'firetruck';
      const g = createVehicle(kind);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
      return g;
    }
    case 'tree': {
      // Stretched pine model: tall thin Y, modest X/Z so the result
      // reads as a real game-scale tree rather than a 0.4 m bush.
      const g = createKitProp('treePine', SCALE_TREE);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      return g;
    }
  }
}

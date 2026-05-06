import * as THREE from 'three';
import type { Obstacle, ObstacleKind } from '../types/world';
import { markShared } from '../util/dispose';
import { createKitProp } from './KitProps';
import { createVehicle } from './Vehicle';

// Procedural tree trunk: the Kenney pine OBJ is a flat alpha-cut
// billboard whose texture trunk is too narrow to survive the
// alpha-test threshold (looks like the tree is floating with no
// trunk). A small brown cylinder at the base grounds it visually.
const TREE_TRUNK_GEO = markShared(
  new THREE.CylinderGeometry(0.18, 0.22, 1.0, 10),
);
const TREE_TRUNK_MAT = markShared(
  new THREE.MeshStandardMaterial({
    color: 0x5a3c20,
    emissive: 0x3a2614,
    emissiveIntensity: 0.40,
    roughness: 0.95,
  }),
);

// Build a tree group: trunk cylinder + alpha-cut pine billboards
// stacked at the right Y. `sceneScale` is the foliage's scale Vector3
// (matches the prior createKitProp call); the trunk is sized in
// world units so it stays consistent regardless of foliage scale.
// Exported so the backdrop tree-row uses the same helper.
export function buildTreeGroup(variant: 'treeA' | 'treeB', sceneScale: THREE.Vector3, trunkH: number): THREE.Group {
  const g = new THREE.Group();
  // Foliage planes go in unscaled-y first, then scaled by the kit
  // helper. Keep their bottom at y=0 so the tree appears to grow
  // from the ground.
  const foliage = createKitProp('treePine', sceneScale, variant);
  g.add(foliage);
  // Trunk: scale Y to the requested height so the trunk sits
  // proportional to the foliage. Radius is left at native (looks
  // right at the size we ship today).
  const trunk = new THREE.Mesh(TREE_TRUNK_GEO, TREE_TRUNK_MAT);
  trunk.scale.y = trunkH;
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  return g;
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
const SCALE_CRATE = new THREE.Vector3(2.0, 2.0, 2.0);
// barrierA native 0.66 x 0.33 x 0.24 -> 1.6 x 0.6 x 0.6
const SCALE_LOWWALL = new THREE.Vector3(2.42, 1.82, 2.50);
// barrierB native 0.66 x 0.33 x 0.24 -> ~2.0 x 1.4 x 1.0
const SCALE_COVER = new THREE.Vector3(3.03, 4.24, 4.17);
// block native 0.5 x 0.5 x 0.5 -> 1.0 x 1.0 x 1.0
const SCALE_BOULDER = new THREE.Vector3(2.0, 2.0, 2.0);
// dumpsterOpen native 0.6 x 0.55 x 0.48 -> 0.84 x 1.05 x 0.84
const SCALE_BARREL = new THREE.Vector3(1.40, 1.91, 1.75);
// Pine model uses crossed alpha-cut billboard planes; the visible
// silhouette only fills the central column of the 64x64 texture, so
// the scale has to overshoot the desired visible footprint to make
// the tree read as more than a sprig. (4.0, 9.0, 4.0) lands the
// silhouette at roughly 2 m wide x 3.6 m tall after the alpha-cut
// crops it - a real game-scale tree the player can hide behind,
// rather than the prior arborvitae shrub.
const SCALE_TREE = new THREE.Vector3(4.00, 9.00, 4.00);
// block native 0.5 x 0.5 x 0.5 -> 2.6 x 1.1 x 0.7 (long concrete wall)
const SCALE_HEDGEROW = new THREE.Vector3(5.20, 2.20, 1.40);

// Collision radius the procgen should treat each kind as for the
// min-spacing rule. Long shapes (car, hedgerow) get larger radii so
// the procgen leaves room around them.
export const OBSTACLE_RADIUS: Record<ObstacleKind, number> = {
  // Crate (dumpsterClosed scaled 2x) is asymmetric (1.2 x 0.9 m), so
  // it uses a circle-vs-OBB hitbox via halfW/halfL/rotY rolled by
  // the procgen. `r` here is the bounding circle - used by procgen
  // min-spacing only.
  crate: 0.76,
  lowwall: 0.6,
  cover: 0.9,
  // Block scaled to a 1 m cube. Inscribed (= half-width) is 0.5;
  // tightening from 0.65 eliminates the ~0.15 m phantom zone the
  // larger r left around every cube face. The block is rotationally
  // symmetric enough that a circle approximation is correct here.
  boulder: 0.5,
  // Open-dumpster footprint is ~0.84 m square; r = 0.45 sits 0.03 m
  // outside the inscribed circle so the phantom zone is sub-tile and
  // doesn't read as a ghost wall.
  barrel: 0.45,
  car: 2.7,
  // Tree mesh is a 2.1 m crossed-billboard plane but the alpha-cut
  // pine silhouette only covers the central column of the texture
  // (~0.4-0.5 m visible half-width). r = 0.5 lines the player up to
  // the actual silhouette instead of the rectangular plane edges.
  tree: 0.5,
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

export function buildObstacleMesh(o: Obstacle): THREE.Object3D {
  switch (o.kind) {
    case 'crate': {
      // Closed dumpster as a chest-high prop the player can hide
      // behind. Sits flat on the ground (model bottom at y=0 native).
      // rotY is pre-rolled by the procgen so the OBB hitbox stays
      // synced with the visual rotation.
      const g = createKitProp('dumpsterClosed', SCALE_CRATE);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = o.rotY ?? Math.random() * Math.PI * 2;
      return g;
    }
    case 'lowwall': {
      // Concrete jersey barrier - knee-high, doesn't block standing
      // line of sight but breaks crouched LOS. rotY is pre-rolled by
      // the procgen so the OBB hitbox + visual mesh stay synced.
      const g = createKitProp('barrierA', SCALE_LOWWALL);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = o.rotY ?? (Math.random() < 0.5 ? 0 : Math.PI / 2);
      return g;
    }
    case 'cover': {
      // Tall concrete barrier with sign panel - blocks standing LOS
      // and reads as a "warning sign" landmark.
      const g = createKitProp('barrierB', SCALE_COVER);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = o.rotY ?? (Math.random() < 0.5 ? 0 : Math.PI / 2);
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
      g.rotation.y = o.rotY ?? (Math.random() < 0.5 ? 0 : Math.PI / 2);
      return g;
    }
    case 'car': {
      // Procgen pre-rolls the variant + Y rotation (so the hitbox
      // OBB and the visual mesh stay synced).
      const kind: 'police' | 'firetruck' =
        o.subKind ?? (Math.random() < 0.8 ? 'police' : 'firetruck');
      const g = createVehicle(kind);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = o.rotY ?? (Math.floor(Math.random() * 4) * Math.PI) / 2;
      return g;
    }
    case 'tree': {
      // Stretched pine model + a procedural trunk cylinder. 50/50
      // between the dark-green pine (treeB) and warm autumn foliage
      // (treeA). The trunk grounds the otherwise floating alpha-cut
      // foliage so the tree reads as a real tree with a base.
      const variant = Math.random() < 0.5 ? 'treeB' : 'treeA';
      const g = buildTreeGroup(variant, SCALE_TREE, 1.2);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      return g;
    }
  }
}

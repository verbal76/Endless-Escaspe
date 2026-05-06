import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { Guard, Player } from '../types/world';
import { dist2Sq } from '../util/math';
import { PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';
import { dog_OBJ } from '../../assets/animals/dogObj';

// Patrol dog. Behaviour summary:
// - Trails its handler guard while the guard is patrolling.
// - "Smells" the player out to SMELL_RADIUS regardless of
//   line-of-sight; a scaled fraction of that smell is added to the
//   handler guard's detection meter every frame.
// - When the handler enters chase, the dog detaches and runs the
//   player down at a higher top speed than the guards.
// - On reaching the player it costs a heart (caller handles the
//   collision check via dogHits()).
//
// Visualised by a Kenney low-poly OBJ (assets/animals/dog.obj).
// All UVs in that mesh cluster on a single column of the kit's
// shared colormap.png, so the dog was designed as one uniform
// colour - we apply a solid orange-red material that matches the
// preview thumbnail.

// Native Kenney rig is ~0.67 m long; scale up a touch so the dog
// reads at a similar footprint to the prior procedural one (~0.62 m).
const DOG_SCALE = 1.4;

// Solid orange-red material matching the kit preview. The dog OBJ's
// UVs all sample u=0.719, v~0.1 of the kit's colormap.png (which
// we don't have for the animal pack), so a single MeshStandardMaterial
// stands in correctly without requiring the texture.
const DOG_MAT = new THREE.MeshStandardMaterial({
  color: 0xc26a3a,
  emissive: 0xc26a3a,
  emissiveIntensity: 0.20,
  roughness: 0.7,
});
markShared(DOG_MAT);

// Cache: parse the OBJ once, then clone the geometry list per spawn.
type ParsedDog = {
  parts: Array<{ geometry: THREE.BufferGeometry }>;
};
let DOG_TEMPLATE: ParsedDog | null = null;
function getDogTemplate(): ParsedDog {
  if (DOG_TEMPLATE) return DOG_TEMPLATE;
  const root = new OBJLoader().parse(dog_OBJ);
  const parts: ParsedDog['parts'] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    // The Kenney rig has +X = forward (head at +X, tail at -X). The
    // game's facing convention has +Z = forward (setDogTransform
    // rotates the group around Y by d.facing assuming a +Z-forward
    // model). Rotate the template geometry once at parse time so
    // every spawned dog inherits the corrected orientation - cheaper
    // than wrapping every group with a baseline-rotation child.
    geo.rotateY(-Math.PI / 2);
    markShared(geo);
    parts.push({ geometry: geo });
  });
  DOG_TEMPLATE = { parts };
  return DOG_TEMPLATE;
}

export const SMELL_RADIUS = 9;
const SMELL_RADIUS_SQ = SMELL_RADIUS * SMELL_RADIUS;
// Per-second contribution to the handler guard's detection meter
// at zero distance. Falls off linearly with smell distance. Tuned
// so a dog parked next to the player is comparable to a guard
// staring at them through a flashlight cone.
const SMELL_RATE = 0.25;

const DOG_PATROL_SPEED = 2.2;
const DOG_CHASE_SPEED = 7.5;

export const DOG_HIT_RADIUS = 0.45;

type DogState = 'leash' | 'chase';

export type Dog = {
  id: number;
  handlerGuardId: number;
  x: number;
  z: number;
  facing: number;
  state: DogState;
  group: THREE.Group;
};

export function createDog(id: number, handlerGuardId: number, x: number, z: number): Dog {
  const group = new THREE.Group();
  const template = getDogTemplate();
  for (const part of template.parts) {
    // Per-instance geometry clone so the dispose pass on scene
    // rebuild can free this dog's GPU buffers without touching the
    // shared template. Unmark shared on the clone so the walker
    // doesn't skip it.
    const geo = part.geometry.clone();
    geo.userData.shared = false;
    group.add(new THREE.Mesh(geo, DOG_MAT));
  }
  group.scale.setScalar(DOG_SCALE);
  group.position.set(x, 0, z);
  return { id, handlerGuardId, x, z, facing: 0, state: 'leash', group };
}

function moveToward(d: Dog, tx: number, tz: number, speed: number, dt: number) {
  const dx = tx - d.x;
  const dz = tz - d.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const nx = d.x + (dx / len) * speed * dt;
  const nz = d.z + (dz / len) * speed * dt;
  d.x = Math.max(-PLAY_HALF_W + 0.5, Math.min(PLAY_HALF_W - 0.5, nx));
  d.z = nz;
  d.facing = Math.atan2(dx, dz);
}

// Update the dog AI for one frame. Caller passes the handler guard
// (looked up via handlerGuardId) so the dog can either trail it or,
// if the guard is chasing, cut loose and run the player down.
//
// Returns the smell contribution for *this* frame so the caller can
// add it onto the handler guard's detection meter. Returns 0 when
// the dog has detached into chase (the dog itself is the threat at
// that point; smell stops mattering).
export function updateDog(d: Dog, handler: Guard | undefined, p: Player, dt: number): number {
  // Detach into chase when the handler does, OR when the player
  // walks into the smell radius. Otherwise trail the handler at a
  // small offset.
  const dSq = dist2Sq(d.x, d.z, p.x, p.z);
  if (handler && handler.state === 'chase') {
    d.state = 'chase';
  } else if (d.state === 'leash' && dSq <= SMELL_RADIUS_SQ * 0.18) {
    // Standing next to a dog tips them off even without their
    // handler reacting. (Smell-radius * sqrt(0.18) ~= 38% of full.)
    d.state = 'chase';
  }

  if (d.state === 'chase') {
    moveToward(d, p.x, p.z, DOG_CHASE_SPEED, dt);
  } else if (handler) {
    // Trail position: 1m to the side of the handler, on whichever
    // side leaves the dog inside the playfield.
    const offset = handler.x < 0 ? 1 : -1;
    moveToward(d, handler.x + offset, handler.z, DOG_PATROL_SPEED, dt);
  }

  // Smell contribution to the handler's detection meter only while
  // still on leash.
  if (d.state === 'leash' && handler && dSq <= SMELL_RADIUS_SQ) {
    const proximity = 1 - dSq / SMELL_RADIUS_SQ;
    return SMELL_RATE * proximity * dt;
  }
  return 0;
}

export function setDogTransform(d: Dog) {
  d.group.position.set(d.x, 0, d.z);
  d.group.rotation.y = d.facing;
}

export function dogHits(d: Dog, p: Player): boolean {
  return dist2Sq(d.x, d.z, p.x, p.z) <= DOG_HIT_RADIUS * DOG_HIT_RADIUS;
}

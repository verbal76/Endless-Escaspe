import * as THREE from 'three';
import type { Guard, Player } from '../types/world';
import { dist2Sq } from '../util/math';
import { PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';

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
// Visually a tan-and-black blocky quadruped. Cheap to render
// (six primitives) so spawning two at once is a non-issue.

const BODY_W = 0.32;
const BODY_H = 0.30;
const BODY_L = 0.62;
const HEAD_R = 0.18;
const LEG_W = 0.10;
const LEG_H = 0.32;

const BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x6b4828,
  roughness: 0.85,
});
const HEAD_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a3018,
  roughness: 0.85,
});

[BODY_MAT, HEAD_MAT].forEach((m) => markShared(m));

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

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_W, BODY_H, BODY_L),
    BODY_MAT,
  );
  body.position.set(0, BODY_H / 2 + LEG_H, 0);
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R, 14, 10),
    HEAD_MAT,
  );
  head.position.set(0, BODY_H + LEG_H, BODY_L / 2 + HEAD_R * 0.4);
  group.add(head);

  // Four legs arranged in a rectangle under the body.
  const legGeo = new THREE.BoxGeometry(LEG_W, LEG_H, LEG_W);
  const legPositions: [number, number][] = [
    [-BODY_W / 2 + LEG_W / 2, -BODY_L / 2 + LEG_W],
    [+BODY_W / 2 - LEG_W / 2, -BODY_L / 2 + LEG_W],
    [-BODY_W / 2 + LEG_W / 2, +BODY_L / 2 - LEG_W],
    [+BODY_W / 2 - LEG_W / 2, +BODY_L / 2 - LEG_W],
  ];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, BODY_MAT);
    leg.position.set(lx, LEG_H / 2, lz);
    group.add(leg);
  }

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

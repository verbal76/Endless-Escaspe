import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { Guard, Obstacle, Player } from '../types/world';
import type { NavGrid } from '../systems/NavGrid';
import { createNavState, navigateToward, resetNavState, type NavState } from '../systems/Navigator';
import type { SmokeRegion } from '../systems/DetectionSystem';
import { dist2Sq } from '../util/math';
import { PLAY_HALF_W } from '../util/geometry';
import { markShared } from '../util/dispose';
import { dog_OBJ } from '../../assets/animals/dogObj';
import { getVehicleColormap } from '../util/textures';
import { tagAuditMaterial } from '../util/renderAudit';

// Patrol dog. Behaviour summary:
// - Trails its handler guard while the guard is patrolling.
// - "Smells" the player out to SMELL_RADIUS regardless of
//   line-of-sight; a scaled fraction of that smell is added to the
//   handler guard's detection meter every frame.
// - When the handler enters chase (or the player gets too close) the
//   dog detaches and runs the player down, pathing around props.
// - Escapable: a sprinting player outruns it, it gives up at range
//   or after a while without closing in, smoke makes it lose the
//   scent, and a crowbar swing scares it off.
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

// The Kenney animal pack and vehicle pack share the same colormap.png
// palette atlas, so the dog's UVs (which cluster on a single column
// of that atlas) index correctly into the texture we already loaded
// for vehicles. Build the material lazily so the texture preload has
// finished by the time createDog runs.
let CACHED_DOG_MAT: THREE.MeshLambertMaterial | null = null;
function getDogMaterial(): THREE.MeshLambertMaterial {
  if (CACHED_DOG_MAT) return CACHED_DOG_MAT;
  const tex = getVehicleColormap();
  const mat = tex
    ? new THREE.MeshLambertMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.08,
      })
    : new THREE.MeshLambertMaterial({
        // Fallback if the texture preload didn't resolve: solid
        // orange-red matching the kit preview thumbnail.
        color: 0xc26a3a,
        emissive: 0xc26a3a,
        emissiveIntensity: 0.08,
      });
  markShared(mat);
  tagAuditMaterial(mat, 'dogs', 'dog');
  CACHED_DOG_MAT = mat;
  return mat;
}

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
// Faster than a walking or crouching player, slower than a sprint
// (7.0 m/s): a running player can always open distance.
export const DOG_CHASE_SPEED = 5.6;
const DOG_RETURN_SPEED = 3.4;
const DOG_FLEE_SPEED = 6.0;
// A dog gives up when the player gets this far ahead...
export const DOG_GIVE_UP_DIST = 15;
// ...or when its sprint burst runs out. Sized so that from stage 5
// (stamina-limited sprints, ~3.3 s) a sprint followed by walking
// still escapes: the sprint opens ~4.6 m and the dog then needs >6 s
// to close it again. A player who never runs gets caught.
export const DOG_CHASE_BURST_S = 6;
// Standing next to a leashed dog tips it off; crouching lets you
// slip closer.
export const DOG_TRIGGER_STANDING = 3.8;
export const DOG_TRIGGER_CROUCHED = 2.2;
export const DOG_CONFUSED_S = 3.5;
export const DOG_FLEE_S = 4;
// After losing the scent the dog won't re-engage for this long.
const DOG_REENGAGE_COOLDOWN_S = 4;
const DOG_RADIUS = 0.4;

export const DOG_HIT_RADIUS = 0.45;

// leash    - trailing the handler, sniffing (feeds handler's meter)
// chase    - running the player down
// confused - lost the scent in smoke; sniffs around aimlessly
// flee     - scared off by a crowbar swing
// return   - trotting back to the handler
export type DogState = 'leash' | 'chase' | 'confused' | 'flee' | 'return';

export type Dog = {
  id: number;
  handlerGuardId: number;
  x: number;
  z: number;
  facing: number;
  state: DogState;
  stateTimer: number;
  // Seconds spent in the current chase burst.
  sinceClose: number;
  cooldown: number;
  wanderX: number;
  wanderZ: number;
  nav: NavState;
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
    group.add(new THREE.Mesh(geo, getDogMaterial()));
  }
  group.scale.setScalar(DOG_SCALE);
  group.position.set(x, 0, z);
  return {
    id,
    handlerGuardId,
    x,
    z,
    facing: 0,
    state: 'leash',
    stateTimer: 0,
    sinceClose: 0,
    cooldown: 0,
    wanderX: x,
    wanderZ: z,
    nav: createNavState(),
    group,
  };
}

// Dogs face along +Z-forward models: facing = atan2(dx, dz).
const dogFacing = (dx: number, dz: number) => Math.atan2(dx, dz);

function setDogState(d: Dog, next: DogState, timer: number = 0) {
  d.state = next;
  d.stateTimer = timer;
  d.sinceClose = 0;
  resetNavState(d.nav);
}

export function resetDog(d: Dog, x: number, z: number) {
  d.x = x;
  d.z = z;
  d.cooldown = 0;
  setDogState(d, 'leash');
}

function inSmoke(regions: readonly SmokeRegion[], x: number, z: number): boolean {
  for (const r of regions) {
    const dx = x - r.x;
    const dz = z - r.z;
    if (dx * dx + dz * dz <= r.radius * r.radius) return true;
  }
  return false;
}

export type DogWorld = {
  grid: NavGrid | null;
  obstacles: readonly Obstacle[];
  smoke: readonly SmokeRegion[];
};

const EMPTY_WORLD: DogWorld = { grid: null, obstacles: [], smoke: [] };

function go(d: Dog, tx: number, tz: number, speed: number, dt: number, w: DogWorld): boolean {
  return navigateToward(d, tx, tz, speed, dt, w.grid, w.obstacles, {
    radius: DOG_RADIUS,
    repathEvery: d.state === 'chase' ? 0.35 : undefined,
    facingFn: dogFacing,
  });
}

// Update the dog AI for one frame. Returns the smell contribution for
// the handler's detection meter this frame (only while leashed).
export function updateDog(
  d: Dog,
  handler: Guard | undefined,
  p: Player,
  dt: number,
  w: DogWorld = EMPTY_WORLD,
): number {
  d.cooldown = Math.max(0, d.cooldown - dt);
  d.stateTimer = Math.max(0, d.stateTimer - dt);
  const dSq = dist2Sq(d.x, d.z, p.x, p.z);
  const playerHiddenBySmoke = inSmoke(w.smoke, p.x, p.z) || inSmoke(w.smoke, d.x, d.z);

  // Engage.
  if ((d.state === 'leash' || d.state === 'return') && d.cooldown <= 0 && !playerHiddenBySmoke) {
    const trigger = p.isCrouched ? DOG_TRIGGER_CROUCHED : DOG_TRIGGER_STANDING;
    const handlerChasing = !!handler && handler.state === 'chase' && dSq <= DOG_GIVE_UP_DIST * DOG_GIVE_UP_DIST;
    if (handlerChasing || dSq <= trigger * trigger) setDogState(d, 'chase');
  }

  switch (d.state) {
    case 'chase': {
      if (playerHiddenBySmoke) {
        // Smoke kills the scent: the dog loses track and sniffs around.
        setDogState(d, 'confused', DOG_CONFUSED_S);
        d.wanderX = d.x;
        d.wanderZ = d.z;
        break;
      }
      d.sinceClose += dt;
      if (dSq > DOG_GIVE_UP_DIST * DOG_GIVE_UP_DIST || d.sinceClose > DOG_CHASE_BURST_S) {
        setDogState(d, 'return');
        d.cooldown = DOG_REENGAGE_COOLDOWN_S;
        break;
      }
      go(d, p.x, p.z, DOG_CHASE_SPEED, dt, w);
      break;
    }
    case 'confused': {
      // Short aimless sniffing hops around where the scent was lost.
      if (Math.hypot(d.wanderX - d.x, d.wanderZ - d.z) < 0.4) {
        const a = Math.random() * Math.PI * 2;
        d.wanderX = Math.max(-PLAY_HALF_W + 1, Math.min(PLAY_HALF_W - 1, d.x + Math.cos(a) * 2));
        d.wanderZ = d.z + Math.sin(a) * 2;
      }
      if (!go(d, d.wanderX, d.wanderZ, 1.6, dt, w)) {
        d.wanderX = d.x;
        d.wanderZ = d.z;
      }
      if (d.stateTimer <= 0) {
        setDogState(d, 'return');
        d.cooldown = DOG_REENGAGE_COOLDOWN_S;
      }
      break;
    }
    case 'flee': {
      const dx = d.x - p.x;
      const dz = d.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      if (!go(d, d.x + (dx / len) * 4, d.z + (dz / len) * 4, DOG_FLEE_SPEED, dt, w)) {
        // Cornered: bolt sideways instead.
        go(d, d.x - (dz / len) * 4, d.z + (dx / len) * 4, DOG_FLEE_SPEED, dt, w);
      }
      if (d.stateTimer <= 0) {
        setDogState(d, 'return');
        d.cooldown = DOG_REENGAGE_COOLDOWN_S;
      }
      break;
    }
    case 'return': {
      if (!handler) {
        setDogState(d, 'leash');
        break;
      }
      const offset = handler.x < 0 ? 1 : -1;
      const ok = go(d, handler.x + offset, handler.z, DOG_RETURN_SPEED, dt, w);
      if (!ok || dist2Sq(d.x, d.z, handler.x + offset, handler.z) < 1.5) setDogState(d, 'leash');
      break;
    }
    case 'leash':
    default: {
      if (handler) {
        // Trail position: 1m to the side of the handler, on whichever
        // side leaves the dog inside the playfield.
        const offset = handler.x < 0 ? 1 : -1;
        go(d, handler.x + offset, handler.z, DOG_PATROL_SPEED, dt, w);
      }
      break;
    }
  }

  // Smell contribution to the handler's detection meter only while
  // still on leash.
  if (d.state === 'leash' && handler && dSq <= SMELL_RADIUS_SQ && !playerHiddenBySmoke) {
    const proximity = 1 - dSq / SMELL_RADIUS_SQ;
    return SMELL_RATE * proximity * dt;
  }
  return 0;
}

// Crowbar swing within reach sends the dog running. Returns true if
// the dog was scared off.
export function scareDog(d: Dog, px: number, pz: number, reach: number): boolean {
  if (dist2Sq(d.x, d.z, px, pz) > reach * reach) return false;
  setDogState(d, 'flee', DOG_FLEE_S);
  d.cooldown = DOG_FLEE_S + DOG_REENGAGE_COOLDOWN_S;
  return true;
}

export function setDogTransform(d: Dog) {
  d.group.position.set(d.x, 0, d.z);
  d.group.rotation.y = d.facing;
}

export function dogHits(d: Dog, p: Player): boolean {
  if (d.state !== 'chase') return false;
  return dist2Sq(d.x, d.z, p.x, p.z) <= DOG_HIT_RADIUS * DOG_HIT_RADIUS;
}

// Advance every dog exactly once per frame and return the smell each
// leashed dog feeds its handler (keyed by handler guard id).
//
// Previously dogs were ticked from two places - the per-guard
// detection pass (every dog of that handler, whatever its state) and
// a later "detached dogs" pass (every chasing dog) - so a chasing dog
// moved twice per frame, covering ~15 m/s instead of its chase speed.
export function updateDogs(
  dogs: readonly Dog[],
  guards: readonly Guard[],
  p: Player,
  dt: number,
  out: Map<number, number>,
  w: DogWorld = EMPTY_WORLD,
): Map<number, number> {
  out.clear();
  for (const d of dogs) {
    const handler = guards.find((g) => g.id === d.handlerGuardId);
    // A crowbar-stunned handler holds the leash still: the dog stays
    // put and contributes no smell until the handler gets up.
    if (d.state === 'leash' && handler && handler.stunTimer > 0) continue;
    const smell = updateDog(d, handler, p, dt, w);
    if (handler && smell > 0) out.set(handler.id, (out.get(handler.id) ?? 0) + smell);
  }
  return out;
}

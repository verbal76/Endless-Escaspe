import type { Object3D } from 'three';

export type RunState = 'idle' | 'playing' | 'caught' | 'cleared';

export type ObstacleKind =
  | 'crate'
  | 'lowwall'
  | 'cover'
  | 'boulder'
  | 'barrel'
  | 'car'
  | 'tree'
  | 'hedgerow';

export type Obstacle = {
  id: number;
  kind: ObstacleKind;
  // Legacy lane index; unused by the continuous-X procgen but kept
  // optional so older modules and saved data don't break.
  lane?: number;
  x: number;
  z: number;
  r: number;
  // World-space top of the obstacle, in metres above the ground.
  // DetectionSystem uses this to decide whether the obstacle is tall
  // enough to break line of sight against the player's current stance.
  height: number;
  isCover: boolean;
  mesh: Object3D | null;
};

export type Projectile = {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  // Seconds remaining before despawn even if it never hits anything.
  life: number;
  mesh: Object3D | null;
};

// Items the player can grab off the ground and use later.
//   crowbar    - melee stun on the nearest guard within range.
//   smokebomb  - drops a vision-blocking cloud at the player's feet
//                that hides them from any guard inside the radius.
export type PickupKind = 'crowbar' | 'smokebomb';

export type Pickup = {
  id: number;
  kind: PickupKind;
  x: number;
  z: number;
  // Pickup overlap radius. Larger than the visual mesh so the player
  // doesn't have to thread the needle to grab it on the run.
  r: number;
  collected: boolean;
  mesh: Object3D | null;
};

export type Chunk = {
  id: number;
  startZ: number;
  endZ: number;
  obstacles: Obstacle[];
  pickups: Pickup[];
  // Cosmetic chunks past the gameplay segment end. Their meshes
  // render but they're excluded from gameplay queries (collision,
  // detection LOS, pickups), so the player can't walk into a
  // horizon chunk and they never affect difficulty.
  isHorizon?: boolean;
};

// Player movement mode. RUN is a separate, orthogonal speed multiplier
// (input.run) that doubles movement speed for either of these stances.
// CRAWL was removed - the on-hands-and-knees animation is now the
// CROUCH pose visually.
export type Stance = 'crouch' | 'walk';

export type Player = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  stance: Stance;
  isRunning: boolean;
  isCrouched: boolean;
  // Hidden-from-guards: crouched AND within HIDE_RANGE of a cover obstacle.
  isHidden: boolean;
  // Stamina pool 0..1. Drains while running, regenerates while not.
  // While 0 the run toggle can't engage (player breathes through it
  // before they can sprint again). Stamina is only enforced from
  // the stamina-enabled stage tier - see progression.staminaEnabledFor.
  stamina: number;
};

// Guard behaviour state machine.
//   wander      - drifting around home zone toward random target points
//   alert       - heard / saw something, stopped, scanning toward source
//   investigate - moving toward last suspected player position
//   chase       - confirmed visual; sprint at player and fire shots
//   return      - lost the trail, walking back toward home zone
export type GuardState =
  | 'wander'
  | 'alert'
  | 'investigate'
  | 'chase'
  | 'return';

export type Guard = {
  id: number;
  x: number;
  z: number;
  facing: number;
  state: GuardState;
  // Home territory - center + radius. Guards drift around inside this
  // and return to it when they lose interest. Two guards therefore
  // cover different parts of the playfield instead of overlapping.
  homeX: number;
  homeZ: number;
  homeRadius: number;
  wanderTarget: { x: number; z: number };
  wanderTimer: number;
  // Time spent in the current non-wander state. Used to time out alert
  // pauses, give up investigations, etc.
  behaviorTimer: number;
  // Last position the guard suspects the player is at (set when
  // detection contributes mass). Cleared on transition back to wander.
  investigationTarget: { x: number; z: number } | null;
  fireCooldown: number;
  // Seconds remaining of crowbar-induced stun. While > 0 the AI does
  // not transition state, does not move, and DetectionSystem skips
  // its vision contribution. Decays in the AI update tick.
  stunTimer: number;
  mesh: Object3D | null;
  visionMesh: Object3D | null;
};

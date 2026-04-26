import type { Player, Obstacle } from '../types/world';
import { input } from './InputSystem';
import {
  PLAYER_RUN_SPEED,
  PLAYER_WALK_SPEED,
  PLAYER_RADIUS,
  PLAY_HALF_W,
} from '../util/geometry';
import { circleHit } from '../util/collision';

const PLAYFIELD_BACK_Z = -2;

export function updatePlayer(
  p: Player,
  obstacles: readonly Obstacle[],
  dt: number,
  segmentEndZ: number,
) {
  p.isCrouched = input.crouch || p.isHidden;
  p.isRunning = input.run && !p.isCrouched;

  const speed = p.isCrouched
    ? PLAYER_WALK_SPEED * 0.6
    : p.isRunning
      ? PLAYER_RUN_SPEED
      : PLAYER_WALK_SPEED;

  // Free directional control. Joystick UP = +Z (deeper into the yard);
  // RIGHT = +X. No auto-forward, no min-floor on speed.
  p.vx = input.axisX * speed;
  p.vz = input.axisY * speed;

  // Resolve collisions sequentially: X first, then Z from the new X.
  // Parallel resolution leaks at corners because both per-axis tests
  // can read "clear" while diagonal motion still passes through.
  let nx = p.x + p.vx * dt;
  for (const o of obstacles) {
    if (o.isCover) continue;
    if (circleHit({ x: nx, z: p.z, r: PLAYER_RADIUS }, { x: o.x, z: o.z, r: o.r })) {
      nx = p.x;
      break;
    }
  }
  let nz = p.z + p.vz * dt;
  for (const o of obstacles) {
    if (o.isCover) continue;
    if (circleHit({ x: nx, z: nz, r: PLAYER_RADIUS }, { x: o.x, z: o.z, r: o.r })) {
      nz = p.z;
      break;
    }
  }

  // Soft playfield walls: the ground is wide enough that the player
  // can roam, but they can't escape the camera's visible field nor
  // walk past the segment goal/origin.
  const xLimit = PLAY_HALF_W - PLAYER_RADIUS;
  if (nx > xLimit) nx = xLimit;
  if (nx < -xLimit) nx = -xLimit;
  if (nz < PLAYFIELD_BACK_Z) nz = PLAYFIELD_BACK_Z;
  if (nz > segmentEndZ) nz = segmentEndZ;

  p.x = nx;
  p.z = nz;
}

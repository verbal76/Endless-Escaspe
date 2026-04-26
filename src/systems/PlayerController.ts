import type { Player, Obstacle } from '../types/world';
import { input } from './InputSystem';
import {
  PLAYER_RUN_SPEED,
  PLAYER_WALK_SPEED,
  PLAYER_CROUCH_SPEED,
  PLAYER_PRONE_SPEED,
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
  // Stance flags. Crouch and Prone are toggles managed by ActionButtons;
  // Run is a held-press button. Run is suppressed while crouched or prone.
  p.isCrouched = input.crouch && !input.hide;
  p.isProne = input.hide;
  p.isRunning = input.run && !p.isCrouched && !p.isProne;
  // Mirror isProne onto isHidden so any legacy reads continue to work.
  p.isHidden = p.isProne;

  const speed = p.isProne
    ? PLAYER_PRONE_SPEED
    : p.isCrouched
      ? PLAYER_CROUCH_SPEED
      : p.isRunning
        ? PLAYER_RUN_SPEED
        : PLAYER_WALK_SPEED;

  // Joystick UP = +Z (deeper into the yard). RIGHT on the joystick must
  // map to +X on screen, but the camera looks down +Z so screen-right
  // in landscape ends up as -X in world coordinates - hence the X flip.
  p.vx = -input.axisX * speed;
  p.vz = input.axisY * speed;

  // Sequential X-then-Z collision resolution. Cover obstacles are now
  // SOLID (the player can no longer walk through the large dark blocks);
  // they still block guard line-of-sight via DetectionSystem's filter.
  let nx = p.x + p.vx * dt;
  for (const o of obstacles) {
    if (circleHit({ x: nx, z: p.z, r: PLAYER_RADIUS }, { x: o.x, z: o.z, r: o.r })) {
      nx = p.x;
      break;
    }
  }
  let nz = p.z + p.vz * dt;
  for (const o of obstacles) {
    if (circleHit({ x: nx, z: nz, r: PLAYER_RADIUS }, { x: o.x, z: o.z, r: o.r })) {
      nz = p.z;
      break;
    }
  }

  // Soft playfield walls.
  const xLimit = PLAY_HALF_W - PLAYER_RADIUS;
  if (nx > xLimit) nx = xLimit;
  if (nx < -xLimit) nx = -xLimit;
  if (nz < PLAYFIELD_BACK_Z) nz = PLAYFIELD_BACK_Z;
  if (nz > segmentEndZ) nz = segmentEndZ;

  p.x = nx;
  p.z = nz;
}

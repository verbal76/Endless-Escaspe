import type { Player, Obstacle } from '../types/world';
import { input } from './InputSystem';
import {
  PLAYER_LATERAL_SPEED,
  PLAYER_RUN_SPEED,
  PLAYER_WALK_SPEED,
  PLAYER_RADIUS,
} from '../util/geometry';
import { circleHit } from '../util/collision';

export function updatePlayer(p: Player, obstacles: readonly Obstacle[], dt: number) {
  p.isCrouched = input.crouch;
  p.isRunning = input.run && !p.isCrouched;

  const fwdSpeed = p.isCrouched
    ? PLAYER_WALK_SPEED * 0.6
    : p.isRunning
      ? PLAYER_RUN_SPEED
      : PLAYER_WALK_SPEED;

  // Forward motion is auto + axisY scales (negative axisY = backwards but capped).
  const fwd = Math.max(0.2, 1 + input.axisY * 0.4) * fwdSpeed;
  const lat = input.axisX * PLAYER_LATERAL_SPEED;

  p.vx = lat;
  p.vz = fwd;

  const nextX = p.x + p.vx * dt;
  const nextZ = p.z + p.vz * dt;

  // Resolve collisions against non-cover obstacles only; cover is pass-through but tracked separately.
  const me = { x: nextX, z: nextZ, r: PLAYER_RADIUS };
  let blockedX = false;
  let blockedZ = false;
  for (const o of obstacles) {
    if (o.isCover) continue;
    const c = { x: o.x, z: o.z, r: o.r };
    if (circleHit(me, c)) {
      const onlyX = circleHit({ x: nextX, z: p.z, r: PLAYER_RADIUS }, c);
      const onlyZ = circleHit({ x: p.x, z: nextZ, r: PLAYER_RADIUS }, c);
      if (onlyX) blockedX = true;
      if (onlyZ) blockedZ = true;
    }
  }

  p.x = blockedX ? p.x : nextX;
  p.z = blockedZ ? p.z : nextZ;
}

import type { Obstacle, Player } from '../types/world';
import { input } from './InputSystem';
import {
  PLAYER_CROUCH_SPEED,
  PLAYER_RADIUS,
  PLAYER_WALK_SPEED,
  PLAY_HALF_W,
} from '../util/geometry';
import { circleHit, circleHitObb, pushCircleFromObb } from '../util/collision';

// Collision dispatch: obstacles with halfW/halfL/rotY use circle-vs-
// OBB so the player can walk right up to the actual silhouette of
// elongated props (cars, jersey barriers, hedgerows). Obstacles
// without those fields fall back to circle-vs-circle on `o.r`.
function obstacleHitsPlayer(o: Obstacle, px: number, pz: number): boolean {
  if (o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined) {
    return circleHitObb(
      { x: px, z: pz, r: PLAYER_RADIUS },
      { x: o.x, z: o.z, halfW: o.halfW, halfL: o.halfL, rotY: o.rotY },
    );
  }
  return circleHit({ x: px, z: pz, r: PLAYER_RADIUS }, { x: o.x, z: o.z, r: o.r });
}

const PLAYFIELD_BACK_Z = -2;

function baseSpeedFor(stance: Player['stance']): number {
  if (stance === 'crouch') return PLAYER_CROUCH_SPEED;
  return PLAYER_WALK_SPEED;
}

// Stamina drain (per second while running) and regen (per second
// while not). Drain rate is set so a full pool is exhausted after
// ~3.3s of sprinting; regen takes ~6.6s to fully refill.
const STAMINA_DRAIN_PER_S = 0.30;
const STAMINA_REGEN_PER_S = 0.15;

export function updatePlayer(
  p: Player,
  obstacles: readonly Obstacle[],
  dt: number,
  segmentEndZ: number,
  staminaEnabled: boolean = false,
) {
  // Stance and run come straight from the HUD radio/toggle.
  p.stance = input.stance;
  p.isCrouched = p.stance === 'crouch';
  // Stamina gate: when enabled (late stages), running is blocked
  // while the pool is empty. Players still have to release the
  // toggle and re-engage once stamina returns - prevents holding
  // RUN through the whole regen cycle.
  let wantsRun = input.run;
  if (staminaEnabled) {
    if (wantsRun && p.stamina <= 0.001) wantsRun = false;
  }
  p.isRunning = wantsRun;

  // Drain / regen stamina. Always tracked so the HUD can read it
  // even at stages where it's not yet gating movement, but stages
  // before the enabled tier always see a full pool.
  if (!staminaEnabled) {
    p.stamina = 1;
  } else if (p.isRunning) {
    p.stamina = Math.max(0, p.stamina - STAMINA_DRAIN_PER_S * dt);
  } else {
    p.stamina = Math.min(1, p.stamina + STAMINA_REGEN_PER_S * dt);
  }

  const base = baseSpeedFor(p.stance);
  // RUN doubles whatever the stance speed is. Even crawling can "run"
  // (faster crawl); standing run is the fastest movement in the game.
  const speed = p.isRunning ? base * 2 : base;

  // Joystick UP = +Z (deeper into the yard). Joystick RIGHT must map
  // to player-right on screen, but the camera looks down +Z so
  // screen-right in landscape is -X in world coordinates - hence the
  // X flip.
  p.vx = -input.axisX * speed;
  p.vz = input.axisY * speed;

  // Sequential X-then-Z collision resolution. ALL obstacles (including
  // cover) block the player; cover only matters for guard line of
  // sight and the prone-hide check.
  let nx = p.x + p.vx * dt;
  for (const o of obstacles) {
    if (obstacleHitsPlayer(o, nx, p.z)) {
      nx = p.x;
      break;
    }
  }
  let nz = p.z + p.vz * dt;
  for (const o of obstacles) {
    if (obstacleHitsPlayer(o, nx, nz)) {
      nz = p.z;
      break;
    }
  }

  // Anti-stick push-out. If the resolved position still penetrates
  // an obstacle (e.g. soft-wall + obstacle pinch from the previous
  // frame wedged us inside), eject along the surface normal. Four
  // passes catches cases where multiple obstacles overlap. OBB
  // obstacles use pushCircleFromObb (closest-face eject); circular
  // obstacles use the radial eject the prior code did.
  for (let pass = 0; pass < 4; pass++) {
    let pushed = false;
    for (const o of obstacles) {
      if (!obstacleHitsPlayer(o, nx, nz)) continue;
      if (o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined) {
        const out = pushCircleFromObb(nx, nz, PLAYER_RADIUS, {
          x: o.x,
          z: o.z,
          halfW: o.halfW,
          halfL: o.halfL,
          rotY: o.rotY,
        });
        nx = out.x;
        nz = out.z;
        pushed = true;
      } else {
        const dx = nx - o.x;
        const dz = nz - o.z;
        const minD = PLAYER_RADIUS + o.r;
        const distSq = dx * dx + dz * dz;
        if (distSq > 0.0001) {
          const d = Math.sqrt(distSq);
          nx = o.x + (dx / d) * minD;
          nz = o.z + (dz / d) * minD;
          pushed = true;
        }
      }
    }
    if (!pushed) break;
  }

  // Soft playfield walls. PLAY_HALF_W is the half-width of the
  // playfield; the player can roam its full width (the camera now
  // tracks them at 1:1, no lateral dampening).
  const xLimit = PLAY_HALF_W - PLAYER_RADIUS;
  if (nx > xLimit) nx = xLimit;
  if (nx < -xLimit) nx = -xLimit;
  if (nz < PLAYFIELD_BACK_Z) nz = PLAYFIELD_BACK_Z;
  if (nz > segmentEndZ) nz = segmentEndZ;

  p.x = nx;
  p.z = nz;
}

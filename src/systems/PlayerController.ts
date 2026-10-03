import type { Obstacle, Player } from '../types/world';
import { input } from './InputSystem';
import {
  PLAYER_CROUCH_SPEED,
  PLAYER_RADIUS,
  PLAYER_WALK_SPEED,
  PLAYER_X_LIMIT,
} from '../util/geometry';
import { obstacleHitsCircle, pushCircleFromObb } from '../util/collision';

// Collision dispatch: obstacles with halfW/halfL/rotY use circle-vs-
// OBB so the player can walk right up to the actual silhouette of
// elongated props (cars, jersey barriers, hedgerows). Obstacles
// without those fields fall back to circle-vs-circle on `o.r`.
function obstacleHitsPlayer(o: Obstacle, px: number, pz: number): boolean {
  return obstacleHitsCircle(o, px, pz, PLAYER_RADIUS);
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
// Pool level an exhausted player must regain before RUN works again.
export const STAMINA_RECOVER_AT = 0.3;

function firstHit(obstacles: readonly Obstacle[], x: number, z: number): Obstacle | null {
  for (const o of obstacles) {
    if (obstacleHitsPlayer(o, x, z)) return o;
  }
  return null;
}

function isObb(o: Obstacle): o is Obstacle & { halfW: number; halfL: number; rotY: number } {
  return o.halfW !== undefined && o.halfL !== undefined && o.rotY !== undefined;
}

// Where the player would be ejected to from (x, z) for one obstacle.
function pushOut(o: Obstacle, x: number, z: number): { x: number; z: number } {
  if (isObb(o)) {
    return pushCircleFromObb(x, z, PLAYER_RADIUS, { x: o.x, z: o.z, halfW: o.halfW, halfL: o.halfL, rotY: o.rotY });
  }
  const dx = x - o.x;
  const dz = z - o.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.0001) return { x, z };
  const minD = PLAYER_RADIUS + o.r + 0.001;
  return { x: o.x + (dx / d) * minD, z: o.z + (dz / d) * minD };
}

// Outward surface normal of an obstacle at (x, z) (the mover's centre,
// touching or just outside the prop), or null if undefined.
function contactNormal(o: Obstacle, x: number, z: number): { x: number; z: number } | null {
  let nx: number;
  let nz: number;
  if (isObb(o)) {
    const dx = x - o.x;
    const dz = z - o.z;
    const c = Math.cos(-o.rotY);
    const s = Math.sin(-o.rotY);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const cx = Math.max(-o.halfW, Math.min(o.halfW, lx));
    const cz = Math.max(-o.halfL, Math.min(o.halfL, lz));
    let ex = lx - cx;
    let ez = lz - cz;
    if (ex === 0 && ez === 0) {
      // Centre inside the box: nearest face.
      if (o.halfW - Math.abs(lx) < o.halfL - Math.abs(lz)) ex = Math.sign(lx) || 1;
      else ez = Math.sign(lz) || 1;
    }
    const cb = Math.cos(o.rotY);
    const sb = Math.sin(o.rotY);
    nx = ex * cb - ez * sb;
    nz = ex * sb + ez * cb;
  } else {
    nx = x - o.x;
    nz = z - o.z;
  }
  const l = Math.hypot(nx, nz);
  return l > 1e-9 ? { x: nx / l, z: nz / l } : null;
}

// One movement step against props and the playfield bounds.
//
// The bounds clamp is applied BEFORE any collision test (a prop poking
// past the fence used to be tested at the unclamped x, then the clamp
// pulled the player back inside it), and the depenetration pass below
// folds the clamp in. A blocked move first slides along the contact
// surface (velocity minus its into-surface component), so round props
// (trees, barrels) deflect the player around them instead of stopping
// them dead; axis-separated moves remain the fallback.
export function resolveMove(
  x: number,
  z: number,
  dx: number,
  dz: number,
  obstacles: readonly Obstacle[],
  segmentEndZ: number,
): { x: number; z: number } {
  const clampX = (v: number) => Math.max(-PLAYER_X_LIMIT, Math.min(PLAYER_X_LIMIT, v));
  const clampZ = (v: number) => Math.max(PLAYFIELD_BACK_Z, Math.min(segmentEndZ, v));
  let nx = clampX(x + dx);
  let nz = clampZ(z + dz);
  const hit = firstHit(obstacles, nx, nz);
  if (hit) {
    let moved = false;
    // Slide along the contact surface: drop the into-surface part of
    // the step, then project back onto the surface (a tangent step off
    // a curved prop ends a hair inside it).
    const n = contactNormal(hit, x, z);
    if (n) {
      const into = dx * n.x + dz * n.z;
      if (into < 0) {
        let sx = clampX(x + dx - into * n.x);
        let sz = clampZ(z + dz - into * n.z);
        const again = firstHit(obstacles, sx, sz);
        if (again) {
          const out = pushOut(again, sx, sz);
          sx = clampX(out.x);
          sz = clampZ(out.z);
        }
        if (!firstHit(obstacles, sx, sz) && Math.hypot(sx - x, sz - z) <= Math.hypot(dx, dz) + 1e-6) {
          nx = sx;
          nz = sz;
          moved = true;
        }
      }
    }
    if (!moved) {
      // Sequential X-then-Z fallback.
      nx = clampX(x + dx);
      if (firstHit(obstacles, nx, z)) nx = x;
      nz = clampZ(z + dz);
      if (firstHit(obstacles, nx, nz)) nz = z;
    }
  }

  // Anti-stick push-out. If the resolved position still penetrates an
  // obstacle (spawned / respawned inside one, or a pinch between a
  // prop and the fence), eject along the surface normal with the
  // bounds clamp folded into every pass, so the clamp can't undo the
  // push. Several passes catch overlapping obstacles.
  for (let pass = 0; pass < 4; pass++) {
    let pushed = false;
    for (const o of obstacles) {
      if (!obstacleHitsPlayer(o, nx, nz)) continue;
      const out = pushOut(o, nx, nz);
      nx = clampX(out.x);
      nz = clampZ(out.z);
      pushed = true;
    }
    if (!pushed) break;
  }
  if (firstHit(obstacles, nx, nz)) {
    // Still wedged (the push-out points through the fence): take the
    // nearest free spot inside the bounds.
    for (let r = 0.05; r <= 1.2; r += 0.05) {
      let best: { x: number; z: number } | null = null;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const cx = clampX(nx + Math.cos(a) * r);
        const cz = clampZ(nz + Math.sin(a) * r);
        if (!firstHit(obstacles, cx, cz)) {
          best = { x: cx, z: cz };
          break;
        }
      }
      if (best) {
        nx = best.x;
        nz = best.z;
        break;
      }
    }
  }
  return { x: nx, z: nz };
}

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
  // Stamina gate (late stages). Draining the pool to zero latches
  // `exhausted`: running is refused and the RUN toggle is switched
  // off, so the player has to recover to STAMINA_RECOVER_AT and then
  // re-engage RUN. (Previously one frame of regen lifted stamina back
  // over the 0.001 gate, so running flickered on/off every frame at
  // an empty pool.)
  if (!staminaEnabled) {
    p.exhausted = false;
  } else if (p.exhausted && p.stamina >= STAMINA_RECOVER_AT) {
    p.exhausted = false;
  }
  let wantsRun = input.run;
  if (staminaEnabled && p.exhausted) {
    wantsRun = false;
    input.run = false;
  }
  p.isRunning = wantsRun;
  // Sprinting stands the player up: a moving RUN is always upright
  // (running speed, running noise, standing visibility), and letting
  // go of RUN or stopping drops back into the chosen stance. Before,
  // CROUCH + RUN kept crouch's stealth at 1.3x walking speed.
  // RUN left on while standing still keeps the crouch (hiding).
  const moving = input.axisX !== 0 || input.axisY !== 0;
  if (p.isRunning && moving && p.stance === 'crouch') {
    p.stance = 'walk';
    p.isCrouched = false;
  }

  // Drain / regen stamina. Always tracked so the HUD can read it
  // even at stages where it's not yet gating movement, but stages
  // before the enabled tier always see a full pool.
  if (!staminaEnabled) {
    p.stamina = 1;
  } else if (p.isRunning && (input.axisX !== 0 || input.axisY !== 0)) {
    // Only an actual sprint drains: RUN left toggled on while standing
    // still (e.g. hiding) must not empty the pool and lock out the
    // sprint the player will need to get away.
    p.stamina = Math.max(0, p.stamina - STAMINA_DRAIN_PER_S * dt);
    if (p.stamina <= 0) {
      p.exhausted = true;
      p.isRunning = false;
      input.run = false;
    }
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

  const { x: nx, z: nz } = resolveMove(p.x, p.z, p.vx * dt, p.vz * dt, obstacles, segmentEndZ);
  p.x = nx;
  p.z = nz;
}

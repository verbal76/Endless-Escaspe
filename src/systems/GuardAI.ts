import type { Guard, Obstacle, Player } from '../types/world';
import { dist2 } from '../util/math';
import { circleHit } from '../util/collision';
import { PLAY_HALF_W } from '../util/geometry';

// Guards no longer follow a fixed waypoint loop. Each one wanders a
// home zone, reacts to player noise / line-of-sight, escalates
// through alert -> investigate -> chase if stimulus stays high, and
// returns home when it dies down. Two guards therefore feel
// independent rather than two clones of each other.

const SPEED_WANDER = 1.6;
const SPEED_INVESTIGATE = 3.2;
const SPEED_CHASE = 6.5;
const SPEED_RETURN = 2.4;

const WANDER_RETARGET_S = 4.5; // re-pick a wander target this often
const ARRIVE_EPS_SQ = 0.6 * 0.6;

const ALERT_PAUSE_S = 1.6;
const INVESTIGATE_TIMEOUT_S = 7;
const RETURN_HOME_RADIUS = 1.5;

const FIRE_COOLDOWN_S = 1.3;
const GUARD_COLLISION_R = 0.6;

// Detection thresholds drive transitions.
const TH_ALERT = 0.18;     // even small noise triggers a pause + scan
const TH_INVESTIGATE = 0.40;
const TH_CHASE = 1.0;
const TH_LOSE = 0.50;      // if detection drops below 50%, fall back to investigate

export type GuardFireFn = (g: Guard, targetX: number, targetZ: number) => void;

function rngTarget(g: Guard): { x: number; z: number } {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * g.homeRadius;
  // Stay inside playfield even if homeRadius nudges outside.
  const x = Math.max(-PLAY_HALF_W + 1, Math.min(PLAY_HALF_W - 1, g.homeX + Math.cos(angle) * r));
  const z = Math.max(2, Math.min(g.homeZ + g.homeRadius, g.homeZ + Math.sin(angle) * r));
  return { x, z };
}

function moveToward(
  g: Guard,
  tx: number,
  tz: number,
  speed: number,
  obstacles: readonly Obstacle[],
  dt: number,
) {
  const dx = tx - g.x;
  const dz = tz - g.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return;
  let nx = g.x + (dx / d) * speed * dt;
  let nz = g.z + (dz / d) * speed * dt;
  // Simple obstacle steering: if the desired next pos collides, try
  // a perpendicular sidestep. Good enough to keep guards from
  // chronically jamming into a crate; not full pathfinding.
  const blockedFwd = obstacles.some((o) =>
    circleHit({ x: nx, z: nz, r: GUARD_COLLISION_R }, { x: o.x, z: o.z, r: o.r }),
  );
  if (blockedFwd) {
    const px = g.x + (-dz / d) * speed * dt;
    const pz = g.z + (dx / d) * speed * dt;
    const blockedSide = obstacles.some((o) =>
      circleHit({ x: px, z: pz, r: GUARD_COLLISION_R }, { x: o.x, z: o.z, r: o.r }),
    );
    if (!blockedSide) {
      nx = px;
      nz = pz;
    } else {
      // Both directions blocked: stand still this frame.
      nx = g.x;
      nz = g.z;
    }
  }
  g.x = nx;
  g.z = nz;
  g.facing = Math.atan2(dz, dx);
}

function setState(g: Guard, next: Guard['state'], player?: Player) {
  if (g.state === next) return;
  g.state = next;
  g.behaviorTimer = 0;
  if (next === 'investigate' && player) {
    g.investigationTarget = { x: player.x, z: player.z };
  }
  if (next === 'wander' || next === 'return') {
    g.investigationTarget = null;
  }
}

export function updateGuard(
  g: Guard,
  p: Player,
  detection: number,
  dt: number,
  obstacles: readonly Obstacle[],
  onFire?: GuardFireFn,
) {
  // Crowbar stun: the guard freezes in place, no AI tick, no firing.
  // We still drain the cooldown timers and the stun itself so the
  // unstun path is automatic.
  if (g.stunTimer > 0) {
    g.stunTimer = Math.max(0, g.stunTimer - dt);
    g.fireCooldown = Math.max(0, g.fireCooldown - dt);
    return;
  }

  g.behaviorTimer += dt;
  g.wanderTimer += dt;
  g.fireCooldown = Math.max(0, g.fireCooldown - dt);

  // Fresh stimulus while not chasing keeps the investigation target current.
  if (detection >= TH_INVESTIGATE && g.state !== 'chase') {
    g.investigationTarget = { x: p.x, z: p.z };
  }

  // State transitions from detection level.
  if (detection >= TH_CHASE) {
    setState(g, 'chase', p);
  } else if (g.state === 'chase' && detection < TH_LOSE) {
    setState(g, 'investigate', p);
  } else if (g.state !== 'chase' && g.state !== 'investigate' && detection >= TH_INVESTIGATE) {
    setState(g, 'investigate', p);
  } else if (g.state === 'wander' && detection >= TH_ALERT) {
    setState(g, 'alert', p);
    g.investigationTarget = { x: p.x, z: p.z };
  }

  // Behaviour-specific updates and time-outs.
  switch (g.state) {
    case 'alert': {
      // Stand still and look toward suspected source. Tip out to
      // investigate or back to wander based on how the meter moved.
      if (g.investigationTarget) {
        g.facing = Math.atan2(
          g.investigationTarget.z - g.z,
          g.investigationTarget.x - g.x,
        );
      }
      if (g.behaviorTimer >= ALERT_PAUSE_S) {
        if (detection >= TH_INVESTIGATE) setState(g, 'investigate', p);
        else setState(g, 'return');
      }
      break;
    }
    case 'investigate': {
      if (g.investigationTarget) {
        moveToward(g, g.investigationTarget.x, g.investigationTarget.z, SPEED_INVESTIGATE, obstacles, dt);
        const arrived =
          dist2(g.x, g.z, g.investigationTarget.x, g.investigationTarget.z) <= ARRIVE_EPS_SQ;
        if (arrived) {
          // Reached the spot. Hold for a beat as alert; if nothing
          // new happens behaviorTimer will tick up and we'll abandon.
          setState(g, 'alert', p);
        }
      }
      if (g.behaviorTimer >= INVESTIGATE_TIMEOUT_S && detection < TH_INVESTIGATE) {
        setState(g, 'return');
      }
      break;
    }
    case 'chase': {
      moveToward(g, p.x, p.z, SPEED_CHASE, obstacles, dt);
      if (g.fireCooldown <= 0 && onFire) {
        onFire(g, p.x, p.z);
        g.fireCooldown = FIRE_COOLDOWN_S;
      }
      break;
    }
    case 'return': {
      moveToward(g, g.homeX, g.homeZ, SPEED_RETURN, obstacles, dt);
      const home = dist2(g.x, g.z, g.homeX, g.homeZ);
      if (home <= RETURN_HOME_RADIUS * RETURN_HOME_RADIUS) {
        setState(g, 'wander');
        g.wanderTarget = rngTarget(g);
        g.wanderTimer = 0;
      }
      break;
    }
    case 'wander':
    default: {
      const arrived = dist2(g.x, g.z, g.wanderTarget.x, g.wanderTarget.z) <= ARRIVE_EPS_SQ;
      if (arrived || g.wanderTimer >= WANDER_RETARGET_S) {
        g.wanderTarget = rngTarget(g);
        g.wanderTimer = 0;
      }
      moveToward(g, g.wanderTarget.x, g.wanderTarget.z, SPEED_WANDER, obstacles, dt);
      break;
    }
  }
}

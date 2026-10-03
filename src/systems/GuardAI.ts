import type { Guard, Obstacle, Player } from '../types/world';
import { dist2Sq } from '../util/math';
import { clearLine } from '../util/collision';
import { PLAY_HALF_W } from '../util/geometry';
import { simRandom } from '../util/rng';
import type { NavGrid } from './NavGrid';
import { navigateToward, resetNavState } from './Navigator';

// Guards no longer follow a fixed waypoint loop. Each one wanders a
// home zone, reacts to player noise / line-of-sight, escalates
// through alert -> investigate -> chase if stimulus stays high, and
// returns home when it dies down. Two guards therefore feel
// independent rather than two clones of each other.

// Speed tuning rule of thumb (player walk = 3.5, player run = 7.0):
//   wander       - meander
//   alert trail  - slower than walk; "noticed you, not committed"
//   investigate  - just above walk; closes on a walking target
//   chase        - clearly above walk, clearly below run
//
// At chase speed the guard catches a player who's only walking but
// loses ground against a running player on open ground - the player
// can only get caught while sprinting if a bottleneck (corner, two
// obstacles) slows them. That's the intended risk model.
const SPEED_WANDER = 1.6;
const SPEED_ALERT_TRAIL = 1.8;
const SPEED_INVESTIGATE = 4.0;
const SPEED_CHASE = 5.0;
const SPEED_RETURN = 2.4;

const WANDER_RETARGET_S = 4.5; // re-pick a wander target this often
const ARRIVE_EPS_SQ = 0.6 * 0.6;

// Shorter alert pause so guards commit to investigating sooner.
// The prior 1.6 s gave the player a long free window to break LOS
// while the guard stood still scanning.
const ALERT_PAUSE_S = 0.8;

// Search radius around the last-known-target a guard sweeps after
// reaching their investigation point. Combined with the 3x investigate
// timeout below this triples the area an alerted guard covers before
// giving up - the guard now visibly hunts for the player around the
// last sighting instead of standing still and bailing home.
const SEARCH_RADIUS = 6.0;
// 7 -> 21 s: triples the time an alerted guard keeps hunting before
// returning home. With the search-radius behaviour below, that's
// roughly 3x the ground covered after a sighting - the player can't
// just break LOS for a moment and have everyone forget them.
const INVESTIGATE_TIMEOUT_S = 21;
const RETURN_HOME_RADIUS = 1.5;

const FIRE_COOLDOWN_S = 1.3;
// Movement collision radius against props. Slightly under the nav
// grid's clearance (NAV_INFLATE) so planned paths are always
// physically followable.
const GUARD_COLLISION_R = 0.5;

// Detection thresholds drive transitions.
const TH_ALERT = 0.18;     // even small noise triggers a pause + scan
const TH_INVESTIGATE = 0.40;
const TH_CHASE = 1.0;
const TH_LOSE = 0.50;      // if detection drops below 50%, fall back to investigate
// Fire threshold. A guard only opens fire with the meter at or above
// this AND a clear look at the player AND a bullet line that isn't
// blocked by a prop - and only after the AIM_TIME_S telegraph.
export const TH_FIRE = 0.85;
// Visible wind-up before every shot: the guard plants their feet and
// a laser sight tracks the player. Breaking line of sight during the
// wind-up cancels the shot.
export const AIM_TIME_S = 0.7;
// Bullets fly at chest height; anything this tall stops them.
export const BULLET_BLOCK_HEIGHT = 0.8;
// Tier 2+: after losing sight, turn to the last-seen spot and sweep
// the view for this long before moving to search it.
const LOOK_SCAN_S = 1.6;
const LOOK_SWEEP_RAD = (35 * Math.PI) / 180;
// Noise gives a rough bearing, not a GPS fix: heard positions carry
// an error proportional to distance and are refreshed at most this
// often.
const HEAR_REFRESH_S = 0.8;
const HEAR_ERROR_FRAC = 0.25;

export type GuardFireFn = (g: Guard, targetX: number, targetZ: number) => void;

// What the guard perceived this frame (from DetectionSystem) plus the
// stage's AI tier.
export type GuardSenses = {
  visual: boolean;
  heard: boolean;
  aiTier: number;
  // An external feed (floodlight on the player, searchlight jolt, the
  // handler's dog smelling the player) raised this guard's meter this
  // frame. Like noise it gives a rough fix on the player's position,
  // so the guard has somewhere to search instead of freezing.
  external?: boolean;
};

const NO_SENSES: GuardSenses = { visual: false, heard: false, aiTier: 1, external: false };

function rngTarget(g: Guard, grid: NavGrid | null): { x: number; z: number } {
  const angle = simRandom() * Math.PI * 2;
  const r = simRandom() * g.homeRadius;
  // Stay inside playfield even if homeRadius nudges outside.
  let x = Math.max(-PLAY_HALF_W + 1, Math.min(PLAY_HALF_W - 1, g.homeX + Math.cos(angle) * r));
  let z = Math.max(2, Math.min(g.homeZ + g.homeRadius, g.homeZ + Math.sin(angle) * r));
  // Never aim at a spot inside a prop - the guard would grind
  // against it until the retarget timer fired.
  if (grid) {
    const cell = grid.nearestFree(x, z, 8);
    if (cell) {
      x = grid.colX(cell.col);
      z = grid.rowZ(cell.row);
    }
  }
  return { x, z };
}

// Pathfinding move (A* over the guard nav grid with real-footprint
// collision). Returns false when the guard is genuinely stuck so the
// state machine can choose a new goal instead of standing still.
function moveToward(
  g: Guard,
  tx: number,
  tz: number,
  speed: number,
  obstacles: readonly Obstacle[],
  grid: NavGrid | null,
  dt: number,
  repathEvery?: number,
): boolean {
  return navigateToward(g, tx, tz, speed, dt, grid, obstacles, {
    radius: GUARD_COLLISION_R,
    repathEvery,
  });
}

function pickSearchPoint(g: Guard, grid: NavGrid | null, cx: number, cz: number) {
  const angle = simRandom() * Math.PI * 2;
  const r = (0.4 + simRandom() * 0.6) * SEARCH_RADIUS;
  let sx = Math.max(-PLAY_HALF_W + 1, Math.min(PLAY_HALF_W - 1, cx + Math.cos(angle) * r));
  let sz = Math.max(2, cz + Math.sin(angle) * r);
  if (grid) {
    const cell = grid.nearestFree(sx, sz, 8);
    if (cell) {
      sx = grid.colX(cell.col);
      sz = grid.rowZ(cell.row);
    }
  }
  g.investigationTarget = { x: sx, z: sz };
}

function setState(g: Guard, next: Guard['state'], target?: { x: number; z: number } | null) {
  // Invariant: 'investigate' always has a goal. Without a target (no
  // sighting, no noise fix) a guard would stand frozen until the
  // timeout, so a goal-less request is refused: a wandering guard
  // keeps wandering, anyone else heads home.
  if (next === 'investigate' && !target && !g.investigationTarget) {
    if (g.state === 'wander' || g.state === 'return') return;
    next = 'return';
  }
  if (g.state === next) return;
  g.state = next;
  g.behaviorTimer = 0;
  if (next === 'investigate' && target) {
    g.investigationTarget = { x: target.x, z: target.z };
  }
  if (next === 'wander' || next === 'return') {
    g.investigationTarget = null;
  }
  g.aimTimer = 0;
  resetNavState(g.nav);
}

// Where the guard believes the player is: the live position while in
// sight, otherwise the NEWER of the last sighting and the last noise
// fix. (Always preferring an old sighting made a guard that had once
// seen the player ignore every later rock, noise or radio call-out and
// walk back to that old spot.)
export function belief(g: Guard): { x: number; z: number } | null {
  if (g.lastSeen && g.lastHeard) return g.sinceHeard < g.sinceSeen ? g.lastHeard : g.lastSeen;
  return g.lastSeen ?? g.lastHeard;
}

// External noise event at a point (thrown distraction, alarm). The
// guard's attention goes to the *source* of the sound.
export function hearNoiseAt(g: Guard, x: number, z: number) {
  if (g.stunTimer > 0) return;
  g.lastHeard = { x, z };
  g.sinceHeard = 0;
  g.hearTimer = HEAR_REFRESH_S;
  if (g.state !== 'chase') {
    g.investigationTarget = { x, z };
    if (g.state === 'wander' || g.state === 'return' || g.state === 'alert') {
      setState(g, 'investigate', { x, z });
    } else {
      // Already investigating: a new cue (rock, radio call-out) is a
      // new lead, so the search clock restarts for it instead of the
      // guard dropping the fresh spot a second later on the old
      // investigation's timeout.
      g.behaviorTimer = 0;
      resetNavState(g.nav);
    }
  }
}

// Wipe perception memory (segment reset, soft respawn).
export function resetGuardMemory(g: Guard) {
  g.lastSeen = null;
  g.lastHeard = null;
  g.sinceSeen = 999;
  g.sinceHeard = 999;
  g.hearTimer = 0;
  g.lookTimer = 0;
  g.aimTimer = 0;
}

export function updateGuard(
  g: Guard,
  p: Player,
  detection: number,
  dt: number,
  obstacles: readonly Obstacle[],
  onFire?: GuardFireFn,
  grid: NavGrid | null = null,
  senses: GuardSenses = NO_SENSES,
) {
  // Crowbar stun: the guard freezes in place, no AI tick, no firing.
  // We still drain the cooldown timers and the stun itself so the
  // unstun path is automatic.
  if (g.stunTimer > 0) {
    g.stunTimer = Math.max(0, g.stunTimer - dt);
    g.fireCooldown = Math.max(0, g.fireCooldown - dt);
    g.aimTimer = 0;
    return;
  }

  g.behaviorTimer += dt;
  g.wanderTimer += dt;
  g.fireCooldown = Math.max(0, g.fireCooldown - dt);
  g.hearTimer = Math.max(0, g.hearTimer - dt);
  g.sinceHeard += dt;

  // ---- Perception memory -------------------------------------------
  const wasSeeing = g.sinceSeen === 0;
  if (senses.visual) {
    g.lastSeen = { x: p.x, z: p.z };
    g.sinceSeen = 0;
    g.lookTimer = 0;
  } else {
    g.sinceSeen += dt;
    // Tier 2+: the moment sight is lost, turn toward the last-seen
    // spot and scan before committing to a search.
    if (wasSeeing && senses.aiTier >= 2 && g.lastSeen && g.state !== 'wander') {
      g.lookTimer = LOOK_SCAN_S;
      g.lookBase = Math.atan2(g.lastSeen.z - g.z, g.lastSeen.x - g.x);
    }
    if ((senses.heard || senses.external) && g.hearTimer <= 0) {
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      const err = d * HEAR_ERROR_FRAC;
      const a = simRandom() * Math.PI * 2;
      g.lastHeard = { x: p.x + Math.cos(a) * err * simRandom(), z: p.z + Math.sin(a) * err * simRandom() };
      g.sinceHeard = 0;
      g.hearTimer = HEAR_REFRESH_S;
    }
  }
  const believed = senses.visual ? { x: p.x, z: p.z } : belief(g);

  // ---- Shooting (telegraphed, line of sight only) -------------------
  const canShoot =
    !!onFire &&
    senses.visual &&
    detection >= TH_FIRE &&
    g.fireCooldown <= 0 &&
    clearLine(obstacles, g.x, g.z, p.x, p.z, BULLET_BLOCK_HEIGHT);
  if (canShoot) {
    g.aimTimer += dt;
    g.facing = Math.atan2(p.z - g.z, p.x - g.x);
    if (g.aimTimer >= AIM_TIME_S) {
      (onFire as GuardFireFn)(g, p.x, p.z);
      g.fireCooldown = FIRE_COOLDOWN_S;
      g.aimTimer = 0;
    }
  } else {
    g.aimTimer = 0;
  }

  // Fresh stimulus while not chasing keeps the investigation target
  // on what the guard actually perceives.
  if (detection >= TH_INVESTIGATE && g.state !== 'chase' && believed) {
    g.investigationTarget = { x: believed.x, z: believed.z };
  }

  // State transitions from detection level. Chase needs eyes on.
  if (detection >= TH_CHASE && (senses.visual || g.state === 'chase')) {
    setState(g, 'chase');
  } else if (g.state === 'chase' && detection < TH_LOSE) {
    setState(g, 'investigate', believed);
  } else if (g.state !== 'chase' && g.state !== 'investigate' && detection >= TH_INVESTIGATE) {
    setState(g, 'investigate', believed);
  } else if (g.state === 'wander' && detection >= TH_ALERT && believed) {
    setState(g, 'alert');
    g.investigationTarget = { x: believed.x, z: believed.z };
  }

  // Wind-up: feet planted while aiming.
  if (g.aimTimer > 0) return;

  // Tier 2 look-and-scan after losing sight.
  if (g.lookTimer > 0 && !senses.visual) {
    g.lookTimer = Math.max(0, g.lookTimer - dt);
    const phase = 1 - g.lookTimer / LOOK_SCAN_S;
    g.facing = g.lookBase + Math.sin(phase * Math.PI * 2) * LOOK_SWEEP_RAD;
    return;
  }

  // Behaviour-specific updates and time-outs.
  switch (g.state) {
    case 'alert': {
      // Trail toward the suspected source at a slow walk while the
      // alert pause ticks down, then always commit to investigating;
      // the investigate timeout handles giving up.
      if (g.investigationTarget) {
        const ok = moveToward(
          g,
          g.investigationTarget.x,
          g.investigationTarget.z,
          SPEED_ALERT_TRAIL,
          obstacles,
          grid,
          dt,
        );
        // Blocked trail: skip straight to investigating (which
        // re-targets around the blockage) rather than freezing.
        if (!ok) g.behaviorTimer = ALERT_PAUSE_S;
      }
      if (g.behaviorTimer >= ALERT_PAUSE_S) {
        // setState refuses a goal-less investigate (-> return).
        setState(g, 'investigate', g.investigationTarget ?? believed);
      }
      break;
    }
    case 'investigate': {
      if (!g.investigationTarget) {
        // Defensive: nothing to search (the invariant in setState
        // should make this unreachable). Never stand frozen.
        setState(g, 'return');
        break;
      }
      {
        const ok = moveToward(
          g,
          g.investigationTarget.x,
          g.investigationTarget.z,
          SPEED_INVESTIGATE,
          obstacles,
          grid,
          dt,
        );
        const arrived =
          dist2Sq(g.x, g.z, g.investigationTarget.x, g.investigationTarget.z) <= ARRIVE_EPS_SQ;
        if (arrived || !ok) {
          // Reached the spot (or can't get there) - SWEEP the area
          // instead of bailing home. Pick a new search target within
          // SEARCH_RADIUS of the last known position; the guard walks
          // to it, arrives, and picks another, repeating until the
          // investigate timeout fires.
          pickSearchPoint(g, grid, g.investigationTarget.x, g.investigationTarget.z);
          resetNavState(g.nav);
        }
      }
      if (g.behaviorTimer >= INVESTIGATE_TIMEOUT_S && detection < TH_INVESTIGATE) {
        setState(g, 'return');
      }
      break;
    }
    case 'chase': {
      // Pursue the player while in sight; once sight is lost, run to
      // the last sighting - the guard does NOT know where the player
      // went. Arriving there blind drops to a search.
      if (senses.visual) {
        moveToward(g, p.x, p.z, SPEED_CHASE, obstacles, grid, dt, 0.4);
      } else if (g.lastSeen) {
        moveToward(g, g.lastSeen.x, g.lastSeen.z, SPEED_CHASE, obstacles, grid, dt, 0.4);
        if (dist2Sq(g.x, g.z, g.lastSeen.x, g.lastSeen.z) <= 1.0 || g.sinceSeen > 4) {
          setState(g, 'investigate', g.lastSeen);
        }
      } else {
        setState(g, 'investigate', believed);
      }
      // Firing is now handled by the standalone TH_FIRE block at the
      // top of this function so chase / non-chase guards can both
      // shoot. Keep the move-fast behaviour here.
      break;
    }
    case 'return': {
      const ok = moveToward(g, g.homeX, g.homeZ, SPEED_RETURN, obstacles, grid, dt);
      const home = dist2Sq(g.x, g.z, g.homeX, g.homeZ);
      if (!ok || home <= RETURN_HOME_RADIUS * RETURN_HOME_RADIUS) {
        setState(g, 'wander');
        g.wanderTarget = rngTarget(g, grid);
        g.wanderTimer = 0;
      }
      break;
    }
    case 'wander':
    default: {
      const arrived = dist2Sq(g.x, g.z, g.wanderTarget.x, g.wanderTarget.z) <= ARRIVE_EPS_SQ;
      if (arrived || g.wanderTimer >= WANDER_RETARGET_S) {
        g.wanderTarget = rngTarget(g, grid);
        g.wanderTimer = 0;
      }
      const ok = moveToward(g, g.wanderTarget.x, g.wanderTarget.z, SPEED_WANDER, obstacles, grid, dt);
      if (!ok) {
        g.wanderTarget = rngTarget(g, grid);
        g.wanderTimer = 0;
        resetNavState(g.nav);
      }
      break;
    }
  }
}

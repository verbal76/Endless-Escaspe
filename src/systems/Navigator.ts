import type { Obstacle } from '../types/world';
import { anyObstacleHitsCircle } from '../util/collision';
import { PLAY_HALF_W } from '../util/geometry';
import type { NavGrid } from './NavGrid';

// Path-following state for a ground mover (guard or dog). Kept as a
// plain object on the entity so resets are just "clear the path".
export type NavState = {
  path: Array<{ x: number; z: number }> | null;
  pathIdx: number;
  goalX: number;
  goalZ: number;
  repathTimer: number;
  // Seconds of little-to-no progress while trying to move.
  stuckTimer: number;
};

export function createNavState(): NavState {
  return { path: null, pathIdx: 0, goalX: 0, goalZ: 0, repathTimer: 0, stuckTimer: 0 };
}

export function resetNavState(n: NavState) {
  n.path = null;
  n.pathIdx = 0;
  n.repathTimer = 0;
  n.stuckTimer = 0;
}

export type Mover = { x: number; z: number; facing: number; nav: NavState };

export type NavOptions = {
  radius: number;
  // Re-plan interval while the goal keeps moving (chase).
  repathEvery?: number;
  // Facing convention: guards use atan2(dz, dx); dogs use atan2(dx, dz).
  facingFn?: (dx: number, dz: number) => number;
};

const WAYPOINT_EPS = 0.35;
const GOAL_MOVED_SQ = 1.0;
const STUCK_LIMIT_S = 1.2;

function attemptStep(
  m: Mover,
  dirX: number,
  dirZ: number,
  step: number,
  radius: number,
  obstacles: readonly Obstacle[],
): boolean {
  const lim = PLAY_HALF_W - radius;
  const nx = Math.max(-lim, Math.min(lim, m.x + dirX * step));
  const nz = m.z + dirZ * step;
  if (!anyObstacleHitsCircle(obstacles, nx, nz, radius)) {
    m.x = nx;
    m.z = nz;
    return true;
  }
  // Slide along whichever axis is still free.
  if (Math.abs(dirX) > 0.05) {
    const sx = Math.max(-lim, Math.min(lim, m.x + Math.sign(dirX) * step * Math.abs(dirX)));
    if (!anyObstacleHitsCircle(obstacles, sx, m.z, radius)) {
      m.x = sx;
      return true;
    }
  }
  if (Math.abs(dirZ) > 0.05) {
    const sz = m.z + Math.sign(dirZ) * step * Math.abs(dirZ);
    if (!anyObstacleHitsCircle(obstacles, m.x, sz, radius)) {
      m.z = sz;
      return true;
    }
  }
  return false;
}

// Move `m` toward (tx, tz) at `speed`, routing around obstacles with
// the nav grid. Returns false when the mover is stuck (no progress
// for STUCK_LIMIT_S even after re-planning) so the caller's state
// machine can pick a different goal instead of freezing forever.
export function navigateToward(
  m: Mover,
  tx: number,
  tz: number,
  speed: number,
  dt: number,
  grid: NavGrid | null,
  obstacles: readonly Obstacle[],
  opts: NavOptions,
): boolean {
  const n = m.nav;
  const dxGoal = tx - m.x;
  const dzGoal = tz - m.z;
  const distGoal = Math.hypot(dxGoal, dzGoal);
  if (distGoal < 0.05) {
    n.stuckTimer = 0;
    return true;
  }
  n.repathTimer -= dt;
  const goalMoved = (tx - n.goalX) * (tx - n.goalX) + (tz - n.goalZ) * (tz - n.goalZ) > GOAL_MOVED_SQ;
  const exhausted = !n.path || n.pathIdx >= n.path.length;
  if (
    grid &&
    (exhausted ||
      goalMoved ||
      (n.repathTimer <= 0 && (opts.repathEvery !== undefined || n.stuckTimer > 0)))
  ) {
    n.goalX = tx;
    n.goalZ = tz;
    n.repathTimer = opts.repathEvery ?? 1.5;
    if (grid.segmentClear(m.x, m.z, tx, tz)) {
      n.path = [{ x: tx, z: tz }];
    } else {
      n.path = grid.findPath(m.x, m.z, tx, tz) ?? [{ x: tx, z: tz }];
    }
    n.pathIdx = 0;
  }

  let wx = tx;
  let wz = tz;
  if (grid && n.path && n.pathIdx < n.path.length) {
    // The final waypoint is the grid cell nearest the goal; aim at
    // the real goal once we're on the last leg.
    if (n.pathIdx < n.path.length - 1) {
      wx = n.path[n.pathIdx].x;
      wz = n.path[n.pathIdx].z;
    }
    if (Math.hypot(wx - m.x, wz - m.z) < WAYPOINT_EPS && n.pathIdx < n.path.length - 1) {
      n.pathIdx++;
      wx = n.pathIdx < n.path.length - 1 ? n.path[n.pathIdx].x : tx;
      wz = n.pathIdx < n.path.length - 1 ? n.path[n.pathIdx].z : tz;
    }
  }
  const dx = wx - m.x;
  const dz = wz - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return true;
  const step = Math.min(d, speed * dt);
  const beforeX = m.x;
  const beforeZ = m.z;
  attemptStep(m, dx / d, dz / d, step, opts.radius, obstacles);
  const moved = Math.hypot(m.x - beforeX, m.z - beforeZ);
  const facingFn = opts.facingFn ?? ((fx: number, fz: number) => Math.atan2(fz, fx));
  if (moved > 0.0005) {
    m.facing = facingFn(m.x - beforeX, m.z - beforeZ);
  } else {
    m.facing = facingFn(dx, dz);
  }
  if (moved < step * 0.2) {
    n.stuckTimer += dt;
    // Re-plan soon (throttled so a wedged mover doesn't run A* every
    // frame).
    n.repathTimer = Math.min(n.repathTimer, 0.25);
  } else {
    n.stuckTimer = Math.max(0, n.stuckTimer - dt * 2);
  }
  return n.stuckTimer < STUCK_LIMIT_S;
}

import type { Guard, Obstacle } from '../types/world';
import { clearLine } from '../util/collision';
import { BULLET_BLOCK_HEIGHT } from './GuardAI';

// Crowbar tuning. Range is intentionally short so the player has to
// commit to a melee approach; duration is long enough to clear a
// chase past a chokepoint but not so long it's a free pass.
export const CROWBAR_RANGE = 3.0;
export const CROWBAR_RANGE_SQ = CROWBAR_RANGE * CROWBAR_RANGE;
// Dogs are scared from a little further than a guard can be stunned;
// the target ring / button highlight use the same reach.
export const CROWBAR_DOG_REACH = CROWBAR_RANGE + 0.5;
export const CROWBAR_DOG_REACH_SQ = CROWBAR_DOG_REACH * CROWBAR_DOG_REACH;
export const CROWBAR_STUN_DURATION = 4.0;

// A swing needs a clear line to its target: anything tall enough to
// stop a bullet (dumpster, hedge wall, vehicle) stops the crowbar too.
// Low walls and crates you could reach over don't.
export function crowbarCanReach(
  obstacles: readonly Obstacle[],
  px: number,
  pz: number,
  tx: number,
  tz: number,
): boolean {
  return clearLine(obstacles, px, pz, tx, tz, BULLET_BLOCK_HEIGHT);
}

// Nearest non-stunned guard within CROWBAR_RANGE with a clear swing
// line, or null. Shared by the swing and the target ring so the ring
// never promises a hit the swing won't land.
export function crowbarTargetGuard(
  px: number,
  pz: number,
  guards: readonly Guard[],
  obstacles: readonly Obstacle[],
): Guard | null {
  let nearest: Guard | null = null;
  let nearestDistSq = CROWBAR_RANGE_SQ;
  for (const g of guards) {
    if (g.stunTimer > 0) continue;
    const dx = g.x - px;
    const dz = g.z - pz;
    const dSq = dx * dx + dz * dz;
    if (dSq <= nearestDistSq && crowbarCanReach(obstacles, px, pz, g.x, g.z)) {
      nearestDistSq = dSq;
      nearest = g;
    }
  }
  return nearest;
}

// Stun the crowbar target (see crowbarTargetGuard). Resets that
// guard's investigation state so the unstun re-enters wander rather
// than re-aggroing the player from where they were standing when they
// swung. Returns true on a hit so the caller can fire the bonk SFX +
// haptic only when contact actually lands.
export function applyCrowbarStun(
  px: number,
  pz: number,
  guards: readonly Guard[],
  obstacles: readonly Obstacle[],
): boolean {
  const nearest = crowbarTargetGuard(px, pz, guards, obstacles);
  if (!nearest) return false;
  nearest.stunTimer = CROWBAR_STUN_DURATION;
  nearest.state = 'wander';
  nearest.investigationTarget = null;
  nearest.behaviorTimer = 0;
  nearest.fireCooldown = Math.max(nearest.fireCooldown, 0.5);
  return true;
}

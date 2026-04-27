import type { Guard, Obstacle, Player } from '../types/world';
import { clamp, dist2 } from '../util/math';
import { lineOfSightClear, type Circle } from '../util/collision';
import { DETECTION_DECAY, VISION_CONE_DEG } from '../util/geometry';

const VISION_HALF = (VISION_CONE_DEG * Math.PI) / 180 / 2;

// How far guards can hear, by how loudly the player is moving.
// Squared distances; compared against dist2() output directly.
const NOISE_RANGE_WALK_SQ = 9 * 9;
const NOISE_RANGE_CROUCH_SQ = 5 * 5;
const NOISE_RANGE_CRAWL_SQ = 2 * 2;

// Per-second detection contribution at zero distance for each
// stance and movement state. Falls off linearly with distance.
function baseNoisePerSecond(p: Player): number {
  if (!p.isCrouched) {
    return p.isRunning ? 0.8 : 0.4; // walk
  }
  return p.isRunning ? 0.30 : 0.15;  // crouch (the low-profile stance)
}

function noiseRangeSq(p: Player): number {
  if (!p.isCrouched) return NOISE_RANGE_WALK_SQ;
  return NOISE_RANGE_CROUCH_SQ;
}

function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function updateDetection(
  guard: Guard,
  player: Player,
  obstacles: readonly Obstacle[],
  prev: number,
  dt: number,
  visionRange: number,
  noiseScale: number = 1,
): number {
  const dSq = dist2(guard.x, guard.z, player.x, player.z);
  const visionRangeSq = visionRange * visionRange;

  // Stance scales how visible the player is when in the cone.
  // CROUCH is the low-profile stance (uses the on-hands-and-knees
  // animation) - quieter, smaller silhouette. WALK is full upright.
  const visionScale = player.isCrouched ? 0.45 : 1.0;
  const hiddenScale = player.isHidden ? 0 : 1; // crouch + cover masks them

  let visionAdd = 0;
  if (dSq <= visionRangeSq && hiddenScale > 0) {
    const angleToPlayer = Math.atan2(player.z - guard.z, player.x - guard.x);
    if (angleDelta(guard.facing, angleToPlayer) <= VISION_HALF) {
      // Per-stance cover threshold. Crouched (the on-hands-and-knees
      // low profile) is hidden by hip-height obstacles; standing
      // requires torso/head-height to break sight.
      const requiredCoverHeight = player.isCrouched ? 0.30 : 1.0;
      const blockers: Circle[] = obstacles
        .filter((o) => o.height >= requiredCoverHeight)
        .map((o) => ({ x: o.x, z: o.z, r: o.r * 0.85 }));
      if (lineOfSightClear(guard.x, guard.z, player.x, player.z, blockers)) {
        const proximity = 1 - dSq / visionRangeSq;
        visionAdd = (0.5 + 0.6 * proximity) * visionScale * dt;
      }
    }
  }

  // Noise. Only contributes when the player is actually moving.
  // Volume depends on stance + run; range likewise. Cover does NOT
  // dampen noise (footfalls carry around boxes), but hiding behind
  // cover while prone is so quiet the contribution is tiny anyway.
  let noiseAdd = 0;
  const movingFast = Math.abs(player.vx) > 0.05 || Math.abs(player.vz) > 0.05;
  if (movingFast) {
    const rangeSq = noiseRangeSq(player);
    if (dSq <= rangeSq) {
      const proximity = 1 - dSq / rangeSq;
      noiseAdd = baseNoisePerSecond(player) * proximity * dt * noiseScale;
    }
  }

  // Per user feedback: discovery ring was filling too fast for the
  // player to read and react to a threat before peaking. Vision +
  // noise both contribute at one sixth of their raw rate so the
  // ring builds as a steady alarm rather than a snap-fill. Spotlight
  // contributions in Game.tsx are tuned in the same direction.
  const add = (visionAdd + noiseAdd) / 6;
  if (add > 0) {
    return clamp(prev + add, 0, 1);
  }
  return clamp(prev - DETECTION_DECAY * dt, 0, 1);
}

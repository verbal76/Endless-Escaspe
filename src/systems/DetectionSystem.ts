import type { Guard, Obstacle, Player } from '../types/world';
import { clamp, dist2Sq } from '../util/math';
import { lineOfSightClear, type Circle } from '../util/collision';
import { VISION_CONE_DEG } from '../util/geometry';

const VISION_HALF = (VISION_CONE_DEG * Math.PI) / 180 / 2;

// Per-second detection contribution at zero distance for each
// stance and movement state. Falls off linearly with distance.
function baseNoisePerSecond(p: Player): number {
  if (!p.isCrouched) {
    return p.isRunning ? 0.8 : 0.4; // walk
  }
  return p.isRunning ? 0.30 : 0.15;  // crouch (the low-profile stance)
}

function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// Stage-driven tuning the caller passes in. Letting the loop own
// this means progression.ts is the single dial; DetectionSystem
// just consumes whatever rates it's handed each frame.
export type DetectionTuning = {
  // Multiplier applied to the (vision + noise) sum. 1/6 at stage 1,
  // up to 1/3 in late game.
  rateScale: number;
  // Per-second decay when no source is contributing.
  decay: number;
  // Squared noise ranges keyed by stance.
  noiseRangeWalkSq: number;
  noiseRangeCrouchSq: number;
};

// Optional sphere of vision-blocking smoke. The game loop builds the
// list of active clouds and passes it in; DetectionSystem treats any
// guard inside one of these as having no visual contact (noise still
// counts - smoke covers eyes, not ears).
export type SmokeRegion = { x: number; z: number; radius: number };

export function updateDetection(
  guard: Guard,
  player: Player,
  obstacles: readonly Obstacle[],
  prev: number,
  dt: number,
  visionRange: number,
  tuning: DetectionTuning,
  noiseScale: number = 1,
  smokeRegions: readonly SmokeRegion[] = [],
): number {
  // Stunned guards stop contributing to detection while frozen by a
  // crowbar hit. Their meter still decays naturally so the player
  // gets a real reset window from a stun.
  if (guard.stunTimer > 0) {
    return clamp(prev - tuning.decay * dt, 0, 1);
  }

  // Smoke cover: if the guard is inside any active cloud, treat
  // their vision as fully blocked for this frame.
  let visionBlocked = false;
  for (const sr of smokeRegions) {
    const dx = guard.x - sr.x;
    const dz = guard.z - sr.z;
    if (dx * dx + dz * dz <= sr.radius * sr.radius) {
      visionBlocked = true;
      break;
    }
  }

  const dSq = dist2Sq(guard.x, guard.z, player.x, player.z);
  const visionRangeSq = visionRange * visionRange;

  // Stance scales how visible the player is when in the cone.
  // CROUCH is the low-profile stance (uses the on-hands-and-knees
  // animation) - quieter, smaller silhouette. WALK is full upright.
  const visionScale = player.isCrouched ? 0.45 : 1.0;
  const hiddenScale = player.isHidden ? 0 : 1; // crouch + cover masks them

  let visionAdd = 0;
  if (!visionBlocked && dSq <= visionRangeSq && hiddenScale > 0) {
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
    const rangeSq = player.isCrouched
      ? tuning.noiseRangeCrouchSq
      : tuning.noiseRangeWalkSq;
    if (dSq <= rangeSq) {
      const proximity = 1 - dSq / rangeSq;
      noiseAdd = baseNoisePerSecond(player) * proximity * dt * noiseScale;
    }
  }

  // Caller supplies the per-stage rate scale (smaller = slower
  // build) so the same code path serves stage 1 (gentle ramp) and
  // late stages (snappier alarm).
  const add = (visionAdd + noiseAdd) * tuning.rateScale;
  if (add > 0) {
    return clamp(prev + add, 0, 1);
  }
  return clamp(prev - tuning.decay * dt, 0, 1);
}

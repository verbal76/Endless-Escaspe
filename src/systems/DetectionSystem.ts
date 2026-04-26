import type { Guard, Obstacle, Player } from '../types/world';
import { dist2 } from '../util/math';
import { clamp } from '../util/math';
import { lineOfSightClear, type Circle } from '../util/collision';
import {
  DETECTION_DECAY,
  NOISE_RANGE_RUN,
  NOISE_RANGE_WALK,
  VISION_CONE_DEG,
  VISION_RANGE,
} from '../util/geometry';

const VISION_HALF = (VISION_CONE_DEG * Math.PI) / 180 / 2;

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
): number {
  // While hidden in cover, force decay only.
  if (player.isHidden) {
    return clamp(prev - DETECTION_DECAY * dt, 0, 1);
  }

  // LOS contribution
  let visionAdd = 0;
  const d = dist2(guard.x, guard.z, player.x, player.z);
  if (d <= VISION_RANGE) {
    const angleToPlayer = Math.atan2(player.z - guard.z, player.x - guard.x);
    if (angleDelta(guard.facing, angleToPlayer) <= VISION_HALF) {
      const blockers: Circle[] = obstacles
        .filter((o) => o.isCover)
        .map((o) => ({ x: o.x, z: o.z, r: o.r * 0.85 }));
      if (lineOfSightClear(guard.x, guard.z, player.x, player.z, blockers)) {
        // Closer & more centered = faster fill (~1.0/s near, ~0.3/s at edge).
        const proximity = 1 - d / VISION_RANGE;
        visionAdd = (0.5 + 0.6 * proximity) * dt;
      }
    }
  }

  // Noise contribution: only if running and within noise range.
  let noiseAdd = 0;
  if (!player.isCrouched) {
    const range = player.isRunning ? NOISE_RANGE_RUN : NOISE_RANGE_WALK;
    if (d <= range) {
      const proximity = 1 - d / range;
      noiseAdd = (player.isRunning ? 0.35 : 0.1) * proximity * dt;
    }
  }

  const add = visionAdd + noiseAdd;
  if (add > 0) {
    return clamp(prev + add, 0, 1);
  }
  return clamp(prev - DETECTION_DECAY * dt, 0, 1);
}

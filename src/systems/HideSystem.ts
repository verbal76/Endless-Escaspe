import type { Obstacle, Player } from '../types/world';
import { dist2Sq } from '../util/math';
import { COVER_HEIGHT_CROUCHED } from './DetectionSystem';

const NEAR_COVER_SQ = 2.5 * 2.5;

// Is the player crouched close to a cover-height prop? This no longer
// hides the player on its own - cover is directional and handled by
// line of sight in DetectionSystem. The game loop combines this with
// "no guard can currently see you" to drive player.isHidden, which the
// HUD / figure pose use to show that the player is tucked in safely.
export function isNearCover(p: Player, obstacles: readonly Obstacle[]): boolean {
  if (!p.isCrouched) return false;
  for (const o of obstacles) {
    // Same threshold that blocks a crouched player's sight line, so a
    // low wall that really hides you also shows the tucked-in pose.
    if (o.height < COVER_HEIGHT_CROUCHED) continue;
    if (dist2Sq(p.x, p.z, o.x, o.z) <= NEAR_COVER_SQ + o.r * o.r) return true;
  }
  return false;
}

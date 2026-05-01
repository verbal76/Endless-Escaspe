import type { Obstacle, Player } from '../types/world';
import { dist2Sq } from '../util/math';

const HIDE_RANGE_SQ = 2.5 * 2.5;

// Hidden-from-guards: the player is in CROUCH stance (low profile)
// AND close enough to a cover obstacle that it masks them. The
// detection system's line-of-sight raycasts still do the heavy
// lifting; this flag exposes the state to HUD subscribers.
export function updateHide(p: Player, obstacles: readonly Obstacle[]) {
  if (!p.isCrouched) {
    p.isHidden = false;
    return;
  }
  for (const o of obstacles) {
    if (!o.isCover) continue;
    if (dist2Sq(p.x, p.z, o.x, o.z) <= HIDE_RANGE_SQ) {
      p.isHidden = true;
      return;
    }
  }
  p.isHidden = false;
}

import type { Obstacle, Player } from '../types/world';
import { dist2 } from '../util/math';

// Effective hide radius (squared) around any cover obstacle.
// dist2 returns squared distance, so this is the squared threshold.
const HIDE_RANGE_SQ = 2.5 * 2.5;

// "Hidden" now means: the player is in CRAWL stance AND is close
// enough to a cover obstacle that the cover masks them. This gates
// the on-screen PRONE/HIDDEN badge and acts as a soft signal that
// detection won't accumulate from this position. The detection
// system's own line-of-sight raycasts still do the heavy lifting.
export function updateHide(p: Player, obstacles: readonly Obstacle[]) {
  if (!p.isProne) {
    p.isHidden = false;
    return;
  }
  for (const o of obstacles) {
    if (!o.isCover) continue;
    if (dist2(p.x, p.z, o.x, o.z) <= HIDE_RANGE_SQ) {
      p.isHidden = true;
      return;
    }
  }
  p.isHidden = false;
}

import type { Obstacle, Player } from '../types/world';
import { dist2 } from '../util/math';
import { input } from './InputSystem';

// dist2 returns squared distance, so this is the squared hide radius.
// Effective on-screen range: ~2.5m around any cover obstacle.
const HIDE_RANGE_SQ = 2.5 * 2.5;

export function updateHide(p: Player, obstacles: readonly Obstacle[]) {
  if (!input.hide) {
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

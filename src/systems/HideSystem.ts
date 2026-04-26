import type { Obstacle, Player } from '../types/world';
import { dist2 } from '../util/math';
import { input } from './InputSystem';

const HIDE_RANGE = 1.6;

export function updateHide(p: Player, obstacles: readonly Obstacle[]) {
  if (!input.hide || !p.isCrouched) {
    p.isHidden = false;
    return;
  }
  for (const o of obstacles) {
    if (!o.isCover) continue;
    if (dist2(p.x, p.z, o.x, o.z) <= HIDE_RANGE) {
      p.isHidden = true;
      return;
    }
  }
  p.isHidden = false;
}

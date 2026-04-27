// Input is shared via a single mutable object; the loop reads it each tick.
// HUD components write to it via refs (no React re-renders per frame).

import type { Stance } from '../types/world';

export type InputState = {
  // Normalized joystick vector in [-1, 1].
  axisX: number;
  axisY: number;
  // Movement stance picker. CRAWL / CROUCH / WALK are mutually
  // exclusive radio buttons in the HUD. Default WALK.
  stance: Stance;
  // Speed multiplier toggle, orthogonal to stance. Doubles whatever
  // base speed the current stance uses.
  run: boolean;
};

export const input: InputState = {
  axisX: 0,
  axisY: 0,
  stance: 'walk',
  run: false,
};

export function resetInput() {
  input.axisX = 0;
  input.axisY = 0;
  input.stance = 'walk';
  input.run = false;
}

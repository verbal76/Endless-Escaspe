// Input is shared via a single mutable object; the loop reads it each tick.
// HUD components write to it via refs (no React re-renders per frame).

import type { Stance } from '../types/world';

export type InputState = {
  // Normalized joystick vector in [-1, 1].
  axisX: number;
  axisY: number;
  stance: Stance;
  run: boolean;
  // Camera yaw offset (radians) requested by the look-arrow buttons.
  // 0 = looking forward; +/- LOOK_YAW = held look-right / look-left.
  // CameraRig lerps the camera toward this target so release snaps
  // smoothly back to centred when the player lets go of the button.
  viewYaw: number;
};

export const input: InputState = {
  axisX: 0,
  axisY: 0,
  stance: 'walk',
  run: false,
  viewYaw: 0,
};

export function resetInput() {
  input.axisX = 0;
  input.axisY = 0;
  input.stance = 'walk';
  input.run = false;
  input.viewYaw = 0;
}

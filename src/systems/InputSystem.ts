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
  // One-shot pickup-use flags. HUD buttons set true on press; the
  // game loop reads them once per frame and resets them so each
  // tap drives a single use even if the button stays held.
  useCrowbar: boolean;
  useSmokeBomb: boolean;
};

export const input: InputState = {
  axisX: 0,
  axisY: 0,
  stance: 'walk',
  run: false,
  viewYaw: 0,
  useCrowbar: false,
  useSmokeBomb: false,
};

export function resetInput() {
  input.axisX = 0;
  input.axisY = 0;
  input.stance = 'walk';
  input.run = false;
  input.viewYaw = 0;
  input.useCrowbar = false;
  input.useSmokeBomb = false;
}

// Radial dead zone for the stick, as a fraction of full deflection.
export const JOYSTICK_DEAD_ZONE = 0.15;

// Map a raw stick vector (length <= 1) through the dead zone: inside
// it reads as zero; outside it's rescaled so the edge of the dead zone
// is 0 and full deflection is still 1 (no speed jump at the edge).
export function applyDeadZone(
  x: number,
  y: number,
  dead: number = JOYSTICK_DEAD_ZONE,
): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= dead) return { x: 0, y: 0 };
  const clamped = Math.min(1, len);
  const scaled = (clamped - dead) / (1 - dead);
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

// Input is shared via a single mutable object; the loop reads it each tick.
// HUD components write to it via refs (no React re-renders per frame).

export type InputState = {
  // Normalized joystick vector in [-1, 1].
  axisX: number;
  axisY: number;
  // Action buttons (held).
  run: boolean;
  crouch: boolean;
  hide: boolean;
};

export const input: InputState = {
  axisX: 0,
  axisY: 0,
  run: false,
  crouch: false,
  hide: false,
};

export function resetInput() {
  input.axisX = 0;
  input.axisY = 0;
  input.run = false;
  input.crouch = false;
  input.hide = false;
}

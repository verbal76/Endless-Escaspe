// Desktop action layer (pure logic, no DOM): keyboard + standard-mapped gamepad -> the game's existing
// input vocabulary. The Android touch HUD is the reference implementation; nothing here changes what an
// input DOES, it only offers more ways to produce the same `input` fields and store actions:
//   move  -> input.axisX (right +) / input.axisY (forward +), through the same radial dead zone
//   look  -> input.viewYaw, +45 deg = look-left button, -45 deg = look-right button (LookButtons.tsx)
//   run   -> toggle (RunButton), stance -> crouch / walk (ActionButtons), pickups -> one-shot flags
// docs/DESKTOP_INPUT.md is the input-action inventory this table implements.

import { applyDeadZone, JOYSTICK_DEAD_ZONE } from '../systems/InputSystem';

// Same value as LookButtons.tsx (LOOK_YAW_DEG = 45).
export const LOOK_YAW_RAD = (45 * Math.PI) / 180;
// Stick deflection that counts as a menu direction press (digital).
export const NAV_STICK_THRESHOLD = 0.6;

export type Mode = 'play' | 'menu';
export type Command =
  | 'confirm'
  | 'back'
  | 'pause'
  | 'stance'
  | 'runToggle'
  | 'crowbar'
  | 'smoke'
  | 'rock'
  | 'navUp'
  | 'navDown'
  | 'navLeft'
  | 'navRight';

// W3C "standard" gamepad mapping (Steam Input, Xbox, PlayStation and Switch Pro report this layout).
export const PAD = { south: 0, east: 1, west: 2, north: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 } as const;
export type PadSnapshot = { axes: readonly number[]; buttons: readonly boolean[] };

export type Frame = {
  // Continuous controls, ready to write into `input` (already dead-zoned and clamped to the unit disc).
  move: { x: number; y: number };
  lookYaw: number;
  // Shift on the keyboard: run while held.
  runHeld: boolean;
  // Buttons currently down, mapped for the mode (edge detection happens in EdgeTracker).
  held: ReadonlySet<Command>;
  // True while the Back / View button is down (the runtime turns a 2 s hold into "quit").
  quitHeld: boolean;
  // A device produced a deliberate input this frame (used for prompt switching, never for mouse movement).
  keyboardActive: boolean;
  padActive: boolean;
};

const down = (p: PadSnapshot, i: number) => !!p.buttons[i];

function unit(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

export function emptyFrame(): Frame {
  return { move: { x: 0, y: 0 }, lookYaw: 0, runHeld: false, held: new Set(), quitHeld: false, keyboardActive: false, padActive: false };
}

/** Resolve one frame of raw input for the current mode. `keys` holds KeyboardEvent.code values. */
export function frameFrom(mode: Mode, keys: ReadonlySet<string>, pad: PadSnapshot | null): Frame {
  const held = new Set<Command>();
  const k = (c: string) => keys.has(c);
  const playing = mode === 'play';

  // ---- keyboard --------------------------------------------------------------------------------
  const kx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  const ky = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  let move = playing ? unit(kx, ky) : { x: 0, y: 0 };
  let lookYaw = playing ? (k('KeyQ') ? LOOK_YAW_RAD : 0) + (k('KeyE') ? -LOOK_YAW_RAD : 0) : 0;
  const runHeld = playing && (k('ShiftLeft') || k('ShiftRight'));
  if (playing) {
    if (k('Escape') || k('KeyP')) held.add('pause');
    if (k('KeyC')) held.add('stance');
    if (k('Digit1')) held.add('crowbar');
    if (k('Digit2')) held.add('smoke');
    if (k('Digit3')) held.add('rock');
  } else {
    if (k('Enter') || k('NumpadEnter') || k('Space')) held.add('confirm');
    if (k('Escape')) held.add('back');
    if (k('ArrowUp') || k('KeyW')) held.add('navUp');
    if (k('ArrowDown') || k('KeyS')) held.add('navDown');
    if (k('ArrowLeft') || k('KeyA')) held.add('navLeft');
    if (k('ArrowRight') || k('KeyD')) held.add('navRight');
  }
  const keyboardActive = keys.size > 0;

  // ---- gamepad ---------------------------------------------------------------------------------
  let quitHeld = false;
  let padActive = false;
  if (pad) {
    const lx = pad.axes[0] ?? 0;
    const ly = -(pad.axes[1] ?? 0); // standard mapping: up is negative; the game wants forward = +
    const rx = pad.axes[2] ?? 0;
    const stick = applyDeadZone(lx, ly, JOYSTICK_DEAD_ZONE);
    const dpadX = (down(pad, PAD.right) ? 1 : 0) - (down(pad, PAD.left) ? 1 : 0);
    const dpadY = (down(pad, PAD.up) ? 1 : 0) - (down(pad, PAD.down) ? 1 : 0);
    quitHeld = down(pad, PAD.back);
    padActive = Math.hypot(lx, ly) > NAV_STICK_THRESHOLD || Math.abs(rx) > NAV_STICK_THRESHOLD || pad.buttons.some(Boolean);
    if (playing) {
      const m = stick.x !== 0 || stick.y !== 0 ? unit(stick.x, stick.y) : unit(dpadX, dpadY);
      if (m.x !== 0 || m.y !== 0) move = m;
      // Right stick X: analog look (left stick of the original look arrows); LB / RB: the two look arrows.
      const rs = applyDeadZone(rx, 0, JOYSTICK_DEAD_ZONE).x;
      const look = -rs * LOOK_YAW_RAD + (down(pad, PAD.lb) ? LOOK_YAW_RAD : 0) + (down(pad, PAD.rb) ? -LOOK_YAW_RAD : 0);
      if (look !== 0) lookYaw = Math.max(-LOOK_YAW_RAD, Math.min(LOOK_YAW_RAD, look));
      if (down(pad, PAD.south) || down(pad, PAD.l3)) held.add('runToggle');
      if (down(pad, PAD.east)) held.add('stance');
      if (down(pad, PAD.west)) held.add('crowbar');
      if (down(pad, PAD.north)) held.add('smoke');
      if (down(pad, PAD.rt)) held.add('rock');
      if (down(pad, PAD.start)) held.add('pause');
    } else {
      if (down(pad, PAD.south)) held.add('confirm');
      if (down(pad, PAD.east) || down(pad, PAD.start)) held.add('back');
      if (down(pad, PAD.up) || ly > NAV_STICK_THRESHOLD) held.add('navUp');
      if (down(pad, PAD.down) || ly < -NAV_STICK_THRESHOLD) held.add('navDown');
      if (down(pad, PAD.left) || lx < -NAV_STICK_THRESHOLD) held.add('navLeft');
      if (down(pad, PAD.right) || lx > NAV_STICK_THRESHOLD) held.add('navRight');
    }
  }
  return { move, lookYaw, runHeld, held, quitHeld, keyboardActive, padActive };
}

/** Turns "held" into "pressed this frame". One-shot commands fire once per press. */
export class EdgeTracker {
  private prev = new Set<Command>();
  step(held: ReadonlySet<Command>): Command[] {
    const out: Command[] = [];
    for (const c of held) if (!this.prev.has(c)) out.push(c);
    this.prev = new Set(held);
    return out;
  }
  reset() {
    this.prev = new Set();
  }
}

const NAV: ReadonlySet<Command> = new Set<Command>(['navUp', 'navDown', 'navLeft', 'navRight']);

/** Menu direction auto-repeat: first press fires at once, then after `delayMs`, then every `intervalMs`. */
export class NavRepeater {
  private current: Command | null = null;
  private since = 0;
  private last = 0;
  private readonly delayMs: number;
  private readonly intervalMs: number;
  constructor(delayMs = 380, intervalMs = 110) {
    this.delayMs = delayMs;
    this.intervalMs = intervalMs;
  }
  step(held: ReadonlySet<Command>, now: number): Command | null {
    let dir: Command | null = null;
    for (const c of held) if (NAV.has(c)) dir = c; // last wins; one direction at a time
    if (dir === null) {
      this.current = null;
      return null;
    }
    if (dir !== this.current) {
      this.current = dir;
      this.since = now;
      this.last = now;
      return dir;
    }
    if (now - this.since >= this.delayMs && now - this.last >= this.intervalMs) {
      this.last = now;
      return dir;
    }
    return null;
  }
  reset() {
    this.current = null;
  }
}

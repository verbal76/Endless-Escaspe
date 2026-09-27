// Danger-driven music intensity with hysteresis.
//
//   calm   - the regular playlist at full level
//   alert  - a guard is suspicious: playlist ducks, the tension layer
//            fades in
//   chase  - someone is actively chasing: tension layer up front,
//            slightly faster; playlist almost silent
//
// Entering a higher state is quick; leaving requires the danger to
// stay below a LOWER threshold for a hold period, so a meter hovering
// around a threshold can't flip the music back and forth. Gains glide
// toward their targets (never jump), which also smooths the fades.

export type MusicState = 'calm' | 'alert' | 'chase';

export type MusicMix = {
  state: MusicState;
  calmGain: number; // 0..1, multiplied by the music volume slider
  tensionGain: number;
  rate: number; // tension-layer playback rate
};

export const ALERT_ENTER = 0.45;
export const ALERT_EXIT = 0.25;
export const CHASE_ENTER = 0.95;
export const CHASE_EXIT = 0.6;
export const ALERT_HOLD_S = 2.5;
export const CHASE_HOLD_S = 3.5;
// Seconds to cross from 0 to 1 gain.
export const FADE_S = 1.2;

const TARGETS: Record<MusicState, { calm: number; tension: number; rate: number }> = {
  calm: { calm: 1, tension: 0, rate: 1 },
  alert: { calm: 0.4, tension: 0.6, rate: 1 },
  chase: { calm: 0.08, tension: 1, rate: 1.06 },
};

export class MusicIntensity {
  state: MusicState = 'calm';
  calmGain = 1;
  tensionGain = 0;
  rate = 1;
  private belowFor = 0;

  reset() {
    this.state = 'calm';
    this.calmGain = 1;
    this.tensionGain = 0;
    this.rate = 1;
    this.belowFor = 0;
  }

  // danger = highest guard detection (0..1); chasing = any guard in
  // the chase state (a chase keeps the music hot even if a meter dips).
  update(danger: number, chasing: boolean, dt: number): MusicMix {
    const inChase = chasing || danger >= CHASE_ENTER;
    if (inChase) {
      this.state = 'chase';
      this.belowFor = 0;
    } else if (this.state === 'chase') {
      if (danger < CHASE_EXIT) this.belowFor += dt;
      else this.belowFor = 0;
      if (this.belowFor >= CHASE_HOLD_S) {
        this.state = danger >= ALERT_EXIT ? 'alert' : 'calm';
        this.belowFor = 0;
      }
    } else if (danger >= ALERT_ENTER) {
      this.state = 'alert';
      this.belowFor = 0;
    } else if (this.state === 'alert') {
      if (danger < ALERT_EXIT) this.belowFor += dt;
      else this.belowFor = 0;
      if (this.belowFor >= ALERT_HOLD_S) {
        this.state = 'calm';
        this.belowFor = 0;
      }
    }
    const t = TARGETS[this.state];
    const step = dt / FADE_S;
    this.calmGain = approach(this.calmGain, t.calm, step);
    this.tensionGain = approach(this.tensionGain, t.tension, step);
    this.rate = approach(this.rate, t.rate, step * 0.2);
    return { state: this.state, calmGain: this.calmGain, tensionGain: this.tensionGain, rate: this.rate };
  }
}

function approach(v: number, target: number, maxStep: number): number {
  if (v < target) return Math.min(target, v + maxStep);
  if (v > target) return Math.max(target, v - maxStep);
  return v;
}

// Danger-driven music intensity with hysteresis.
//
//   calm   - the regular playlist at full level
//   alert  - a guard is suspicious: crossfade most of the way to the
//            tension track (the playlist stays only as a faint bed)
//   chase  - someone is actively chasing: tension track alone,
//            slightly faster; playlist fully out
//
// The tension track is a separate song, not a stem of the playlist,
// so the two never sit at comparable levels in a steady state (that
// clashed: different tempo and key). In any steady state the quieter
// of the two gains is <= MAX_BLEND.
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
  alert: { calm: 0.15, tension: 0.8, rate: 1 },
  chase: { calm: 0, tension: 1, rate: 1.06 },
};

// Upper bound for min(calmGain, tensionGain) once a state has settled.
export const MAX_BLEND = 0.15;

export function musicTargets(state: MusicState) {
  return TARGETS[state];
}

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

// ---------------------------------------------------------------
// Volume helpers (shared by the store, Music, Sfx and Siren).

// Slider endpoints: a drag rarely lands exactly on 0 or 1, and the
// store's 0.005 change dead-band would otherwise swallow the final
// step (leaving the game faintly audible at "0").
export const VOLUME_SNAP = 0.01;

export function snapVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const c = Math.max(0, Math.min(1, v));
  if (c <= VOLUME_SNAP) return 0;
  if (c >= 1 - VOLUME_SNAP) return 1;
  return c;
}

// Sliders are linear in position; loudness is not. Squaring the
// slider value before it reaches a player spreads the audible range
// across the whole knob instead of the bottom 10%. Applied where the
// volume is consumed (Music.setVolume, playSfx, updateSiren), so the
// stored settings stay in slider units.
export function perceptualVolume(v: number): number {
  const c = snapVolume(v);
  return c * c;
}

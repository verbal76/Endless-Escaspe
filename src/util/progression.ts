// Single source of truth for stage-driven difficulty curves. Every
// caller that varies behaviour by stage should resolve their numbers
// through here so we have one place to retune the whole game.
//
// Curves are intentionally piecewise / capped so late stages stay
// hard but bounded, instead of trending toward "impossible". Stage 1
// is the soft baseline; numbers rise (or fall, where appropriate)
// from there with a plateau in the high teens / twenties.

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const safeStage = (stage: number) => Math.max(1, stage | 0);

// Gentle concave ramp: most of the variation happens in the first
// ~12 stages, then we plateau so stage 30 doesn't feel categorically
// different from stage 20.
function rampConcave(stage: number, from: number, to: number, plateauAt = 12) {
  const s = safeStage(stage);
  const t = clamp((s - 1) / (plateauAt - 1), 0, 1);
  // ease-out: 1 - (1-t)^2
  const eased = 1 - (1 - t) * (1 - t);
  return from + (to - from) * eased;
}

// Linear step function with a cap. Used for entity counts.
function stepCount(stage: number, base: number, perStep: number, stepEvery: number, cap: number) {
  const s = safeStage(stage);
  return Math.min(cap, base + Math.floor((s - 1) / stepEvery) * perStep);
}

// --- Detection / vision tuning --------------------------------------------

// Effective vision range used by DetectionSystem. Stays modest at
// stage 1 (so the player can read what's happening), grows toward a
// plateau around stage 15.
export function visionRangeFor(stage: number): number {
  return rampConcave(stage, 6.0, 12.0, 15);
}

// Floodlight "I'm standing in the beam" vision-range bonus (the
// LIGHT_VISION_BONUS factor in the original code). Spotlights are
// gentle at the start, then become genuinely dangerous.
export function lightVisionBonusFor(stage: number): number {
  return rampConcave(stage, 0.10, 0.35, 18);
}

// Per-second floodlight detection bumps (standing / crouched).
// Halved from the pre-progression baseline; ramps back up at high
// stages so the late-game spotlight isn't a non-threat compared to
// guards.
export function floodlightStandingRateFor(stage: number): number {
  return rampConcave(stage, 0.125, 0.30, 18);
}
export function floodlightCrouchedRateFor(stage: number): number {
  return rampConcave(stage, 0.05, 0.13, 18);
}

// Multiplier on the (visionAdd + noiseAdd) sum. Baseline /6 at stage
// 1; the divisor shrinks (rate grows) as stages climb so vision/
// noise contributions become snappier in the late game.
export function detectionRateScaleFor(stage: number): number {
  // 1 / 6 at stage 1, up to 1 / 3 at stage 15+. Returns the *factor*
  // applied directly; callers no longer divide by 6.
  return rampConcave(stage, 1 / 6, 1 / 3, 15);
}

// Decay rate when nothing is feeding the meter. Slower decay later
// so being spotted lingers.
export function detectionDecayFor(stage: number): number {
  return rampConcave(stage, 0.15, 0.07, 15);
}

// Walk-noise effective range squared. Late stages let guards hear
// you from further away.
export function noiseRangeWalkSqFor(stage: number): number {
  const r = rampConcave(stage, 9, 13, 15);
  return r * r;
}
export function noiseRangeCrouchSqFor(stage: number): number {
  const r = rampConcave(stage, 5, 7, 15);
  return r * r;
}

// --- Run shape -------------------------------------------------------------

// Multiplier on segment length. Stage 1 runs are short; late stages
// are 1.8x as long, which itself increases the time-detected /
// run-time star metrics organically.
export function segmentLengthMulFor(stage: number): number {
  return rampConcave(stage, 1.0, 1.8, 18);
}

// Starting hearts. Hearts still always reset between runs - only
// the *initial count* drops so late-stage runs are more punishing.
export function startingHeartsFor(stage: number): number {
  const s = safeStage(stage);
  if (s >= 20) return 1;
  if (s >= 10) return 2;
  return 3;
}

// --- Entity counts ---------------------------------------------------------

// Number of guards per segment.
export function guardCountFor(stage: number): number {
  // 2 guards baseline; +1 every 6 stages, capped at 5.
  return stepCount(stage, 2, 1, 6, 5);
}

// Number of scanning floodlight towers. Original layout had 6 in 3
// rows; we keep 6 as the baseline and add a fourth row from stage
// 10 and a partial fifth from stage 16.
export function lightTowerRowsFor(stage: number): number {
  return stepCount(stage, 3, 1, 6, 5);
}

// Floodlight scan speed scalar. Original was 0.55 rad/s. We scale
// up to 1.3x by stage 15 - faster sweeps mean less safe-time in
// dark patches.
export function lightScanSpeedMulFor(stage: number): number {
  return rampConcave(stage, 1.0, 1.3, 15);
}

// Dogs and their handler-guard buddy. Dogs spawn from stage 8, max 2.
export function dogCountFor(stage: number): number {
  const s = safeStage(stage);
  if (s < 8) return 0;
  if (s < 16) return 1;
  return 2;
}

// Razor-wire fences cost a heart on touch. At stage 14 the *bottom
// strip* of fence becomes razor wire for a fraction of segments;
// from stage 22 every segment has it.
export function razorWireEnabledFor(stage: number): boolean {
  return safeStage(stage) >= 14;
}

// --- AI tier ---------------------------------------------------------------

// Tier 1 (default): per the original AI. Tier 2: guards face last
// seen position for a few seconds after losing LOS. Tier 3: guards
// broadcast - nearest other guard switches to investigate when one
// enters chase. Tier 4: guards lead their shots based on player
// velocity.
export type AITier = 1 | 2 | 3 | 4;
export function aiTierFor(stage: number): AITier {
  const s = safeStage(stage);
  if (s >= 18) return 4;
  if (s >= 12) return 3;
  if (s >= 6) return 2;
  return 1;
}

// --- Player ----------------------------------------------------------------

// Stamina kicks in from stage 5: running drains a per-run stamina
// pool; while empty the run-toggle can't engage.
export function staminaEnabledFor(stage: number): boolean {
  return safeStage(stage) >= 5;
}

// --- Forced weather --------------------------------------------------------

// From stage 15+, weather-disabled players still get forced rain/
// snow to keep the difficulty knobs (vision boost from snow,
// lightning flash) on. weatherEnabled toggle still works for the
// effect-rich rendering path; the modifiers are applied either way.
export function forceStormyWeatherFor(stage: number): boolean {
  return safeStage(stage) >= 15;
}

// --- Slow motion -----------------------------------------------------------

// Detection level + proximity threshold for the close-call slow-mo
// trigger. Helps the player react in early game; switches off in
// late game so it doesn't carry them.
export function slowMoEnabledFor(stage: number): boolean {
  return safeStage(stage) < 12;
}

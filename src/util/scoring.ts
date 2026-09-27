import type { RunStats } from '../state/store';

// Stats thresholds. Higher = lenient; lower = stingy.
const STAT_DETECTED_3 = 3; // <= seconds detected for 3 stars on this metric
const STAT_DETECTED_2 = 12;
const STAT_TIMES_3 = 0;
const STAT_TIMES_2 = 2;
const STAT_TIME_3 = 60;
const STAT_TIME_2 = 120;

export type TimeTargets = { three: number; two: number };

export const DEFAULT_TIME_TARGETS: TimeTargets = { three: STAT_TIME_3, two: STAT_TIME_2 };

// Star time targets derived from the segment that was actually
// played. A stealthy clear is benchmarked against walking the segment
// straight through: 3 stars within 1.7x that time (room to wait out
// patrols and detour to cover), 2 stars within 2.8x. Stage 1's 120 m
// segment gives ~58 s / ~96 s, close to the old fixed 60 / 120 s; the
// 216 m late-game segments get ~105 s / ~173 s instead of the fixed
// limits that were only reachable by sprinting. Boss arenas are a
// fixed survive-the-timer round, so finishing (time = the timer) is
// always full marks on this metric.
export const TIME_REF_SPEED = 3.5; // m/s, walking
export const TIME_FACTOR_3 = 1.7;
export const TIME_FACTOR_2 = 2.8;

export function timeTargetsFor(
  segmentLengthM: number,
  bossSurviveSeconds: number | null = null,
): TimeTargets {
  if (bossSurviveSeconds !== null && bossSurviveSeconds > 0) {
    return { three: bossSurviveSeconds + 1, two: bossSurviveSeconds + 1 };
  }
  const walk = Math.max(1, segmentLengthM) / TIME_REF_SPEED;
  return { three: Math.round(walk * TIME_FACTOR_3), two: Math.round(walk * TIME_FACTOR_2) };
}

export function scoreStars(
  s: Omit<RunStats, 'stars'>,
  time: TimeTargets = DEFAULT_TIME_TARGETS,
): number {
  let pts = 0;
  // Each metric: 0 / 0.5 / 1 contribution.
  pts += s.timesSeen <= STAT_TIMES_3 ? 1 : s.timesSeen <= STAT_TIMES_2 ? 0.5 : 0;
  pts +=
    s.timeDetected <= STAT_DETECTED_3 ? 1 : s.timeDetected <= STAT_DETECTED_2 ? 0.5 : 0;
  pts += s.runDurationS <= time.three ? 1 : s.runDurationS <= time.two ? 0.5 : 0;
  pts += s.livesUsed <= 0 ? 1 : s.livesUsed === 1 ? 0.5 : 0;
  // Out of 4 -> stars 1..3 (always at least 1 for clearing).
  return Math.max(1, Math.min(3, Math.round((pts / 4) * 3)));
}

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

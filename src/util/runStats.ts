import type { RunStats } from '../state/store';

// Per-segment stats accumulator. Kept out of Game.tsx so the scoring
// inputs are unit-testable.
//
// livesUsed is counted directly from catches instead of being derived
// from "3 - hearts": from stage 10 the player starts with fewer than
// 3 hearts (and a boss perk can add one), so the old formula reported
// lost lives on a flawless run and could even go negative.
export const SEEN_THRESHOLD = 0.5;
export const DETECTED_THRESHOLD = 0.3;

export class RunTracker {
  runTime = 0;
  timeDetected = 0;
  timesSeen = 0;
  livesLost = 0;
  private prevSeen = false;

  reset() {
    this.runTime = 0;
    this.timeDetected = 0;
    this.timesSeen = 0;
    this.livesLost = 0;
    this.prevSeen = false;
  }

  tickTime(dt: number) {
    this.runTime += dt;
  }

  // maxDetection = highest guard meter this frame.
  tickDetection(maxDetection: number, dt: number) {
    if (maxDetection > DETECTED_THRESHOLD) this.timeDetected += dt;
    const seen = maxDetection > SEEN_THRESHOLD;
    if (seen && !this.prevSeen) this.timesSeen++;
    this.prevSeen = seen;
  }

  onCatch() {
    this.livesLost++;
    this.prevSeen = false;
  }

  snapshot(): Omit<RunStats, 'stars'> {
    return {
      timesSeen: this.timesSeen,
      timeDetected: this.timeDetected,
      runDurationS: this.runTime,
      livesUsed: this.livesLost,
    };
  }
}

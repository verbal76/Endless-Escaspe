// Survive-the-timer countdown for boss arenas.
//
// Two bugs lived here when this was inline in Game.tsx: the clock was
// only re-armed on a scene *rebuild*, so restarting a boss round from
// the pause menu resumed the old countdown; and it was ticked with
// the slow-mo-scaled dt, so close-call slow motion stretched the
// round. The clock now re-arms on every segment reset and always
// ticks in real time.
export class BossClock {
  total = 0;
  remaining = 0;

  arm(seconds: number) {
    this.total = seconds;
    this.remaining = seconds;
  }

  get active(): boolean {
    return this.total > 0;
  }

  // Returns true on the frame the clock reaches zero.
  tick(realDt: number): boolean {
    if (!this.active || this.remaining <= 0) return false;
    this.remaining = Math.max(0, this.remaining - realDt);
    return this.remaining <= 0;
  }

  displaySeconds(): number {
    return Math.ceil(this.remaining);
  }
}

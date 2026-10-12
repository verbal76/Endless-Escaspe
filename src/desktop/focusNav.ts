// Spatial focus navigation for controller-only menus (pure geometry; the DOM glue lives in runtime.ts).
// Menus are ordinary focusable elements; the D-pad / stick moves focus to the best candidate in that
// direction, the way console UIs do.

export type Rect = { left: number; top: number; width: number; height: number };
export type Dir = 'up' | 'down' | 'left' | 'right';

const cx = (r: Rect) => r.left + r.width / 2;
const cy = (r: Rect) => r.top + r.height / 2;

/** Index of the best candidate in direction `dir` from `current`, or -1 when nothing lies that way. */
export function pickNext(current: Rect, rects: readonly Rect[], dir: Dir): number {
  const x0 = cx(current);
  const y0 = cy(current);
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    const dx = cx(r) - x0;
    const dy = cy(r) - y0;
    if (dx === 0 && dy === 0) return; // the element itself
    const primary = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    if (primary <= 1) return; // not in that direction
    const horizontal = dir === 'left' || dir === 'right';
    // Rects that share a row (or column) with the current one always win over any off-axis candidate;
    // off-axis ones are only a fallback when nothing lies straight ahead.
    const overlaps = horizontal
      ? Math.min(current.top + current.height, r.top + r.height) > Math.max(current.top, r.top)
      : Math.min(current.left + current.width, r.left + r.width) > Math.max(current.left, r.left);
    const secondary = horizontal ? Math.abs(dy) : Math.abs(dx);
    // Penalise sideways drift so a button straight below beats a nearer one far to the side.
    const score = (overlaps ? 0 : 10000) + primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** First focus when nothing is focused: the candidate nearest the middle of the screen (ties: DOM order). */
export function pickInitial(rects: readonly Rect[], viewport: { width: number; height: number }): number {
  const mx = viewport.width / 2;
  const my = viewport.height / 2;
  let best = -1;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const d = Math.hypot(cx(r) - mx, cy(r) - my);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

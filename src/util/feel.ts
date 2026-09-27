// Screen-edge danger tint curve: silent below 30% detection, then a
// smoothstep up to 0.5 opacity at a full meter. Restrained so the
// tint never obscures play.
export function dangerTintOpacity(level: number): number {
  if (level <= 0.3) return 0;
  const t = Math.min(1, (level - 0.3) / 0.7);
  return 0.5 * t * t * (3 - 2 * t);
}

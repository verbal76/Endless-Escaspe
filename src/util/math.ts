export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Squared 2D distance. We deliberately don't ship a `dist2` (linear)
// helper anymore - earlier callers compared the linear sqrt result
// against squared constants like RANGE * RANGE, which silently
// turned every range into RANGE^2 metres. dist2Sq vs squared
// constants is the right pairing for fast distance gates; if you
// genuinely need the linear distance, use Math.hypot at the call
// site so the intent is loud.
export const dist2Sq = (ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
};

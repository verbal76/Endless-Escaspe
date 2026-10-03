// Mulberry32: tiny seeded PRNG, deterministic across platforms.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, minInclusive: number, maxExclusive: number): number {
  return Math.floor(rng() * (maxExclusive - minInclusive)) + minInclusive;
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Simulation randomness (guard wander / search picks, hearing error,
// dog sniffing). Seeded once per run by the game loop so the same
// seed and the same inputs replay the same run - the Daily must be
// identical for everyone. Falls back to Math.random until seeded.
let simRng: Rng = Math.random;

export function seedSimRandom(seed: number): void {
  simRng = mulberry32(seed);
}

export function simRandom(): number {
  return simRng();
}

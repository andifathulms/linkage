/**
 * Seeded, pure PRNG. CLAUDE.md non-negotiable 3: no Math.random anywhere in src/.
 *
 * splitmix64-derived 32-bit variant (mulberry32). Chosen because it is a handful of
 * lines, has no state beyond one uint32, and passes well enough for population
 * generation and Monte Carlo sampling of noise distributions.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Standard normal, Box–Muller. */
  normal(): number;
  /** Index into `weights`, proportional to weight. */
  weighted(weights: readonly number[]): number;
  /** One element of `items`. */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates, in place, returning the same array. */
  shuffle<T>(items: T[]): T[];
}

/** Hash a string to a uint32, so seeds can be named as well as numbered. */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  // Avoid the fixed point at 0.
  if (s === 0) s = 0x9e3779b9;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Box–Muller produces two deviates per pair of uniforms; keep the spare.
  let spare: number | null = null;

  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    normal() {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u = 0;
      let v = 0;
      let sq = 0;
      do {
        u = next() * 2 - 1;
        v = next() * 2 - 1;
        sq = u * u + v * v;
      } while (sq === 0 || sq >= 1);
      const f = Math.sqrt((-2 * Math.log(sq)) / sq);
      spare = v * f;
      return u * f;
    },
    weighted(weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },
    pick(items) {
      return items[rng.int(items.length)];
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
      }
      return items;
    },
  };
  return rng;
}

/**
 * Derive an independent stream from a base seed and a label. Lets one population seed
 * drive several generators (hierarchy, identities, sensitive values) without them
 * correlating through a shared cursor.
 */
export function deriveRng(seed: number, label: string): Rng {
  return makeRng((seed ^ hashSeed(label)) >>> 0);
}

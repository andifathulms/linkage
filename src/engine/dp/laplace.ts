/**
 * The Laplace mechanism.
 *
 * Add noise drawn from Lap(b) with b = sensitivity / epsilon to a real-valued query.
 * Gives pure epsilon-differential privacy: no delta, no failure probability.
 *
 * Seeded, like everything else in the engine, so a demonstration is reproducible and a
 * user can return to the same noisy answer rather than a different one.
 */
import type { Rng } from '../rng';

export interface NoisyAnswer {
  /** The true answer. Held for scoring; never what the app presents as released. */
  trueValue: number;
  value: number;
  noise: number;
  epsilon: number;
  sensitivity: number;
  scale: number;
  mechanism: 'laplace' | 'gaussian';
}

/**
 * Sample from Lap(0, b) by inverse transform. Written from the CDF rather than as a
 * difference of exponentials so the scale parameter is visibly the one in the guarantee.
 */
export function sampleLaplace(rng: Rng, scale: number): number {
  const u = rng.next() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

export function laplaceMechanism(
  rng: Rng,
  trueValue: number,
  sensitivity: number,
  epsilon: number,
): NoisyAnswer {
  if (!(epsilon > 0)) throw new Error('Epsilon must be positive.');
  if (!(sensitivity > 0)) throw new Error('Sensitivity must be positive.');
  const scale = sensitivity / epsilon;
  const noise = sampleLaplace(rng, scale);
  return {
    trueValue,
    value: trueValue + noise,
    noise,
    epsilon,
    sensitivity,
    scale,
    mechanism: 'laplace',
  };
}

/** Analytic density, for the test that checks the empirical distribution against it. */
export function laplaceDensity(x: number, scale: number): number {
  return Math.exp(-Math.abs(x) / scale) / (2 * scale);
}

export function laplaceCdf(x: number, scale: number): number {
  return x < 0 ? 0.5 * Math.exp(x / scale) : 1 - 0.5 * Math.exp(-x / scale);
}

/**
 * The width of the interval containing the given share of the noise, so the interface can
 * state the accuracy cost as a figure rather than as a shrug. At 95% and scale b this is
 * 2b·ln(20).
 */
export function laplaceInterval(scale: number, mass = 0.95): number {
  return 2 * scale * Math.log(1 / (1 - mass));
}

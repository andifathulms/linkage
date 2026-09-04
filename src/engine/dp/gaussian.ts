/**
 * The Gaussian mechanism.
 *
 * Gives (epsilon, delta)-differential privacy rather than pure epsilon: with probability
 * delta the guarantee does not hold. That is a weaker promise and the interface says so
 * rather than presenting the two mechanisms as interchangeable.
 *
 * The classical analysis (Dwork and Roth, Theorem A.1) sets
 *   sigma >= sqrt(2 ln(1.25 / delta)) * sensitivity / epsilon
 * and is valid only for epsilon <= 1. Above that the bound does not hold, so this
 * implementation refuses rather than quietly returning noise that does not deliver the
 * stated guarantee.
 */
import type { Rng } from '../rng';
import type { NoisyAnswer } from './laplace';

export class GaussianEpsilonError extends Error {}

export function gaussianSigma(sensitivity: number, epsilon: number, delta: number): number {
  if (!(epsilon > 0)) throw new Error('Epsilon must be positive.');
  if (!(delta > 0 && delta < 1)) throw new Error('Delta must be in (0, 1).');
  if (epsilon > 1) {
    throw new GaussianEpsilonError(
      'The classical Gaussian analysis holds only for epsilon at most 1. Above that this bound is not valid, and the mechanism would not deliver the stated guarantee.',
    );
  }
  return (Math.sqrt(2 * Math.log(1.25 / delta)) * sensitivity) / epsilon;
}

export function gaussianMechanism(
  rng: Rng,
  trueValue: number,
  sensitivity: number,
  epsilon: number,
  delta: number,
): NoisyAnswer & { delta: number; sigma: number } {
  const sigma = gaussianSigma(sensitivity, epsilon, delta);
  const noise = rng.normal() * sigma;
  return {
    trueValue,
    value: trueValue + noise,
    noise,
    epsilon,
    sensitivity,
    scale: sigma,
    sigma,
    delta,
    mechanism: 'gaussian',
  };
}

export function gaussianDensity(x: number, sigma: number): number {
  return Math.exp(-(x * x) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
}

/**
 * What the Gaussian mechanism does not promise, stated for the interface (PRD §6.3).
 * Delta is not a rounding detail: it is a probability that the guarantee simply fails,
 * and a delta above roughly 1/n admits releasing a few records outright.
 */
export function deltaWarning(delta: number, populationSize: number): string | null {
  if (delta >= 1 / populationSize) {
    return (
      `Delta of ${delta} is at least 1 in ${populationSize}, the size of the population. ` +
      'A guarantee that may fail that often permits a mechanism that publishes a few records verbatim and satisfies the definition. Delta well below 1/n is the usual requirement.'
    );
  }
  return null;
}

/**
 * PRD §7.5 and §7.6, CLAUDE.md §5.
 *
 * - The Laplace mechanism's empirical output distribution matches the analytic density
 *   over many samples.
 * - Sensitivity is computed, not assumed, and asserted against hand calculation per
 *   query type.
 * - Sequential composition of epsilon is additive, verified against the budget log.
 */
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import {
  countQuery,
  sumQuery,
  meanQuery,
  histogramQuery,
  clampValue,
  SensitivityError,
} from '../src/engine/dp/sensitivity';
import {
  sampleLaplace,
  laplaceMechanism,
  laplaceDensity,
  laplaceCdf,
  laplaceInterval,
} from '../src/engine/dp/laplace';
import {
  gaussianMechanism,
  gaussianSigma,
  gaussianDensity,
  deltaWarning,
  GaussianEpsilonError,
} from '../src/engine/dp/gaussian';
import {
  newBudget,
  charge,
  canAfford,
  queriesRemaining,
  totalCost,
  BudgetExhaustedError,
} from '../src/engine/dp/budget';

describe('sensitivity is computed per query type, against hand calculation', () => {
  it('gives a count sensitivity 1', () => {
    const q = countQuery();
    expect(q.sensitivity).toBe(1);
    expect(q.derivation).toContain('at most 1');
  });

  it('gives a sum the clamp range, not the data range', () => {
    // Incomes clamped to [0, 20_000_000]. One person can move the sum by the full range.
    const q = sumQuery('income', { low: 0, high: 20_000_000 });
    expect(q.sensitivity).toBe(20_000_000);
    const q2 = sumQuery('income', { low: 1_000_000, high: 5_000_000 });
    expect(q2.sensitivity).toBe(4_000_000);
  });

  it('refuses a sum with no usable clamp, rather than assuming one', () => {
    expect(() => sumQuery('income', { low: 5, high: 5 })).toThrow(SensitivityError);
    expect(() => sumQuery('income', { low: 10, high: 1 })).toThrow(SensitivityError);
  });

  it('gives a mean the clamp range over the minimum group size', () => {
    // (high - low) / n = (100 - 0) / 25 = 4.
    const q = meanQuery('income', { low: 0, high: 100 }, 25);
    expect(q.sensitivity).toBe(4);
    expect(meanQuery('income', { low: 20, high: 80 }, 10).sensitivity).toBeCloseTo(6, 12);
  });

  it('refuses a mean with no publicly known minimum group size', () => {
    expect(() => meanQuery('income', { low: 0, high: 100 }, 0)).toThrow(SensitivityError);
  });

  it('states the assumption the mean rests on', () => {
    const q = meanQuery('income', { low: 0, high: 100 }, 25);
    expect(q.derivation).toContain('assumes the minimum group size is public');
  });

  it('gives a histogram sensitivity 1 under add-remove and 2 under replace-one', () => {
    // Not the number of bins, which is the common error.
    expect(histogramQuery('diagnosis', 'add-remove').sensitivity).toBe(1);
    expect(histogramQuery('diagnosis', 'replace-one').sensitivity).toBe(2);
  });

  it('does not give every query sensitivity 1', () => {
    const sensitivities = [
      countQuery().sensitivity,
      sumQuery('income', { low: 0, high: 1000 }).sensitivity,
      meanQuery('income', { low: 0, high: 1000 }, 50).sensitivity,
      histogramQuery('diagnosis', 'replace-one').sensitivity,
    ];
    expect(new Set(sensitivities).size).toBe(4);
  });

  it('clamps values into the declared range the derivation assumed', () => {
    const clamp = { low: 0, high: 100 };
    expect(clampValue(-5, clamp)).toBe(0);
    expect(clampValue(150, clamp)).toBe(100);
    expect(clampValue(42, clamp)).toBe(42);
  });
});

describe('the Laplace mechanism matches its analytic density', () => {
  const scale = 2.5;
  const n = 400000;
  const rng = makeRng(1234);
  const samples: number[] = new Array(n);
  for (let i = 0; i < n; i++) samples[i] = sampleLaplace(rng, scale);

  it('has the right mean and variance', () => {
    // Lap(b): mean 0, variance 2b².
    let sum = 0;
    for (const s of samples) sum += s;
    const mean = sum / n;
    let sq = 0;
    for (const s of samples) sq += (s - mean) * (s - mean);
    const variance = sq / n;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(variance / (2 * scale * scale)).toBeCloseTo(1, 1);
  });

  it('matches the density bin by bin', () => {
    const lo = -12;
    const hi = 12;
    const bins = 48;
    const width = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    let inRange = 0;
    for (const s of samples) {
      if (s < lo || s >= hi) continue;
      counts[Math.floor((s - lo) / width)]++;
      inRange++;
    }
    expect(inRange / n).toBeGreaterThan(0.98);

    for (let i = 0; i < bins; i++) {
      const centre = lo + (i + 0.5) * width;
      const expected = laplaceDensity(centre, scale) * width * n;
      if (expected < 200) continue; // Poisson noise dominates the far tails.
      const observed = counts[i];
      expect(Math.abs(observed - expected) / expected).toBeLessThan(0.08);
    }
  });

  it('matches the CDF at the quantiles', () => {
    const sorted = [...samples].sort((a, b) => a - b);
    for (const q of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const empirical = sorted[Math.floor(q * n)];
      expect(laplaceCdf(empirical, scale)).toBeCloseTo(q, 2);
    }
  });

  it('scales noise as sensitivity over epsilon', () => {
    const r = makeRng(7);
    const a = laplaceMechanism(r, 100, 1, 0.1);
    const b = laplaceMechanism(r, 100, 1, 1);
    const c = laplaceMechanism(r, 100, 20, 1);
    expect(a.scale).toBe(10);
    expect(b.scale).toBe(1);
    expect(c.scale).toBe(20);
    // The released value is the true value plus the noise, and both are retained.
    expect(a.value).toBeCloseTo(a.trueValue + a.noise, 12);
  });

  it('is reproducible from its seed', () => {
    const a = laplaceMechanism(makeRng(99), 50, 1, 0.5);
    const b = laplaceMechanism(makeRng(99), 50, 1, 0.5);
    expect(a.value).toBe(b.value);
  });

  it('states the accuracy cost as an interval', () => {
    // 95% of Lap(b) mass lies within b·ln(20) of zero on each side.
    expect(laplaceInterval(1, 0.95)).toBeCloseTo(2 * Math.log(20), 12);
    const sorted = [...samples].sort((a, b) => a - b);
    const width = sorted[Math.floor(0.975 * n)] - sorted[Math.floor(0.025 * n)];
    expect(width).toBeCloseTo(laplaceInterval(scale, 0.95), 0);
  });

  it('refuses a non-positive epsilon rather than dividing by zero', () => {
    expect(() => laplaceMechanism(makeRng(1), 10, 1, 0)).toThrow();
    expect(() => laplaceMechanism(makeRng(1), 10, 0, 1)).toThrow();
  });
});

describe('the Gaussian mechanism', () => {
  it('uses the classical sigma, against hand calculation', () => {
    const sigma = gaussianSigma(1, 0.5, 1e-6);
    expect(sigma).toBeCloseTo(Math.sqrt(2 * Math.log(1.25 / 1e-6)) / 0.5, 10);
  });

  it('refuses epsilon above 1, where the classical bound does not hold', () => {
    expect(() => gaussianSigma(1, 1.5, 1e-6)).toThrow(GaussianEpsilonError);
    expect(() => gaussianSigma(1, 1, 1e-6)).not.toThrow();
  });

  it('matches its density', () => {
    const rng = makeRng(555);
    const sigma = gaussianSigma(1, 0.5, 1e-5);
    const n = 200000;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) samples.push(gaussianMechanism(rng, 0, 1, 0.5, 1e-5).noise);
    let sum = 0;
    for (const s of samples) sum += s;
    const mean = sum / n;
    let sq = 0;
    for (const s of samples) sq += (s - mean) * (s - mean);
    expect(Math.abs(mean)).toBeLessThan(sigma * 0.02);
    expect(Math.sqrt(sq / n) / sigma).toBeCloseTo(1, 1);

    const width = sigma / 2;
    let inBin = 0;
    for (const s of samples) if (Math.abs(s) < width / 2) inBin++;
    expect(inBin / n).toBeCloseTo(gaussianDensity(0, sigma) * width, 2);
  });

  it('warns when delta is too large to mean anything', () => {
    expect(deltaWarning(1e-3, 1000)).not.toBeNull();
    expect(deltaWarning(1e-9, 1000)).toBeNull();
  });
});

describe('budget composition is sequential and additive', () => {
  it('accumulates epsilon as a sum, verified against the log', () => {
    const rng = makeRng(2026);
    let budget = newBudget(1);
    const q = countQuery('records in kelurahan');
    for (let i = 0; i < 10; i++) {
      budget = charge(budget, q, laplaceMechanism(rng, 100, q.sensitivity, 0.1));
    }
    expect(budget.entries).toHaveLength(10);
    expect(budget.spent).toBeCloseTo(1, 9);
    expect(budget.remaining).toBeCloseTo(0, 9);
    // The log is the proof: the sum of its entries is the spend.
    expect(totalCost(budget.entries.map((e) => e.epsilon))).toBeCloseTo(budget.spent, 9);
    // And remaining falls monotonically, entry by entry.
    let previous = Infinity;
    for (const e of budget.entries) {
      expect(e.remaining).toBeLessThan(previous);
      previous = e.remaining;
    }
  });

  it('charges queries of different sensitivity their actual epsilon', () => {
    const rng = makeRng(3);
    let budget = newBudget(2);
    const count = countQuery();
    const sum = sumQuery('income', { low: 0, high: 20_000_000 });
    budget = charge(budget, count, laplaceMechanism(rng, 500, count.sensitivity, 0.5));
    budget = charge(budget, sum, laplaceMechanism(rng, 5e9, sum.sensitivity, 1.0));
    expect(budget.spent).toBeCloseTo(1.5, 9);
    // The costly query is costly in noise, not in budget — that distinction matters.
    expect(budget.entries[1].answer.scale).toBe(20_000_000);
    expect(budget.entries[1].epsilon).toBe(1);
  });

  it('refuses a query the budget cannot afford, and does not refill', () => {
    const rng = makeRng(4);
    let budget = newBudget(0.3);
    const q = countQuery();
    budget = charge(budget, q, laplaceMechanism(rng, 10, 1, 0.2));
    expect(canAfford(budget, 0.2)).toBe(false);
    expect(() => charge(budget, q, laplaceMechanism(rng, 10, 1, 0.2))).toThrow(
      BudgetExhaustedError,
    );
    // The failed attempt changed nothing.
    expect(budget.spent).toBeCloseTo(0.1 + 0.1, 9);
    expect(budget.entries).toHaveLength(1);
  });

  it('is exhausted exactly, without a floating-point sliver permitting one more', () => {
    const rng = makeRng(5);
    let budget = newBudget(1);
    for (let i = 0; i < 10; i++) {
      budget = charge(budget, countQuery(), laplaceMechanism(rng, 1, 1, 0.1));
    }
    expect(canAfford(budget, 0.1)).toBe(false);
    expect(queriesRemaining(budget, 0.1)).toBe(0);
  });

  it('reports how many queries remain at a given epsilon', () => {
    const budget = newBudget(1);
    expect(queriesRemaining(budget, 0.1)).toBe(10);
    expect(queriesRemaining(budget, 0.25)).toBe(4);
    expect(queriesRemaining(budget, 2)).toBe(0);
  });

  it('leaves the previous budget untouched, so a case can be replayed', () => {
    const rng = makeRng(6);
    const before = newBudget(1);
    const after = charge(before, countQuery(), laplaceMechanism(rng, 1, 1, 0.4));
    expect(before.spent).toBe(0);
    expect(before.entries).toHaveLength(0);
    expect(after.spent).toBeCloseTo(0.4, 9);
  });

  it('accumulates delta alongside epsilon for Gaussian answers', () => {
    const rng = makeRng(8);
    let budget = newBudget(1);
    const q = countQuery();
    for (let i = 0; i < 3; i++) {
      const a = gaussianMechanism(rng, 100, q.sensitivity, 0.3, 1e-6);
      budget = charge(budget, q, a, a.delta);
    }
    expect(budget.spent).toBeCloseTo(0.9, 9);
    expect(budget.deltaSpent).toBeCloseTo(3e-6, 15);
  });
});

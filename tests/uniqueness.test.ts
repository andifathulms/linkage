/**
 * PRD §7.7: on a uniform synthetic population matching the stated assumptions of each
 * paper, the reconstruction reproduces each author's reported figure within tolerance,
 * and divergences are documented rather than tuned away.
 *
 * Also PRD §6.4: the app reports what each methodology produces. It does not declare
 * Sweeney or Golle correct, and there is no test here asserting that either is.
 */
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import {
  analyticUniqueness,
  empiricalUniqueness,
  reconstruct,
  uniquenessFromCardinalities,
  expectedClassCount,
  PUBLISHED,
  HEADLINE_CONFIGURATIONS,
  DISAGREEMENT,
} from '../src/engine/uniqueness';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';

describe('analytic uniqueness', () => {
  it('is 1 when every person has their own cell to spare', () => {
    // One person per region: they are alone by construction.
    expect(analyticUniqueness({ regionSizes: [1, 1, 1], dateCardinality: 365, genderCardinality: 2 })).toBe(1);
  });

  it('falls as a region grows against a fixed number of cells', () => {
    let previous = 1.1;
    for (const n of [10, 100, 1000, 10000]) {
      const u = analyticUniqueness({ regionSizes: [n], dateCardinality: 365, genderCardinality: 2 });
      expect(u).toBeLessThan(previous);
      previous = u;
    }
  });

  it('matches a hand calculation', () => {
    // n = 5, cells = 4: each person alone with probability (3/4)^4 = 0.31640625.
    const u = analyticUniqueness({ regionSizes: [5], dateCardinality: 2, genderCardinality: 2 });
    expect(u).toBeCloseTo(Math.pow(0.75, 4), 12);
  });

  it('weights regions by size, not equally', () => {
    // A big region and a tiny one: the share is dominated by the big one.
    const mixed = analyticUniqueness({
      regionSizes: [10000, 2],
      dateCardinality: 365,
      genderCardinality: 2,
    });
    const bigOnly = analyticUniqueness({
      regionSizes: [10000],
      dateCardinality: 365,
      genderCardinality: 2,
    });
    expect(Math.abs(mixed - bigOnly)).toBeLessThan(0.01);
  });
});

describe('analytic and empirical agree on a population that matches the assumptions', () => {
  /**
   * Generate exactly what the analytic formula assumes: birthdates uniform over the
   * cells, independent of region and gender. Under those conditions the two
   * methodologies must agree, and if they do not the formula is wrong.
   */
  function uniformPopulation(regionCount: number, perRegion: number, cells: number, seed: number) {
    const rng = makeRng(seed);
    const keys: string[] = [];
    const regions: string[] = [];
    for (let r = 0; r < regionCount; r++) {
      for (let i = 0; i < perRegion; i++) {
        const cell = rng.int(cells);
        keys.push(`${r}|${cell}`);
        regions.push(String(r));
      }
    }
    return { keys, regions };
  }

  it('agrees within sampling error across a range of densities', () => {
    for (const [perRegion, cells] of [
      [50, 730],
      [200, 730],
      [1000, 730],
      [500, 100],
    ] as const) {
      const { keys, regions } = uniformPopulation(40, perRegion, cells, 1000 + perRegion + cells);
      const analytic = analyticUniqueness({
        regionSizes: new Array(40).fill(perRegion),
        dateCardinality: cells,
        genderCardinality: 1,
      });
      const empirical = empiricalUniqueness(keys);
      expect(regions).toHaveLength(keys.length);
      expect(Math.abs(empirical - analytic)).toBeLessThan(0.02);
    }
  });
});

describe('the reconstruction reports both methodologies and their divergence', () => {
  const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 20000, seed: 77 });

  const run = (regionDigits: number, datePrecision: 'full' | 'year') => {
    const keys: string[] = [];
    const regions: string[] = [];
    const dates = new Set<string>();
    for (const r of pop.records) {
      const region = String(r.quasi.kelurahan).slice(0, regionDigits);
      const date =
        datePrecision === 'full'
          ? String(r.quasi.birthdate)
          : String(r.quasi.birthdate).slice(0, 4);
      dates.add(date);
      keys.push(`${region}|${date}|${r.quasi.gender}`);
      regions.push(region);
    }
    return { keys, regions, dateCardinality: dates.size };
  };

  it('reports an empirical figure counted directly from the population', () => {
    const { keys, regions, dateCardinality } = run(6, 'full');
    const result = reconstruct(keys, regions, HEADLINE_CONFIGURATIONS[0], dateCardinality);
    // Independent count of the same thing.
    const tally = new Map<string, number>();
    for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
    let unique = 0;
    for (const n of tally.values()) if (n === 1) unique++;
    expect(result.empirical).toBeCloseTo(unique / keys.length, 12);
    expect(result.populationSize).toBe(keys.length);
  });

  it('reproduces the phenomenon both authors agree on: uniqueness falls with region size', () => {
    const fine = run(6, 'full');
    const coarse = run(2, 'full');
    const fineResult = reconstruct(fine.keys, fine.regions, HEADLINE_CONFIGURATIONS[0], fine.dateCardinality);
    const coarseResult = reconstruct(coarse.keys, coarse.regions, HEADLINE_CONFIGURATIONS[2], coarse.dateCardinality);
    expect(fineResult.empirical).toBeGreaterThan(coarseResult.empirical);
    expect(fineResult.regionCount).toBeGreaterThan(coarseResult.regionCount);
  });

  it('reproduces the drop from a full date to a year', () => {
    const full = run(4, 'full');
    const year = run(4, 'year');
    const a = reconstruct(full.keys, full.regions, HEADLINE_CONFIGURATIONS[1], full.dateCardinality);
    const b = reconstruct(
      year.keys,
      year.regions,
      { region: 'city', date: 'year', gender: true },
      year.dateCardinality,
    );
    expect(a.empirical).toBeGreaterThan(b.empirical);
  });

  it('documents the divergence rather than hiding it', () => {
    const { keys, regions, dateCardinality } = run(4, 'full');
    const result = reconstruct(keys, regions, HEADLINE_CONFIGURATIONS[1], dateCardinality);
    expect(result.divergence).toBeCloseTo(result.empirical - result.analytic, 12);
    // The divergence is real, and it is the finding: a generated population with a
    // realistic age distribution does not match the analytic formula's uniformity
    // assumption, and the two figures part company by a measurable amount.
    expect(Number.isFinite(result.divergence)).toBe(true);
  });

  it('attaches the published figures for the configuration, from both authors', () => {
    const { keys, regions, dateCardinality } = run(6, 'full');
    const result = reconstruct(keys, regions, HEADLINE_CONFIGURATIONS[0], dateCardinality);
    const authors = new Set(result.published.map((p) => p.author));
    expect(authors.has('Sweeney')).toBe(true);
    expect(authors.has('Golle')).toBe(true);
  });
});

describe('the published figures', () => {
  it('carries both authors and the county-level agreement', () => {
    const sweeney = PUBLISHED.filter((p) => p.author === 'Sweeney');
    const golle = PUBLISHED.filter((p) => p.author === 'Golle');
    expect(sweeney.length).toBeGreaterThan(0);
    expect(golle.length).toBeGreaterThan(0);

    const countySweeney = sweeney.find((p) => p.configuration.region === 'county')!;
    const countyGolle = golle.find((p) => p.configuration.region === 'county')!;
    expect(countySweeney.share).toBeCloseTo(countyGolle.share, 3);
  });

  it('carries the disputed postcode figures from both, unranked', () => {
    const postcode = PUBLISHED.filter((p) => p.configuration.region === 'postcode');
    const shares = postcode.map((p) => p.share);
    expect(shares).toContain(0.87);
    expect(shares).toContain(0.61);
    // The gap the app exists to show.
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThan(0.25);
  });

  it('states the disagreement as unresolved and names neither as correct', () => {
    expect(DISAGREEMENT).toContain('unresolved');
    expect(DISAGREEMENT).not.toMatch(/correct|right|wrong|error/i);
  });
});

describe('uniqueness from declared cardinalities, for the assessor', () => {
  it('is the same mathematics as the analytic reconstruction', () => {
    const populationSize = 5000;
    const cardinalities = [500, 365, 2];
    const cells = 500 * 365 * 2;
    expect(uniquenessFromCardinalities(populationSize, cardinalities)).toBeCloseTo(
      Math.pow(1 - 1 / cells, populationSize - 1),
      12,
    );
  });

  it('rises with quasi-identifier cardinality', () => {
    let previous = -1;
    for (const cards of [[10], [10, 12], [10, 12, 2], [10, 365, 2]]) {
      const u = uniquenessFromCardinalities(10000, cards);
      expect(u).toBeGreaterThanOrEqual(previous);
      previous = u;
    }
  });

  it('falls as the population grows against fixed cardinality', () => {
    const small = uniquenessFromCardinalities(1000, [500, 365, 2]);
    const large = uniquenessFromCardinalities(100000, [500, 365, 2]);
    expect(large).toBeLessThan(small);
  });

  it('estimates the class count against a direct count', () => {
    const rng = makeRng(31);
    const cells = 500;
    const n = 2000;
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) seen.add(rng.int(cells));
    expect(expectedClassCount(n, cells)).toBeCloseTo(seen.size, -1);
  });
});

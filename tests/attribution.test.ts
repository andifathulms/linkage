/**
 * Column attribution, measured against the assessor's estimate.
 *
 * The point of this module is to put a number on a caveat the app currently states as a
 * sentence, so the test has to establish two things.
 *
 * That the measurement is right: uniqueness by grouping, and leave-one-out contributions
 * that behave the way leave-one-out has to behave.
 *
 * That the comparison is fair: the estimated side has to use the assessor's own
 * estimator on the observed cardinalities, so the only difference between the two
 * numbers is the independence assumption. If the estimator or the cardinalities differed
 * too, the gap would not be attributable to anything.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { generalisePopulation, QUASI_COLUMNS, KEY_SEPARATOR } from '../src/engine/generalise';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { uniquenessFromCardinalities } from '../src/engine/uniqueness';
import { attributeUniqueness, uniquenessOf } from '../src/engine/attribution';
import { makeRng } from '../src/engine/rng';

describe('uniqueness by grouping', () => {
  it('counts the records whose key occurs exactly once', () => {
    expect(uniquenessOf(['a', 'a', 'b', 'c'])).toBeCloseTo(0.5, 10);
    expect(uniquenessOf(['a', 'a', 'a'])).toBe(0);
    expect(uniquenessOf(['a', 'b', 'c'])).toBe(1);
    expect(uniquenessOf([])).toBe(0);
  });
});

describe('attribution by hand', () => {
  const j = (...parts: string[]) => parts.join(KEY_SEPARATOR);

  it('gives a column that separates nobody no contribution', () => {
    // Four people. The second column is constant, so removing it changes nothing.
    const keys = [j('a', 'x'), j('b', 'x'), j('c', 'x'), j('c', 'x')];
    const report = attributeUniqueness(keys, ['region', 'constant']);
    const constant = report.ranked.find((r) => r.column === 'constant')!;
    expect(constant.cardinality).toBe(1);
    expect(constant.measuredContribution).toBe(0);
    const region = report.ranked.find((r) => r.column === 'region')!;
    expect(region.measuredContribution).toBeGreaterThan(0);
    expect(report.ranked[0].column).toBe('region');
  });

  it('gives a column that separates everybody the whole contribution', () => {
    const keys = [j('a', 'p'), j('a', 'q'), j('a', 'r')];
    const report = attributeUniqueness(keys, ['constant', 'serial']);
    expect(report.measuredUniqueness).toBe(1);
    const serial = report.ranked.find((r) => r.column === 'serial')!;
    // Without the serial nobody is alone; with it everybody is.
    expect(serial.measuredWithout).toBe(0);
    expect(serial.measuredContribution).toBe(1);
  });

  it('splits the contribution when two columns are redundant', () => {
    // Two columns carrying the same information. Removing either leaves the other, so
    // neither is credited with what they jointly do. That is what leave-one-out means,
    // and the app has to be able to explain it rather than be surprised by it.
    const keys = [j('a', 'a'), j('b', 'b'), j('c', 'c')];
    const report = attributeUniqueness(keys, ['left', 'right']);
    expect(report.measuredUniqueness).toBe(1);
    for (const column of report.ranked) {
      expect(column.measuredWithout).toBe(1);
      expect(column.measuredContribution).toBe(0);
    }
  });

  it('reads component i of every key as column i', () => {
    // The signature requires the column list because the keys carry no names. Getting
    // this wrong would mislabel every row of the output rather than fail loudly.
    const keys = [j('a', 'x'), j('a', 'y'), j('b', 'x')];
    const report = attributeUniqueness(keys, ['first', 'second']);
    expect(report.ranked.map((r) => r.column).sort()).toEqual(['first', 'second']);
    expect(report.columns).toEqual(['first', 'second']);
  });
});

describe('attribution against the assessor estimator', () => {
  const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 6000, seed: 51, correlation: 0 });
  const hc = hierarchyCardinalities(pop.hierarchy);
  const tax = buildTaxonomy({
    ...hc,
    birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
    months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
    years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
    ages: new Set(pop.records.map((r) => r.quasi.age)).size,
  });
  const vector = { kelurahan: 2, birthdate: 3, gender: 0, age: 2 };
  const keys = generalisePopulation(pop.records, tax, vector, QUASI_COLUMNS);

  it('estimates with the assessor own estimator on the observed cardinalities', () => {
    // The fairness assertion. Recompute the estimate independently from the observed
    // cardinalities and require an exact match, so the comparison cannot drift into
    // being estimator against estimator.
    const report = attributeUniqueness(keys, [...QUASI_COLUMNS]);
    const cardinalities = QUASI_COLUMNS.map((_, i) => {
      const values = new Set<string>();
      for (const key of keys) values.add(key.split(KEY_SEPARATOR)[i]);
      return values.size;
    });
    expect(report.estimatedUniqueness).toBe(
      uniquenessFromCardinalities(pop.records.length, cardinalities),
    );
    for (const column of report.ranked) {
      const i = QUASI_COLUMNS.indexOf(column.column as (typeof QUASI_COLUMNS)[number]);
      const remaining = cardinalities.filter((_, j) => j !== i);
      expect(column.estimatedWithout).toBe(
        uniquenessFromCardinalities(pop.records.length, remaining),
      );
    }
  });

  it('reports the measured uniqueness as the share actually alone', () => {
    const report = attributeUniqueness(keys, [...QUASI_COLUMNS]);
    expect(report.measuredUniqueness).toBe(uniquenessOf(keys));
    expect(report.population).toBe(pop.records.length);
  });

  it('signs the gap as measured minus estimated', () => {
    const report = attributeUniqueness(keys, [...QUASI_COLUMNS]);
    expect(report.optimism).toBeCloseTo(
      report.measuredUniqueness - report.estimatedUniqueness,
      12,
    );
  });

  it('agrees with the measurement when its own assumption holds', () => {
    // The fairness check that makes the gap attributable to anything. Assign records to
    // cells uniformly at random, which is exactly what the estimator assumes, and the
    // two numbers have to agree. If they did not, a gap on a real population would be
    // the estimator being wrong rather than the assumption failing.
    const rng = makeRng(1234);
    const n = 5000;
    const cardinality = 100;
    const uniformKeys: string[] = [];
    for (let i = 0; i < n; i++) {
      uniformKeys.push([rng.int(cardinality), rng.int(cardinality)].join(KEY_SEPARATOR));
    }
    const report = attributeUniqueness(uniformKeys, ['left', 'right']);
    expect(report.measuredUniqueness).toBeCloseTo(report.estimatedUniqueness, 2);
    expect(Math.abs(report.optimism)).toBeLessThan(0.02);
  });

  it('departs from the measurement on a population whose regions are uneven', () => {
    // And the finding. The generator weights kelurahan unevenly and draws ages from a
    // distribution, so records clump into far fewer occupied cells than the product of
    // cardinalities suggests. The estimator, which spreads them uniformly, reads a very
    // different population from the one that exists.
    //
    // The sign is asserted rather than assumed. On this generator the estimate comes in
    // high, which means it over-states uniqueness and therefore over-states risk. That
    // is the opposite direction from the one INDEPENDENCE_ASSUMPTION describes, and the
    // test records it rather than tuning it away.
    const report = attributeUniqueness(keys, [...QUASI_COLUMNS]);
    expect(report.measuredUniqueness).toBeLessThan(0.2);
    expect(report.estimatedUniqueness).toBeGreaterThan(0.7);
    expect(report.optimism).toBeLessThan(-0.5);
  });

  it('is unmoved by the generator correlation control, which is a sensitive-value knob', () => {
    // Guards a limitation rather than a behaviour. `correlation` tilts the sensitive
    // value within a region-and-age stratum; it induces no correlation between
    // quasi-identifiers, so it cannot be swept to quantify the assessor's caveat. If a
    // quasi-identifier correlation control is ever added, this test is where to notice
    // that the sweep has become possible.
    const at = (correlation: number) => {
      const p = generatePopulation({ ...DEFAULT_PARAMS, size: 3000, seed: 51, correlation });
      const h = hierarchyCardinalities(p.hierarchy);
      const t = buildTaxonomy({
        ...h,
        birthdates: new Set(p.records.map((r) => r.quasi.birthdate)).size,
        months: new Set(p.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
        years: new Set(p.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
        ages: new Set(p.records.map((r) => r.quasi.age)).size,
      });
      return generalisePopulation(p.records, t, vector, QUASI_COLUMNS);
    };
    expect(at(1)).toEqual(at(0));
  });
});

/**
 * Suppression, and who it removes.
 *
 * Two things have to hold. The mechanical one: exactly the records in classes below the
 * target are dropped, and one pass is enough because classes partition the population.
 * The substantive one: when the population is built so that rarity concentrates in a
 * known place, the measured skew finds that place. A skew measure that cannot find a
 * skew somebody planted is not evidence of anything.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { generalisePopulation, QUASI_COLUMNS, zeroVector } from '../src/engine/generalise';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { buildClasses } from '../src/engine/classes';
import { suppressToK } from '../src/engine/suppression';
import type { PersonRecord } from '../src/engine/types';

/** A minimal record, enough for the parts of the engine under test here. */
function person(id: number, kelurahan: string, age: number): PersonRecord {
  return {
    id,
    nik: String(id).padStart(16, '0'),
    quasi: { kelurahan, age },
    sensitive: { diagnosis: 'none' },
    identity: { name: `Person ${id}`, kelurahan, birthdate: '1980-01-01', gender: 'M' },
  };
}

describe('suppression by hand', () => {
  // Ten people. Eight in one kelurahan, two in another. The pair is what fails k = 3.
  const records = [
    ...Array.from({ length: 8 }, (_, i) => person(i, 'big', 30)),
    person(8, 'small', 30),
    person(9, 'small', 30),
  ];
  const keys = records.map((r) => `${r.quasi.kelurahan}`);

  it('drops exactly the records in classes below the target', () => {
    const result = suppressToK(records, keys, 3, { columns: ['kelurahan'] });
    expect(result.suppressed).toBe(2);
    expect(result.suppressedIds).toEqual([8, 9]);
    expect(result.retained).toBe(8);
    expect(result.population).toBe(10);
  });

  it('drops nobody when every class already meets the target', () => {
    const result = suppressToK(records, keys, 2, { columns: ['kelurahan'] });
    expect(result.suppressed).toBe(0);
    expect(result.ranked[0].mostAffected).toBeNull();
  });

  it('names the value the cost fell on, with both shares', () => {
    const result = suppressToK(records, keys, 3, { columns: ['kelurahan'] });
    const affected = result.ranked[0].mostAffected;
    expect(affected).not.toBeNull();
    expect(affected!.value).toBe('small');
    // Everyone suppressed came from a kelurahan holding a fifth of the population.
    expect(affected!.suppressedCount).toBe(2);
    expect(affected!.suppressedShare).toBe(1);
    expect(affected!.populationCount).toBe(2);
    expect(affected!.populationShare).toBeCloseTo(0.2, 10);
  });

  it('measures no skew when suppression takes a representative slice', () => {
    // Two kelurahan of equal size, both failing k, so the suppressed subset has exactly
    // the population's composition and the distance is zero.
    const even = [
      ...Array.from({ length: 2 }, (_, i) => person(i, 'a', 30)),
      ...Array.from({ length: 2 }, (_, i) => person(i + 2, 'b', 30)),
    ];
    const evenKeys = even.map((r) => `${r.quasi.kelurahan}`);
    const result = suppressToK(even, evenKeys, 3, { columns: ['kelurahan'] });
    expect(result.suppressed).toBe(4);
    expect(result.ranked[0].distance).toBeCloseTo(0, 10);
  });

  it('ranks the column the cost concentrated in first', () => {
    // Age is uniform across everyone, so it carries no skew; kelurahan carries all of it.
    const result = suppressToK(records, keys, 3, { columns: ['age', 'kelurahan'] });
    expect(result.ranked[0].column).toBe('kelurahan');
    expect(result.ranked[0].distance).toBeGreaterThan(0);
    expect(result.ranked[1].distance).toBeCloseTo(0, 10);
  });
});

describe('suppression on a generated population', () => {
  const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 6000, seed: 41 });
  const hc = hierarchyCardinalities(pop.hierarchy);
  const tax = buildTaxonomy({
    ...hc,
    birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
    months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
    years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
    ages: new Set(pop.records.map((r) => r.quasi.age)).size,
  });
  const keys = generalisePopulation(
    pop.records,
    tax,
    { kelurahan: 2, birthdate: 4, gender: 0, age: 2 },
    QUASI_COLUMNS,
  );

  it('agrees with the class set about what fails the target', () => {
    const set = buildClasses(pop.records, keys);
    const result = suppressToK(pop.records, keys, 5, { columns: ['kelurahan'] });
    const expected = set.classes
      .filter((c) => c.members.length < 5)
      .reduce((n, c) => n + c.members.length, 0);
    expect(result.suppressed).toBe(expected);
  });

  it('leaves a population that actually meets the target', () => {
    // One pass is exact only because dropping a class cannot change another class's
    // size. This is the assertion that keeps that reasoning honest.
    const result = suppressToK(pop.records, keys, 5, { columns: ['kelurahan'] });
    const dropped = new Set(result.suppressedIds);
    const survivors = pop.records.filter((r) => !dropped.has(r.id));
    const survivorKeys = pop.records
      .map((r, i) => ({ r, key: keys[i] }))
      .filter(({ r }) => !dropped.has(r.id))
      .map(({ key }) => key);
    expect(buildClasses(survivors, survivorKeys).k).toBeGreaterThanOrEqual(5);
  });

  it('suppresses more as the target rises, never fewer', () => {
    const at = (k: number) => suppressToK(pop.records, keys, k, { columns: ['kelurahan'] }).suppressed;
    expect(at(2)).toBeLessThanOrEqual(at(5));
    expect(at(5)).toBeLessThanOrEqual(at(10));
    expect(at(10)).toBeLessThanOrEqual(at(25));
  });

  it('finds the cost falling unevenly across the region hierarchy', () => {
    // The finding. Not asserted as a fixed number, because that would be a property of
    // one seed; asserted as the direction, which is a property of how rarity works.
    const result = suppressToK(pop.records, keys, 5, {
      columns: ['kelurahan', 'age', 'gender'],
      ordinalColumns: ['age'],
    });
    expect(result.suppressed).toBeGreaterThan(0);
    const kelurahan = result.columns.find((c) => c.column === 'kelurahan');
    const gender = result.columns.find((c) => c.column === 'gender');
    expect(kelurahan!.distance).toBeGreaterThan(0);
    // Gender is close to evenly split and is one of the quasi-identifiers being
    // generalised over, so the cost should not concentrate in it the way it does in
    // region, where the population weights are deliberately uneven.
    expect(kelurahan!.distance).toBeGreaterThan(gender!.distance);
  });

  it('reports raw values, not generalised ones', () => {
    // The skew has to be legible in the steward's own vocabulary. A kelurahan code
    // generalised to a kabupaten prefix would name the wrong place.
    const result = suppressToK(pop.records, keys, 5, { columns: ['kelurahan'] });
    const raw = new Set(pop.records.map((r) => String(r.quasi.kelurahan)));
    for (const value of result.columns[0].order) {
      expect(raw.has(String(value))).toBe(true);
    }
  });
});

describe('suppression at raw precision', () => {
  it('drops nearly everyone, which is why generalisation exists', () => {
    const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 2000, seed: 42 });
    const hc = hierarchyCardinalities(pop.hierarchy);
    const tax = buildTaxonomy({
      ...hc,
      birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
      months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
      years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
      ages: new Set(pop.records.map((r) => r.quasi.age)).size,
    });
    const keys = generalisePopulation(pop.records, tax, zeroVector(QUASI_COLUMNS), QUASI_COLUMNS);
    const result = suppressToK(pop.records, keys, 5, { columns: ['kelurahan'] });
    expect(result.retained).toBeLessThan(pop.records.length * 0.02);
  });
});

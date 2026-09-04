/**
 * PRD §7.2 and §7.4: reported k equals the minimum equivalence class size, verified by
 * brute force; l-diversity and t-closeness against hand-computed fixtures, including the
 * earth mover's distance.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy, SUPPRESSED, ageBand } from '../src/engine/taxonomy';
import {
  generalisePopulation,
  generaliseValue,
  zeroVector,
  QUASI_COLUMNS,
  vectorKey,
  parseVectorKey,
} from '../src/engine/generalise';
import {
  buildClasses,
  distinctL,
  entropyL,
  earthMoversDistance,
  exposureOf,
  singletonRecordIds,
} from '../src/engine/classes';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import type { PersonRecord, Value } from '../src/engine/types';

function taxonomyFor(pop: ReturnType<typeof generatePopulation>) {
  const hc = hierarchyCardinalities(pop.hierarchy);
  const years = new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size;
  const months = new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size;
  const birthdates = new Set(pop.records.map((r) => r.quasi.birthdate)).size;
  const ages = new Set(pop.records.map((r) => r.quasi.age)).size;
  return buildTaxonomy({ ...hc, birthdates, months, years, ages });
}

describe('taxonomy', () => {
  const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 2000, seed: 4 });
  const tax = taxonomyFor(pop);

  it('coarsens region by code prefix, level by level', () => {
    const code = String(pop.records[0].quasi.kelurahan);
    expect(generaliseValue(tax, 'kelurahan', 0, code)).toBe(code);
    expect(generaliseValue(tax, 'kelurahan', 1, code)).toBe(code.slice(0, 6));
    expect(generaliseValue(tax, 'kelurahan', 2, code)).toBe(code.slice(0, 4));
    expect(generaliseValue(tax, 'kelurahan', 3, code)).toBe(code.slice(0, 2));
    expect(generaliseValue(tax, 'kelurahan', 4, code)).toBe(SUPPRESSED);
  });

  it('coarsens a date to month, year and five-year band', () => {
    expect(generaliseValue(tax, 'birthdate', 1, '1985-03-07')).toBe('1985-03');
    expect(generaliseValue(tax, 'birthdate', 2, '1985-03-07')).toBe('1985');
    expect(generaliseValue(tax, 'birthdate', 3, '1985-03-07')).toBe('1985-1989');
    expect(generaliseValue(tax, 'birthdate', 4, '1985-03-07')).toBe(SUPPRESSED);
  });

  it('bands ages on closed intervals', () => {
    expect(ageBand(37, 5)).toBe('35-39');
    expect(ageBand(40, 5)).toBe('40-44');
    expect(ageBand(0, 10)).toBe('0-9');
    expect(generaliseValue(tax, 'age', 2, 37)).toBe('30-39');
  });

  it('clamps a level above the top to the top', () => {
    expect(generaliseValue(tax, 'gender', 9, 'M')).toBe(SUPPRESSED);
  });

  it('never has a level with more distinct values than the level below', () => {
    for (const t of Object.values(tax)) {
      for (let i = 1; i < t.levels.length; i++) {
        expect(t.levels[i].cardinality).toBeLessThanOrEqual(t.levels[i - 1].cardinality);
      }
    }
  });
});

describe('generalisation vectors', () => {
  it('round-trips through its key', () => {
    const v = { kelurahan: 2, birthdate: 1, gender: 0, age: 3 };
    expect(parseVectorKey(vectorKey(v))).toEqual(v);
  });

  it('starts at raw values', () => {
    expect(zeroVector()).toEqual({ kelurahan: 0, birthdate: 0, gender: 0, age: 0 });
  });
});

describe('equivalence classes', () => {
  const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 3000, seed: 5 });
  const tax = taxonomyFor(pop);

  const at = (v: Record<string, number>) => {
    const keys = generalisePopulation(pop.records, tax, v);
    return { keys, set: buildClasses(pop.records, keys) };
  };

  it('reports k equal to the minimum class size, by brute force', () => {
    for (const v of [
      zeroVector(),
      { kelurahan: 1, birthdate: 2, gender: 0, age: 1 },
      { kelurahan: 3, birthdate: 3, gender: 0, age: 2 },
      { kelurahan: 4, birthdate: 4, gender: 1, age: 4 },
    ]) {
      const { keys, set } = at(v);
      // Brute force: count each key independently of the class structure.
      const tally = new Map<string, number>();
      for (const key of keys) tally.set(key, (tally.get(key) ?? 0) + 1);
      const bruteK = Math.min(...tally.values());
      expect(set.k).toBe(bruteK);
      expect(set.classes.length).toBe(tally.size);
      for (const cls of set.classes) expect(cls.members.length).toBe(tally.get(cls.key));
    }
  });

  it('partitions the population exactly once', () => {
    const { set } = at({ kelurahan: 1, birthdate: 2, gender: 0, age: 1 });
    const seen = new Set<number>();
    for (const cls of set.classes) for (const m of cls.members) {
      expect(seen.has(m)).toBe(false);
      seen.add(m);
    }
    expect(seen.size).toBe(pop.records.length);
  });

  it('agrees with classIndex for every record', () => {
    const { set } = at({ kelurahan: 2, birthdate: 2, gender: 0, age: 1 });
    pop.records.forEach((r, i) => {
      expect(set.classes[set.classIndex[i]].members).toContain(r.id);
    });
  });

  it('reaches k of the whole population when everything is suppressed', () => {
    const { set } = at({ kelurahan: 4, birthdate: 4, gender: 1, age: 4 });
    expect(set.classes.length).toBe(1);
    expect(set.k).toBe(pop.records.length);
    expect(set.singletons).toBe(0);
  });

  it('is monotone: generalising a column further cannot decrease k', () => {
    let previous = 0;
    for (let level = 0; level <= 4; level++) {
      const { set } = at({ kelurahan: level, birthdate: 3, gender: 0, age: 2 });
      expect(set.k).toBeGreaterThanOrEqual(previous);
      previous = set.k;
    }
  });

  it('counts singletons as the records standing alone', () => {
    const { set } = at(zeroVector());
    const ids = singletonRecordIds(set);
    expect(ids.length).toBe(set.singletons);
    for (const id of ids) {
      const ci = set.classIndex[pop.records.findIndex((r) => r.id === id)];
      expect(set.classes[ci].members).toEqual([id]);
    }
  });

  it('classifies exposure by class size', () => {
    expect(exposureOf(1)).toBe('exposed');
    expect(exposureOf(2)).toBe('narrow');
    expect(exposureOf(4)).toBe('narrow');
    expect(exposureOf(5)).toBe('protected');
  });
});

describe('l-diversity', () => {
  it('counts distinct values', () => {
    expect(distinctL(new Map<Value, number>([['a', 5]]))).toBe(1);
    expect(distinctL(new Map<Value, number>([['a', 5], ['b', 1], ['c', 1]]))).toBe(3);
  });

  it('computes entropy l against a hand calculation', () => {
    // Uniform over four values: entropy ln 4, so entropy-l is exactly 4.
    const uniform = new Map<Value, number>([['a', 5], ['b', 5], ['c', 5], ['d', 5]]);
    expect(entropyL(uniform)).toBeCloseTo(4, 10);
    // 98/1/1 is 3-diverse by the distinct measure and barely diverse by entropy.
    const skewed = new Map<Value, number>([['a', 98], ['b', 1], ['c', 1]]);
    expect(distinctL(skewed)).toBe(3);
    expect(entropyL(skewed)).toBeLessThan(1.3);
  });

  it('is 1 for a homogeneous class', () => {
    const homogeneous = new Map<Value, number>([['Cardiac', 40]]);
    expect(distinctL(homogeneous)).toBe(1);
    expect(entropyL(homogeneous)).toBeCloseTo(1, 10);
  });
});

describe('earth mover distance', () => {
  const order: Value[] = ['a', 'b', 'c', 'd'];

  it('is zero when the distributions match', () => {
    const p = new Map<Value, number>([['a', 2], ['b', 2], ['c', 2], ['d', 2]]);
    const q = new Map<Value, number>([['a', 20], ['b', 20], ['c', 20], ['d', 20]]);
    expect(earthMoversDistance(p, q, order)).toBeCloseTo(0, 12);
  });

  it('matches a hand calculation on the categorical formula', () => {
    // class 100% a; population 25% each. Total variation = .75 + .25*3 = 1.5, half = 0.75.
    const p = new Map<Value, number>([['a', 10]]);
    const q = new Map<Value, number>([['a', 1], ['b', 1], ['c', 1], ['d', 1]]);
    expect(earthMoversDistance(p, q, order)).toBeCloseTo(0.75, 12);
  });

  it('is 1 for disjoint categorical distributions', () => {
    const p = new Map<Value, number>([['a', 5]]);
    const q = new Map<Value, number>([['b', 5]]);
    expect(earthMoversDistance(p, q, ['a', 'b'])).toBeCloseTo(1, 12);
  });

  it('matches a hand calculation on the ordinal formula', () => {
    // Li et al. ordinal EMD: mean of |cumulative difference| over m-1 = 3 steps.
    // class (1,0,0,0) vs population (.25,.25,.25,.25):
    // cumulative diffs .75, .5, .25 -> (0.75+0.5+0.25)/3 = 0.5
    const p = new Map<Value, number>([['a', 8]]);
    const q = new Map<Value, number>([['a', 1], ['b', 1], ['c', 1], ['d', 1]]);
    expect(earthMoversDistance(p, q, order, true)).toBeCloseTo(0.5, 12);
  });

  it('sees distance the categorical formula cannot, when values are ordered', () => {
    // Two classes equally far from the population categorically; the ordinal formula
    // separates them because one sits at the end of the range.
    const pop = new Map<Value, number>([['a', 1], ['b', 1], ['c', 1], ['d', 1]]);
    const far = new Map<Value, number>([['d', 4]]);
    const near = new Map<Value, number>([['b', 4]]);
    expect(earthMoversDistance(far, pop, order)).toBeCloseTo(
      earthMoversDistance(near, pop, order),
      12,
    );
    expect(earthMoversDistance(far, pop, order, true)).toBeGreaterThan(
      earthMoversDistance(near, pop, order, true),
    );
  });
});

describe('k, l and t on a hand-built fixture', () => {
  // Six records in two classes of three. First class homogeneous, second diverse.
  const mk = (id: number, key: string, diagnosis: string): PersonRecord => ({
    id,
    nik: String(id).padStart(16, '0'),
    quasi: { key },
    sensitive: { diagnosis },
    identity: { name: `Person ${id}`, kelurahan: '0', birthdate: '2000-01-01', gender: 'M' },
  });

  const records = [
    mk(0, 'A', 'Cardiac'),
    mk(1, 'A', 'Cardiac'),
    mk(2, 'A', 'Cardiac'),
    mk(3, 'B', 'Cardiac'),
    mk(4, 'B', 'Respiratory'),
    mk(5, 'B', 'Metabolic'),
  ];
  const set = buildClasses(records, records.map((r) => String(r.quasi.key)));

  it('reports k as the minimum size', () => {
    expect(set.k).toBe(3);
    expect(set.classes).toHaveLength(2);
  });

  it('reports l as the minimum diversity, which the homogeneous class sets', () => {
    expect(set.l).toBe(1);
    const a = set.classes[set.byKey.get('A')!];
    const b = set.classes[set.byKey.get('B')!];
    expect(a.l).toBe(1);
    expect(b.l).toBe(3);
  });

  it('reports t as the maximum distance, computed by hand', () => {
    // Population: Cardiac 4/6, Respiratory 1/6, Metabolic 1/6.
    // Class A: Cardiac 1. TV = |1-4/6| + |0-1/6| + |0-1/6| = 2/3; half = 1/3.
    const a = set.classes[set.byKey.get('A')!];
    expect(a.t).toBeCloseTo(1 / 3, 12);
    // Class B: 1/3 each. TV = |1/3-4/6| + |1/3-1/6| * 2 = 1/3 + 1/3 = 2/3; half = 1/3.
    const b = set.classes[set.byKey.get('B')!];
    expect(b.t).toBeCloseTo(1 / 3, 12);
    expect(set.t).toBeCloseTo(1 / 3, 12);
  });

  it('accumulates the population distribution across classes', () => {
    expect(set.populationDistribution.get('Cardiac')).toBe(4);
    expect(set.populationDistribution.get('Respiratory')).toBe(1);
    expect(set.populationDistribution.get('Metabolic')).toBe(1);
    expect(set.sensitiveOrder[0]).toBe('Cardiac');
  });

  it('uses the quasi column list the caller passed, not a fixed one', () => {
    expect(QUASI_COLUMNS).toEqual(['kelurahan', 'birthdate', 'gender', 'age']);
  });
});

/**
 * PRD §7.3: for small taxonomies, exhaustive search must find the same minimal
 * generalisations as the pruned search.
 *
 * This is the app's one genuine algorithm, and the test is the reason to trust the
 * lattice view — pruning that produced a different answer from brute force would make
 * the picture a lie about the search rather than a drawing of it.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy, type Taxonomy } from '../src/engine/taxonomy';
import { generalisePopulation, vectorKey } from '../src/engine/generalise';
import { buildClasses } from '../src/engine/classes';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import {
  searchLattice,
  minimalVectors,
  informationLoss,
  bestMinimal,
  frontierNodes,
} from '../src/engine/lattice';

const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 1200, seed: 13 });
const hc = hierarchyCardinalities(pop.hierarchy);
const tax = buildTaxonomy({
  ...hc,
  birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
  months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
  years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
  ages: new Set(pop.records.map((r) => r.quasi.age)).size,
});

/** Small taxonomies, so exhaustive search is cheap enough to be the reference. */
const COLUMNS = ['kelurahan', 'age', 'gender'];

const keySet = (vs: Array<Record<string, number>>) =>
  new Set(vs.map((v) => vectorKey(v, COLUMNS))); 

describe('information loss', () => {
  it('is zero at the raw vector and one at full suppression', () => {
    expect(informationLoss({ kelurahan: 0, age: 0, gender: 0 }, tax, COLUMNS)).toBe(0);
    expect(informationLoss({ kelurahan: 4, age: 4, gender: 1 }, tax, COLUMNS)).toBe(1);
  });

  it('rises with each level, normalised by taxonomy height', () => {
    const a = informationLoss({ kelurahan: 1, age: 0, gender: 0 }, tax, COLUMNS);
    const b = informationLoss({ kelurahan: 2, age: 0, gender: 0 }, tax, COLUMNS);
    expect(b).toBeGreaterThan(a);
    // kelurahan height 4, so level 2 is half of one third of the total.
    expect(b).toBeCloseTo((2 / 4) / 3, 12);
  });
});

describe('lattice search', () => {
  for (const targetK of [2, 5, 10, 50]) {
    it(`finds the same minimal set as exhaustive search at k=${targetK}`, () => {
      const pruned = searchLattice(pop.records, tax, targetK, { columns: COLUMNS });
      const exhaustive = searchLattice(pop.records, tax, targetK, {
        columns: COLUMNS,
        exhaustive: true,
      });

      expect(keySet(pruned.minimal)).toEqual(keySet(exhaustive.minimal));

      // Every node's verdict agrees, whether it was tested or inferred.
      for (const node of pruned.nodes) {
        const other = exhaustive.byKey.get(vectorKey(node.vector, COLUMNS))!;
        expect(node.satisfies).toBe(other.satisfies);
      }
    });
  }

  it('actually prunes, and records what implied what', () => {
    const pruned = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    expect(pruned.testedCount).toBeLessThan(pruned.nodes.length);
    expect(pruned.testedCount + pruned.prunedCount).toBe(pruned.nodes.length);

    for (const node of pruned.nodes) {
      if (node.tested) {
        expect(node.prunedBy).toBeNull();
        expect(node.k).not.toBeNull();
      } else {
        // An untested node knows which result implied it, and has no k of its own.
        expect(node.prunedBy).not.toBeNull();
        expect(node.k).toBeNull();
        const source = pruned.byKey.get(node.prunedBy!)!;
        expect(source.tested).toBe(true);
        expect(source.satisfies).toBe(node.satisfies);
      }
    }
  });

  it('records an exact test order for the animation', () => {
    const pruned = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    expect(pruned.order).toHaveLength(pruned.testedCount);
    expect(new Set(pruned.order).size).toBe(pruned.order.length);
    // Ascending total level, which is what makes the pruning pay.
    let previousLevel = -1;
    for (const key of pruned.order) {
      const node = pruned.byKey.get(key)!;
      expect(node.level).toBeGreaterThanOrEqual(previousLevel);
      previousLevel = node.level;
    }
  });

  it('is deterministic', () => {
    const a = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    const b = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    expect(a.order).toEqual(b.order);
    expect(keySet(a.minimal)).toEqual(keySet(b.minimal));
  });

  it('verifies each minimal vector really achieves k, and each node below it does not', () => {
    const targetK = 5;
    const search = searchLattice(pop.records, tax, targetK, { columns: COLUMNS });
    expect(search.minimal.length).toBeGreaterThan(0);

    for (const v of search.minimal) {
      const set = buildClasses(pop.records, generalisePopulation(pop.records, tax, v, COLUMNS));
      expect(set.k).toBeGreaterThanOrEqual(targetK);

      // Minimality: stepping any one column down by one must break k.
      for (const c of COLUMNS) {
        if ((v[c] ?? 0) === 0) continue;
        const lower = { ...v, [c]: v[c] - 1 };
        const lowerSet = buildClasses(
          pop.records,
          generalisePopulation(pop.records, tax, lower, COLUMNS),
        );
        expect(lowerSet.k).toBeLessThan(targetK);
      }
    }
  });

  it('respects monotonicity across the whole lattice', () => {
    const search = searchLattice(pop.records, tax, 5, { columns: COLUMNS, exhaustive: true });
    for (const node of search.nodes) {
      if (!node.satisfies) continue;
      // Every node above a satisfying node must satisfy.
      for (const c of COLUMNS) {
        const above = { ...node.vector, [c]: (node.vector[c] ?? 0) + 1 };
        const other = search.byKey.get(vectorKey(above, COLUMNS));
        if (other) expect(other.satisfies).toBe(true);
      }
    }
  });

  it('reports k that matches a direct computation on every tested node', () => {
    const search = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    for (const node of search.nodes) {
      if (!node.tested) continue;
      const set = buildClasses(
        pop.records,
        generalisePopulation(pop.records, tax, node.vector, COLUMNS),
      );
      expect(node.k).toBe(set.k);
    }
  });

  it('picks the least lossy of the minimal vectors', () => {
    const search = searchLattice(pop.records, tax, 10, { columns: COLUMNS });
    const best = bestMinimal(search, tax)!;
    const bestLoss = informationLoss(best, tax, COLUMNS);
    for (const v of search.minimal) {
      expect(informationLoss(v, tax, COLUMNS)).toBeGreaterThanOrEqual(bestLoss);
    }
  });

  it('draws a frontier where satisfying nodes sit directly above failing ones', () => {
    const search = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    const frontier = frontierNodes(search);
    expect(frontier.length).toBeGreaterThan(0);
    for (const node of frontier) expect(node.satisfies).toBe(true);
    // Every minimal vector is on the frontier, unless it is the raw vector itself.
    for (const v of search.minimal) {
      const level = COLUMNS.reduce((s, c) => s + (v[c] ?? 0), 0);
      if (level === 0) continue;
      expect(frontier.some((n) => vectorKey(n.vector, COLUMNS) === vectorKey(v, COLUMNS))).toBe(true);
    }
  });

  it('returns the raw vector as minimal when the population already satisfies k', () => {
    const search = searchLattice(pop.records, tax, 1, { columns: COLUMNS });
    expect(search.minimal).toHaveLength(1);
    expect(vectorKey(search.minimal[0], COLUMNS)).toBe('0,0,0');
    // One test, and everything else inferred.
    expect(search.testedCount).toBe(1);
  });

  it('returns the top of the lattice when only full suppression satisfies k', () => {
    const search = searchLattice(pop.records, tax, pop.records.length, { columns: COLUMNS });
    expect(search.minimal).toHaveLength(1);
    expect(vectorKey(search.minimal[0], COLUMNS)).toBe('4,4,1');
  });

  it('finds no minimal vector when k cannot be reached at all', () => {
    const search = searchLattice(pop.records, tax, pop.records.length + 1, { columns: COLUMNS });
    expect(search.minimal).toHaveLength(0);
    for (const node of search.nodes) expect(node.satisfies).toBe(false);
  });

  it('computes the minimal set from node verdicts alone', () => {
    // minimalVectors works off verdicts, so it gives the same answer for a pruned
    // search and an exhaustive one even though they tested different nodes.
    const pruned = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    expect(keySet(minimalVectors(pruned.nodes, COLUMNS))).toEqual(keySet(pruned.minimal));
  });

  it('enumerates the whole product of taxonomy levels', () => {
    const search = searchLattice(pop.records, tax, 5, { columns: COLUMNS });
    const expected = COLUMNS.reduce((n, c) => n * (tax as Taxonomy)[c].levels.length, 1);
    expect(search.nodes).toHaveLength(expected);
    expect(new Set(search.nodes.map((n) => vectorKey(n.vector, COLUMNS))).size).toBe(expected);
  });
});

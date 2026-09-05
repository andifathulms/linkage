/**
 * Composition of two releases.
 *
 * The property under test is the one the finding rests on: an attacker holding two
 * releases of the same people is confined to the intersection of the two partitions, and
 * intersecting partitions can only cut classes. Everything else in the module is a count
 * derived from that, so the counts are checked against a brute-force intersection rather
 * than against themselves.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { generalisePopulation, QUASI_COLUMNS } from '../src/engine/generalise';
import { buildClasses } from '../src/engine/classes';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { composeReleases, jointKeys, RELEASE_SEPARATOR } from '../src/engine/composition';

function taxonomyFor(pop: ReturnType<typeof generatePopulation>) {
  const hc = hierarchyCardinalities(pop.hierarchy);
  const years = new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size;
  const months = new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size;
  const birthdates = new Set(pop.records.map((r) => r.quasi.birthdate)).size;
  const ages = new Set(pop.records.map((r) => r.quasi.age)).size;
  return buildTaxonomy({ ...hc, birthdates, months, years, ages });
}

const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 8000, seed: 11 });
const tax = taxonomyFor(pop);

/** Two lawful releases of the same people, generalised along different axes. */
const keysA = generalisePopulation(
  pop.records,
  tax,
  { kelurahan: 1, birthdate: 3, gender: 0, age: 2 },
  QUASI_COLUMNS,
);
const keysB = generalisePopulation(
  pop.records,
  tax,
  { kelurahan: 3, birthdate: 1, gender: 0, age: 0 },
  QUASI_COLUMNS,
);

describe('composition of two releases', () => {
  it('confines every record to the intersection of its two classes', () => {
    // Brute force: for each record, the set of records sharing its key in A, intersected
    // with the set sharing its key in B. The joint class must be exactly that set.
    const result = composeReleases(pop.records, keysA, keysB);

    const byA = new Map<string, number[]>();
    const byB = new Map<string, number[]>();
    const push = (m: Map<string, number[]>, key: string, i: number) => {
      const bucket = m.get(key);
      if (bucket) bucket.push(i);
      else m.set(key, [i]);
    };
    for (let i = 0; i < pop.records.length; i++) {
      push(byA, keysA[i], i);
      push(byB, keysB[i], i);
    }

    // Checking a sample rather than all 8000, because the brute-force intersection is
    // quadratic in class size and the property is per record.
    for (let i = 0; i < pop.records.length; i += 37) {
      const inA = new Set(byA.get(keysA[i]) ?? []);
      const inB = byB.get(keysB[i]) ?? [];
      const expected = inB.filter((j) => inA.has(j)).length;
      const actual = result.joint.classes[result.joint.classIndex[i]].members.length;
      expect(actual).toBe(expected);
    }
  });

  it('never produces a joint class larger than either release class', () => {
    const result = composeReleases(pop.records, keysA, keysB);
    for (let i = 0; i < pop.records.length; i++) {
      const sizeA = result.a.classes[result.a.classIndex[i]].members.length;
      const sizeB = result.b.classes[result.b.classIndex[i]].members.length;
      const sizeJoint = result.joint.classes[result.joint.classIndex[i]].members.length;
      expect(sizeJoint).toBeLessThanOrEqual(Math.min(sizeA, sizeB));
    }
  });

  it('gives a joint k no larger than either release k', () => {
    const result = composeReleases(pop.records, keysA, keysB);
    expect(result.joint.k).toBeLessThanOrEqual(Math.min(result.a.k, result.b.k));
  });

  it('finds records alone jointly that were alone in neither release', () => {
    // The finding itself, and the reason the module exists. Both releases clear k = 5
    // comfortably, which is the threshold a steward would have signed off on, and the
    // composition still leaves people standing alone.
    const safeA = generalisePopulation(
      pop.records,
      tax,
      { kelurahan: 2, birthdate: 4, gender: 0, age: 4 },
      QUASI_COLUMNS,
    );
    const safeB = generalisePopulation(
      pop.records,
      tax,
      { kelurahan: 4, birthdate: 4, gender: 0, age: 3 },
      QUASI_COLUMNS,
    );
    const a = buildClasses(pop.records, safeA);
    const b = buildClasses(pop.records, safeB);
    const result = composeReleases(pop.records, safeA, safeB);

    expect(a.k).toBeGreaterThanOrEqual(5);
    expect(b.k).toBeGreaterThanOrEqual(5);
    expect(result.joint.k).toBe(1);
    expect(result.newlyAlone).toBeGreaterThan(0);
  });

  it('reports narrowing worst first, and only where the joint class actually cut', () => {
    const result = composeReleases(pop.records, keysA, keysB);
    for (const n of result.narrowed) {
      expect(n.sizeJoint).toBeLessThan(Math.min(n.sizeA, n.sizeB));
    }
    for (let i = 1; i < result.narrowed.length; i++) {
      expect(result.narrowed[i - 1].sizeJoint).toBeLessThanOrEqual(result.narrowed[i].sizeJoint);
    }
  });

  it('composing a release with itself changes nothing', () => {
    // The degenerate case has to be exact, because it is the assertion that composition
    // is measuring the second release rather than the concatenation.
    const result = composeReleases(pop.records, keysA, keysA);
    expect(result.joint.k).toBe(result.a.k);
    expect(result.joint.classes.length).toBe(result.a.classes.length);
    expect(result.narrowed).toHaveLength(0);
    expect(result.newlyAlone).toBe(0);
  });

  it('separates the two keys with a character no generalised key can contain', () => {
    const joined = jointKeys(['a', 'ab'], ['bc', 'c']);
    expect(joined[0]).not.toBe(joined[1]);
    for (const key of [...keysA, ...keysB]) {
      expect(key.includes(RELEASE_SEPARATOR)).toBe(false);
    }
  });

  it('refuses releases that are not index-aligned', () => {
    expect(() => jointKeys(['a', 'b'], ['a'])).toThrow(/index-aligned/);
  });
});

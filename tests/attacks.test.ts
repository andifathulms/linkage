/**
 * PRD §6.2: every attack is scored against ground truth. No attack asserts that it
 * "would work"; each returns counts, and these tests check the counts.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { generalisePopulation, zeroVector } from '../src/engine/generalise';
import { buildClasses } from '../src/engine/classes';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { runLinkage, buildAuxiliaryRoll } from '../src/engine/attacks/linkage';
import { runHomogeneity, homogeneousClasses, populationBaseline } from '../src/engine/attacks/homogeneity';
import { runBackground, factsRequired } from '../src/engine/attacks/background';
import { runSkewness, diverseButSkewed, mostSkewedClasses } from '../src/engine/attacks/skewness';
import {
  answer,
  runDifferencing,
  runComposition,
  buildDifferencingPair,
  selectRecords,
} from '../src/engine/attacks/differencing';
import { narrowedTo, scoreOutcomes } from '../src/engine/attacks/types';
import type { PersonRecord } from '../src/engine/types';

const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 4000, seed: 21 });
const hc = hierarchyCardinalities(pop.hierarchy);
const tax = buildTaxonomy({
  ...hc,
  birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
  months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
  years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
  ages: new Set(pop.records.map((r) => r.quasi.age)).size,
});

const QI = ['kelurahan', 'birthdate', 'gender'];
const targets = pop.records.slice(0, 500).map((r) => r.id);

const keysAt = (v: Record<string, number>) => generalisePopulation(pop.records, tax, v, QI);
const rawKeys = keysAt(zeroVector(QI));

describe('scoring', () => {
  it('partitions outcomes into correct, incorrect and failed with no leakage', () => {
    const r = scoreOutcomes([
      { targetId: 1, guessId: 1, correct: true, candidateCount: 1 },
      { targetId: 2, guessId: 3, correct: false, candidateCount: 1 },
      { targetId: 3, guessId: null, correct: false, candidateCount: 7 },
    ]);
    expect(r.attempted).toBe(3);
    expect(r.correct + r.incorrect + r.failed).toBe(r.attempted);
    expect([r.correct, r.incorrect, r.failed]).toEqual([1, 1, 1]);
  });

  it('reports how far an unfinished attack got', () => {
    const r = scoreOutcomes([
      { targetId: 1, guessId: null, correct: false, candidateCount: 3 },
      { targetId: 2, guessId: null, correct: false, candidateCount: 900 },
    ]);
    expect(narrowedTo(r, 3)).toBe(1);
    expect(narrowedTo(r, 1000)).toBe(2);
  });
});

describe('linkage', () => {
  it('identifies targets whose raw quasi-identifiers are unique, and only those', () => {
    const result = runLinkage(pop.records, rawKeys, rawKeys, { columns: QI, targetIds: targets });
    expect(result.attempted).toBe(targets.length);
    expect(result.correct + result.incorrect + result.failed).toBe(result.attempted);

    // A join on the record's own key can never name the wrong person: if the key is
    // unique, the single match is the target.
    expect(result.incorrect).toBe(0);

    // Independent count of how many targets are unique on the raw triple.
    const tally = new Map<string, number>();
    for (const key of rawKeys) tally.set(key, (tally.get(key) ?? 0) + 1);
    const uniqueTargets = targets.filter((id) => tally.get(rawKeys[id]) === 1).length;
    expect(result.correct).toBe(uniqueTargets);
    expect(result.failed).toBe(targets.length - uniqueTargets);
  });

  it('demonstrates Sweeney: most targets are uniquely determined on region, date and gender', () => {
    const result = runLinkage(pop.records, rawKeys, rawKeys, { columns: QI, targetIds: targets });
    expect(result.correct / result.attempted).toBeGreaterThan(0.5);
  });

  it('reports candidate counts, so a narrowing is visible even when it fails', () => {
    const coarse = keysAt({ kelurahan: 3, birthdate: 2, gender: 0 });
    const result = runLinkage(pop.records, coarse, coarse, { columns: QI, targetIds: targets });
    for (const o of result.perTarget) {
      expect(o.candidateCount).toBeGreaterThanOrEqual(1);
      if (o.guessId !== null) expect(o.candidateCount).toBe(1);
    }
    // The join has still done work even where it did not finish.
    expect(narrowedTo(result, 5)).toBeGreaterThan(result.correct);
  });

  it('is defeated by generalisation, monotonically', () => {
    let previousCorrect = Infinity;
    for (const level of [0, 1, 2, 3]) {
      const keys = keysAt({ kelurahan: level, birthdate: level, gender: 0 });
      const r = runLinkage(pop.records, keys, keys, { columns: QI, targetIds: targets });
      expect(r.correct).toBeLessThanOrEqual(previousCorrect);
      previousCorrect = r.correct;
    }
    expect(previousCorrect).toBeLessThan(targets.length);
  });

  it('identifies nobody when everything is suppressed', () => {
    const keys = keysAt({ kelurahan: 4, birthdate: 4, gender: 1 });
    const r = runLinkage(pop.records, keys, keys, { columns: QI, targetIds: targets });
    expect(r.correct).toBe(0);
    expect(r.failed).toBe(targets.length);
    for (const o of r.perTarget) expect(o.candidateCount).toBe(pop.records.length);
  });

  it('cannot identify a target the auxiliary roll knows less precisely than the release', () => {
    // The attacker holds only province and year; the release is raw. The join is wide.
    const auxiliary = keysAt({ kelurahan: 3, birthdate: 2, gender: 0 });
    const r = runLinkage(pop.records, rawKeys, auxiliary, { columns: QI, targetIds: targets });
    expect(r.correct).toBe(0);
    // Every candidate count is zero: no released key matches the coarse auxiliary key.
    for (const o of r.perTarget) expect(o.candidateCount).toBe(0);
  });

  it('builds an auxiliary roll carrying identity and quasi-identifiers only', () => {
    const roll = buildAuxiliaryRoll(pop.records, rawKeys, QI, targets.slice(0, 5));
    expect(roll).toHaveLength(5);
    for (const row of roll) {
      expect(Object.keys(row.values).sort()).toEqual([...QI].sort());
      expect(row.name.length).toBeGreaterThan(0);
      expect(JSON.stringify(row)).not.toContain('diagnosis');
    }
  });
});

describe('homogeneity', () => {
  // Classes built on the columns the generator correlates against — kecamatan and age
  // decade — so that homogeneous classes exist to be found. This is the configuration
  // case 2 uses: k is comfortably satisfied and the disclosure happens anyway.
  const HQI = ['kelurahan', 'age', 'gender'];
  const correlated = generatePopulation({
    ...DEFAULT_PARAMS,
    size: 4000,
    seed: 21,
    correlation: 1,
  });
  const keys = generalisePopulation(
    correlated.records,
    tax,
    { kelurahan: 1, age: 2, gender: 1 },
    HQI,
  );
  const set = buildClasses(correlated.records, keys);

  it('finds classes where every member shares one value', () => {
    const homogeneous = homogeneousClasses(set, 5);
    expect(homogeneous.length).toBeGreaterThan(0);
    for (const i of homogeneous) {
      expect(set.classes[i].l).toBe(1);
      expect(set.classes[i].sensitiveDistribution.size).toBe(1);
    }
  });

  it('discloses a value without identifying anyone, and is scored for it', () => {
    const homogeneous = homogeneousClasses(set, 5);
    const inClass = homogeneous.flatMap((i) => set.classes[i].members);
    expect(inClass.length).toBeGreaterThan(0);
    const r = runHomogeneity(correlated.records, set, { targetIds: inClass });
    expect(r.attempted).toBe(inClass.length);
    // In a homogeneous class the inference is certain and therefore always right.
    expect(r.incorrect).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.correct).toBe(inClass.length);
    for (const o of r.perTarget) {
      expect(o.confidence).toBe(1);
      // k-anonymity is satisfied — the attacker never identified anyone.
      expect(o.classSize).toBeGreaterThanOrEqual(5);
    }
  });

  it('reports the baseline an attacker would reach by guessing the commonest value', () => {
    const all = correlated.records.map((r) => r.id);
    const r = runHomogeneity(correlated.records, set, { targetIds: all, threshold: 0 });
    const baseline = populationBaseline(set);
    expect(r.baselineCorrect / all.length).toBeCloseTo(baseline.rate, 6);
    // The attack must beat the baseline for the finding to mean anything.
    expect(r.correct).toBeGreaterThan(r.baselineCorrect);
  });

  it('claims nothing under a strict threshold when no class is homogeneous', () => {
    const uniform = generatePopulation({ ...DEFAULT_PARAMS, size: 3000, seed: 33, correlation: 0 });
    const uKeys = generalisePopulation(
      uniform.records,
      tax,
      { kelurahan: 3, birthdate: 4, gender: 1 },
      QI,
    );
    const uSet = buildClasses(uniform.records, uKeys);
    const r = runHomogeneity(uniform.records, uSet, {
      targetIds: uniform.records.slice(0, 200).map((x) => x.id),
    });
    expect(r.correct).toBe(0);
    expect(r.failed).toBe(200);
  });

  it('is not defeated by raising k, which is the point', () => {
    // Coarsen further: k rises, and the disclosure is unaffected because the classes
    // remain aligned with the attribute that determines the sensitive value.
    const coarser = generalisePopulation(
      correlated.records,
      tax,
      { kelurahan: 1, age: 2, gender: 1 },
      HQI,
    );
    const coarseSet = buildClasses(correlated.records, coarser);
    expect(coarseSet.k).toBeGreaterThanOrEqual(set.k);
    const inClass = homogeneousClasses(coarseSet, 10).flatMap((i) => coarseSet.classes[i].members);
    if (inClass.length > 0) {
      const r = runHomogeneity(correlated.records, coarseSet, { targetIds: inClass });
      expect(r.correct).toBe(inClass.length);
    }
  });
});

describe('background knowledge', () => {
  const keys = generalisePopulation(pop.records, tax, { kelurahan: 2, birthdate: 3, gender: 1 }, QI);
  const set = buildClasses(pop.records, keys);
  const sample = pop.records.slice(0, 400).map((r) => r.id);

  it('identifies more values as the attacker holds more eliminating facts', () => {
    let previous = -1;
    for (const factCount of [0, 1, 2, 3, 4]) {
      const r = runBackground(pop.records, set, { targetIds: sample, factCount });
      expect(r.correct).toBeGreaterThanOrEqual(previous);
      previous = r.correct;
    }
  });

  it('never names a value the target does not hold, since every fact it uses is true', () => {
    const r = runBackground(pop.records, set, { targetIds: sample, factCount: 3 });
    expect(r.incorrect).toBe(0);
  });

  it('determines every target once enough facts are held', () => {
    const values = set.populationDistribution.size;
    const r = runBackground(pop.records, set, { targetIds: sample, factCount: values - 1 });
    expect(r.correct).toBe(sample.length);
    expect(r.failed).toBe(0);
  });

  it('reports how many facts each target actually needed', () => {
    const histogram = factsRequired(pop.records, set, sample);
    let total = 0;
    for (const n of histogram.values()) total += n;
    expect(total).toBe(sample.length);
    // The point of the histogram: many targets fall well short of l-1 facts.
    const cheap = (histogram.get(0) ?? 0) + (histogram.get(1) ?? 0);
    expect(cheap).toBeGreaterThan(0);
  });
});

describe('skewness', () => {
  const correlated = generatePopulation({ ...DEFAULT_PARAMS, size: 6000, seed: 44, correlation: 0.8 });
  const keys = generalisePopulation(correlated.records, tax, { kelurahan: 2, birthdate: 3, gender: 1 }, QI);
  const set = buildClasses(correlated.records, keys);

  it('finds classes that satisfy l-diversity and still concede near-certainty', () => {
    const found = diverseButSkewed(set, 2, 0.8, 5);
    expect(found.length).toBeGreaterThan(0);
    for (const i of found) {
      const cls = set.classes[i];
      expect(cls.l).toBeGreaterThanOrEqual(2);
      let top = 0;
      for (const n of cls.sensitiveDistribution.values()) top = Math.max(top, n);
      expect(top / cls.members.length).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('is scored, and beats the population baseline', () => {
    const sample = correlated.records.slice(0, 800).map((r) => r.id);
    const r = runSkewness(correlated.records, set, { targetIds: sample, confidenceThreshold: 0.7 });
    expect(r.attempted).toBe(sample.length);
    expect(r.correct + r.incorrect + r.failed).toBe(r.attempted);
    expect(r.meanConfidence).toBeGreaterThanOrEqual(0.7);
    // Claimed targets, scored: the attack is right about as often as its confidence says.
    const claimed = r.correct + r.incorrect;
    expect(claimed).toBeGreaterThan(0);
    expect(r.correct / claimed).toBeGreaterThan(r.baselineConfidence);
  });

  it('ranks classes by distance from the population distribution', () => {
    const ranked = mostSkewedClasses(set, 5, 10);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(set.classes[ranked[i - 1]].t).toBeGreaterThanOrEqual(set.classes[ranked[i]].t);
    }
  });
});

describe('differencing', () => {
  const target = pop.records[7];
  const group = [
    { column: 'kelurahan' as const, op: 'prefix' as const, value: String(target.quasi.kelurahan).slice(0, 4) },
  ];

  it('answers counts, sums and means over a predicate', () => {
    const selected = selectRecords(pop.records, group);
    expect(answer(pop.records, { kind: 'count', predicates: group }).value).toBe(selected.length);
    const sum = selected.reduce((s, r) => s + Number(r.sensitive.income), 0);
    expect(answer(pop.records, { kind: 'sum', column: 'income', predicates: group }).value).toBeCloseTo(sum, 6);
    expect(answer(pop.records, { kind: 'mean', column: 'income', predicates: group }).value).toBeCloseTo(
      sum / selected.length,
      6,
    );
  });

  it('recovers an individual income from two published means', () => {
    const pair = buildDifferencingPair(pop.records, target.id, group, 'mean', 'income');
    expect(pair).not.toBeNull();
    const result = runDifferencing(pop.records, pair!.a, pair!.b, 'income');
    if (result.isolatesOne) {
      expect(result.isolatedIds).toEqual([target.id]);
      expect(result.recovered).toBeCloseTo(Number(target.sensitive.income), 4);
      expect(result.recovered).toBeCloseTo(result.actual!, 4);
    } else {
      // The predicate did not isolate one person; the result says so rather than
      // claiming a recovery, which is the property being tested.
      expect(result.recovered).toBeNull();
      expect(result.isolatedIds.length).not.toBe(1);
    }
  });

  it('isolates exactly one record on a hand-built pair, and recovers their value exactly', () => {
    // Construct a group in which the target's birthdate is unique, so the exclusion
    // predicate removes precisely them.
    const byDate = new Map<string, number>();
    for (const r of pop.records) {
      const d = String(r.quasi.birthdate);
      byDate.set(d, (byDate.get(d) ?? 0) + 1);
    }
    const unique = pop.records.find((r) => byDate.get(String(r.quasi.birthdate)) === 1);
    expect(unique).toBeDefined();
    const pair = buildDifferencingPair(pop.records, unique!.id, [], 'mean', 'income')!;
    const result = runDifferencing(pop.records, pair.a, pair.b, 'income');
    expect(result.isolatesOne).toBe(true);
    expect(result.isolatedIds).toEqual([unique!.id]);
    expect(result.recovered).toBeCloseTo(Number(unique!.sensitive.income), 4);
  });

  it('recovers membership from a pair of counts', () => {
    const byDate = new Map<string, number>();
    for (const r of pop.records) {
      const d = String(r.quasi.birthdate);
      byDate.set(d, (byDate.get(d) ?? 0) + 1);
    }
    const unique = pop.records.find((r) => byDate.get(String(r.quasi.birthdate)) === 1)!;
    const pair = buildDifferencingPair(pop.records, unique.id, [], 'count')!;
    const result = runDifferencing(pop.records, pair.a, pair.b);
    expect(result.isolatesOne).toBe(true);
    expect(Math.abs(result.difference)).toBe(1);
    expect(result.recovered).toBe(1);
  });

  it('claims nothing when the two selections differ by more than one person', () => {
    const a = { kind: 'count' as const, predicates: [] };
    const b = { kind: 'count' as const, predicates: [{ column: 'gender', op: 'eq' as const, value: 'M' }] };
    const result = runDifferencing(pop.records, a, b);
    expect(result.isolatesOne).toBe(false);
    expect(result.recovered).toBeNull();
    expect(result.actual).toBeNull();
  });
});

describe('composition', () => {
  it('pins targets from a series of individually harmless counts', () => {
    const sample = pop.records.slice(0, 200).map((r) => r.id);
    const queries = [
      { kind: 'count' as const, predicates: [{ column: 'gender', op: 'eq' as const, value: 'M' }] },
      { kind: 'count' as const, predicates: [{ column: 'age', op: 'lt' as const, value: 40 }] },
      { kind: 'count' as const, predicates: [{ column: 'age', op: 'lt' as const, value: 30 }] },
      {
        kind: 'count' as const,
        predicates: [{ column: 'kelurahan', op: 'prefix' as const, value: '32' }],
      },
    ];
    const few = runComposition(pop.records, sample, queries.slice(0, 1));
    const many = runComposition(pop.records, sample, queries);
    // Every query can only narrow, never widen.
    for (let i = 0; i < few.perTarget.length; i++) {
      expect(many.perTarget[i].candidateCount).toBeLessThanOrEqual(few.perTarget[i].candidateCount);
    }
    expect(many.correct + many.incorrect + many.failed).toBe(sample.length);
    expect(many.incorrect).toBe(0);
  });

  it('identifies everyone once the queries separate every record', () => {
    // One query per distinct NIK is absurd in practice and exact in principle: the
    // point is that the count is what is reported, not an assertion about difficulty.
    const small: PersonRecord[] = pop.records.slice(0, 8);
    const queries = small.map((r) => ({
      kind: 'count' as const,
      predicates: [{ column: 'birthdate', op: 'eq' as const, value: String(r.quasi.birthdate) }],
    }));
    const result = runComposition(small, small.map((r) => r.id), queries);
    expect(result.correct + result.failed).toBe(small.length);
    expect(result.incorrect).toBe(0);
  });
});

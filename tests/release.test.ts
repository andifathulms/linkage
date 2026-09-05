/**
 * The release and the population it was drawn from.
 *
 * The claim being tested is the one the finding rests on: a row alone in a sampled
 * release is not the same thing as a row that can be named, and the two only coincide
 * when the release is the whole population.
 *
 * The hand-built fixture comes first, because the arithmetic has to be checkable by a
 * reader rather than only by a generator.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { generalisePopulation, QUASI_COLUMNS } from '../src/engine/generalise';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { sampleRelease, measureRelease } from '../src/engine/release';

describe('measuring a release by hand', () => {
  // Six people. Three share a key, two share another, one is genuinely unique.
  const keys = ['a', 'a', 'a', 'b', 'b', 'c'];

  it('reads a full release exactly as k does today', () => {
    const all = [0, 1, 2, 3, 4, 5];
    const risk = measureRelease(keys, all);
    expect(risk.released).toBe(6);
    expect(risk.aloneInRelease).toBe(1);
    expect(risk.kRelease).toBe(1);
    expect(risk.nameableInPopulation).toBe(1);
    expect(risk.kPopulation).toBe(1);
    // Nobody can be alone in the release yet hidden in the population when the release
    // is the population. This is the identity the whole module turns on.
    expect(risk.aloneButNotNameable).toBe(0);
    expect(risk.widestHidingPlace).toBe(0);
  });

  it('separates alone from nameable once the release is a sample', () => {
    // One of the three 'a' people and one of the two 'b' people. Both stand alone in the
    // release. Neither can be named: two other 'a's and one other 'b' were not sampled.
    const risk = measureRelease(keys, [0, 3]);
    expect(risk.released).toBe(2);
    expect(risk.aloneInRelease).toBe(2);
    expect(risk.kRelease).toBe(1);
    expect(risk.nameableInPopulation).toBe(0);
    expect(risk.kPopulation).toBe(2);
    expect(risk.aloneButNotNameable).toBe(2);
    // The 'a' key is held by three people, which is the widest place to hide here.
    expect(risk.widestHidingPlace).toBe(3);
  });

  it('reports the one row that really can be named', () => {
    const risk = measureRelease(keys, [0, 5]);
    expect(risk.aloneInRelease).toBe(2);
    expect(risk.nameableInPopulation).toBe(1);
    expect(risk.aloneButNotNameable).toBe(1);
  });

  it('handles an empty release without inventing a k', () => {
    const risk = measureRelease(keys, []);
    expect(risk.released).toBe(0);
    expect(risk.kRelease).toBe(0);
    expect(risk.kPopulation).toBe(0);
    expect(risk.aloneInRelease).toBe(0);
  });
});

describe('measuring a release of a generated population', () => {
  const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 6000, seed: 31 });
  const hc = hierarchyCardinalities(pop.hierarchy);
  const tax = buildTaxonomy({
    ...hc,
    birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
    months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
    years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
    ages: new Set(pop.records.map((r) => r.quasi.age)).size,
  });
  // Generalised hard, so that a full release is genuinely safe and only sampling can
  // make it look otherwise. At raw precision everyone is unique and there is nothing
  // to see.
  const keys = generalisePopulation(
    pop.records,
    tax,
    { kelurahan: 2, birthdate: 4, gender: 0, age: 4 },
    QUASI_COLUMNS,
  );

  it('draws a release of about the requested share, reproducibly', () => {
    const a = sampleRelease(pop.records, 0.1, 5);
    const b = sampleRelease(pop.records, 0.1, 5);
    expect(a.indices).toEqual(b.indices);
    expect(a.released).toBeGreaterThan(500);
    expect(a.released).toBeLessThan(700);
    expect(sampleRelease(pop.records, 0.1, 6).indices).not.toEqual(a.indices);
  });

  it('takes everyone at fraction 1 and nobody at 0', () => {
    expect(sampleRelease(pop.records, 1, 5).released).toBe(pop.records.length);
    expect(sampleRelease(pop.records, 0, 5).released).toBe(0);
  });

  it('never reports more nameable rows than rows standing alone in the population', () => {
    // A row's population class cannot shrink by sampling, so nameability is decided
    // entirely by the population and sampling can only hide it.
    const full = measureRelease(keys, sampleRelease(pop.records, 1, 5).indices);
    const sampled = measureRelease(keys, sampleRelease(pop.records, 0.2, 5).indices);
    expect(sampled.nameableInPopulation).toBeLessThanOrEqual(full.nameableInPopulation);
  });

  it('shows the release looking riskier than it is', () => {
    // The finding. The full release is comfortably above k = 5, so a steward publishing
    // all of it is safe. Sample it, and the release's own k collapses to 1 while not one
    // additional person becomes nameable.
    const full = measureRelease(keys, sampleRelease(pop.records, 1, 5).indices);
    const sampled = measureRelease(keys, sampleRelease(pop.records, 0.05, 5).indices);

    expect(full.kRelease).toBeGreaterThanOrEqual(5);
    expect(sampled.kRelease).toBe(1);
    expect(sampled.aloneInRelease).toBeGreaterThan(0);
    expect(sampled.nameableInPopulation).toBe(0);
    expect(sampled.aloneButNotNameable).toBe(sampled.aloneInRelease);
    expect(sampled.widestHidingPlace).toBeGreaterThanOrEqual(5);
  });
});

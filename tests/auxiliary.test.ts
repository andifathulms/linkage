/**
 * The attacker's roll, degraded.
 *
 * What has to hold: a perfect roll reproduces exactly what the app does today, so no
 * existing figure moves; degradation is monotone, so the curve a reader is shown is a
 * curve rather than noise; and everything is reproducible from the seed (CLAUDE.md §3).
 *
 * The scored result is checked through `runLinkage` rather than by inspecting keys,
 * because the claim being made is about identifications, not about strings.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { generalisePopulation, QUASI_COLUMNS, zeroVector } from '../src/engine/generalise';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { degradeRoll, ABSENT_FROM_ROLL } from '../src/engine/attacks/auxiliary';
import { runLinkage } from '../src/engine/attacks/linkage';

const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 3000, seed: 21 });
const hc = hierarchyCardinalities(pop.hierarchy);
const tax = buildTaxonomy({
  ...hc,
  birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
  months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
  years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
  ages: new Set(pop.records.map((r) => r.quasi.age)).size,
});
const keys = generalisePopulation(pop.records, tax, zeroVector(QUASI_COLUMNS), QUASI_COLUMNS);
const targets = pop.records.slice(0, 500).map((r) => r.id);

function score(auxiliary: readonly string[]) {
  return runLinkage(pop.records, keys, auxiliary, { columns: [...QUASI_COLUMNS], targetIds: targets });
}

describe('the attacker roll', () => {
  it('reproduces the perfect-roll result at full coverage and no error', () => {
    // The regression guard for every figure already in the app: passing the same keys
    // twice is the current behaviour, and a perfect degraded roll must be identical.
    const perfect = degradeRoll(keys, { coverage: 1, errorRate: 0, seed: 7 });
    expect(perfect.keys).toEqual([...keys]);
    expect(perfect.listed).toBe(pop.records.length);
    expect(perfect.wrong).toBe(0);
    expect(score(perfect.keys).correct).toBe(score(keys).correct);
  });

  it('lists nobody at zero coverage, and identifies nobody', () => {
    const none = degradeRoll(keys, { coverage: 0, errorRate: 0, seed: 7 });
    expect(none.listed).toBe(0);
    expect(none.keys.every((k) => k === ABSENT_FROM_ROLL)).toBe(true);

    const result = score(none.keys);
    expect(result.correct).toBe(0);
    // Attempted and failed, not silently dropped: a target the attacker cannot look up
    // is still a target they tried for (PRD §6.2).
    expect(result.attempted).toBe(targets.length);
    expect(result.failed).toBe(targets.length);
    expect(result.perTarget.every((t) => t.candidateCount === 0)).toBe(true);
  });

  it('identifies fewer people as coverage falls', () => {
    const at = (coverage: number) =>
      score(degradeRoll(keys, { coverage, errorRate: 0, seed: 7 }).keys).correct;
    const full = at(1);
    const most = at(0.75);
    const half = at(0.5);
    const few = at(0.25);
    expect(full).toBeGreaterThan(most);
    expect(most).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(few);
  });

  it('identifies fewer people as the roll gets more wrong', () => {
    const at = (errorRate: number) =>
      score(degradeRoll(keys, { coverage: 1, errorRate, seed: 7 }).keys).correct;
    expect(at(0)).toBeGreaterThan(at(0.3));
    expect(at(0.3)).toBeGreaterThan(at(0.8));
  });

  it('counts a record as wrong only when its key actually changed', () => {
    // A donor who happens to share the value leaves the key intact. Counting that as an
    // error would make the readout disagree with the join.
    const roll = degradeRoll(keys, { coverage: 1, errorRate: 1, seed: 3 });
    let changed = 0;
    for (let i = 0; i < keys.length; i++) if (roll.keys[i] !== keys[i]) changed += 1;
    expect(roll.wrong).toBe(changed);
    expect(roll.wrong).toBeLessThanOrEqual(roll.listed);
  });

  it('is reproducible from the seed, and different across seeds', () => {
    const a = degradeRoll(keys, { coverage: 0.6, errorRate: 0.2, seed: 99 });
    const b = degradeRoll(keys, { coverage: 0.6, errorRate: 0.2, seed: 99 });
    const c = degradeRoll(keys, { coverage: 0.6, errorRate: 0.2, seed: 100 });
    expect(a.keys).toEqual(b.keys);
    expect(a.listed).toBe(b.listed);
    expect(c.keys).not.toEqual(a.keys);
  });

  it('carries its denominators', () => {
    const roll = degradeRoll(keys, { coverage: 0.5, errorRate: 0.5, seed: 12 });
    expect(roll.population).toBe(pop.records.length);
    expect(roll.listed).toBeLessThanOrEqual(roll.population);
    expect(roll.wrong).toBeLessThanOrEqual(roll.listed);
  });

  it('gives an absent record a key no released row can carry', () => {
    expect(keys.some((k) => k === ABSENT_FROM_ROLL)).toBe(false);
  });
});

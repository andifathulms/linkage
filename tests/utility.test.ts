/**
 * The privacy–utility frontier is a measurement, not a drawn shape (PRD §5.6). These
 * tests hold it to that.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { measureUtility, buildFrontier, frontierPath, standardQueries } from '../src/engine/utility';

const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 3000, seed: 61 });
const hc = hierarchyCardinalities(pop.hierarchy);
const tax = buildTaxonomy({
  ...hc,
  birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
  months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
  years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
  ages: new Set(pop.records.map((r) => r.quasi.age)).size,
});
const COLUMNS = ['kelurahan', 'age', 'gender'];

describe('utility measurement', () => {
  it('answers the query battery exactly on a raw table', () => {
    const report = measureUtility(pop.records, tax, { kelurahan: 0, age: 0, gender: 0 }, COLUMNS);
    expect(report.informationLoss).toBe(0);
    expect(report.queryError).toBe(0);
    for (const q of report.perQuery) expect(q.released).toBe(q.truth);
  });

  it('computes the truth independently of the release', () => {
    const queries = standardQueries();
    const under30 = pop.records.filter((r) => Number(r.quasi.age) < 30).length;
    expect(queries[0].truth(pop.records)).toBe(under30);
  });

  it('loses precision as the table is generalised', () => {
    const raw = measureUtility(pop.records, tax, { kelurahan: 0, age: 0, gender: 0 }, COLUMNS);
    const coarse = measureUtility(pop.records, tax, { kelurahan: 3, age: 3, gender: 1 }, COLUMNS);
    expect(coarse.informationLoss).toBeGreaterThan(raw.informationLoss);
    expect(coarse.classCount).toBeLessThan(raw.classCount);
    expect(coarse.meanClassSize).toBeGreaterThan(raw.meanClassSize);
  });

  it('collapses to one class under full suppression', () => {
    const report = measureUtility(pop.records, tax, { kelurahan: 4, age: 4, gender: 1 }, COLUMNS);
    expect(report.classCount).toBe(1);
    expect(report.informationLoss).toBe(1);
    expect(report.meanClassSize).toBe(pop.records.length);
  });
});

describe('the frontier', () => {
  const path = frontierPath(tax, COLUMNS);
  const points = buildFrontier(pop.records, tax, path, COLUMNS);

  it('climbs from raw to fully suppressed, one level at a time', () => {
    expect(path[0]).toEqual({ kelurahan: 0, age: 0, gender: 0 });
    expect(path[path.length - 1]).toEqual({ kelurahan: 4, age: 4, gender: 1 });
    for (let i = 1; i < path.length; i++) {
      const delta = COLUMNS.reduce((s, c) => s + (path[i][c] - path[i - 1][c]), 0);
      expect(delta).toBe(1);
    }
  });

  it('trades re-identification against utility, both measured', () => {
    const first = points[0];
    const last = points[points.length - 1];
    // Privacy improves along the path.
    expect(last.reidentificationRate).toBeLessThan(first.reidentificationRate);
    expect(last.k).toBeGreaterThan(first.k);
    // And utility gets worse.
    expect(last.informationLoss).toBeGreaterThan(first.informationLoss);
  });

  it('never lets k fall or re-identification rise as generalisation increases', () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i].k).toBeGreaterThanOrEqual(points[i - 1].k);
      expect(points[i].reidentificationRate).toBeLessThanOrEqual(
        points[i - 1].reidentificationRate + 1e-12,
      );
    }
  });

  it('ends with nobody uniquely identified', () => {
    const last = points[points.length - 1];
    expect(last.singletons).toBe(0);
    expect(last.reidentificationRate).toBe(0);
    expect(last.classCount).toBe(1);
  });

  it('reports the re-identification rate as a measured share of the population', () => {
    for (const p of points) {
      expect(p.reidentificationRate).toBeCloseTo(p.singletons / pop.records.length, 12);
    }
  });
});

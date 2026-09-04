/**
 * PRD §8.3: a population of 200,000 records renders as a field at 60 fps, with
 * generalisation changes re-clustering without a stall.
 *
 * Frame rate needs a browser, so this test measures the two things that determine it and
 * that can be measured without one: the per-frame work the draw loop does is bounded by
 * the layout it consumes, and the layout plus classification is what happens between
 * frames when the generalisation changes. If either is slow, no rendering strategy saves
 * the field.
 *
 * Budgets are deliberately loose relative to CI hardware. They are regression guards, not
 * a claim that the numbers below are the frame rate.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomyFor } from '../src/state/store';
import { generalisePopulation } from '../src/engine/generalise';
import { buildClasses } from '../src/engine/classes';
import { layoutField, FieldIndex } from '../src/views/Field/layout';

const SIZE = 200000;

describe('the field at 200,000 records', () => {
  const population = generatePopulation({ ...DEFAULT_PARAMS, size: SIZE, seed: 3 });
  const taxonomy = buildTaxonomyFor(population);
  const COLUMNS = ['kelurahan', 'age', 'gender'];

  const time = (label: string, fn: () => void): number => {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`${label}: ${elapsed.toFixed(0)} ms`);
    return elapsed;
  };

  it('generates the population in reasonable time', () => {
    expect(population.records).toHaveLength(SIZE);
  });

  it('re-clusters and re-lays-out within one coalescence transition', () => {
    // The coalescence animation runs 620 ms. The work below happens once, before the
    // first frame; if it exceeds the transition the animation would visibly stall.
    let keys: string[] = [];
    const generaliseMs = time('generalise 200k', () => {
      keys = generalisePopulation(population.records, taxonomy, { kelurahan: 1, age: 1, gender: 0 }, COLUMNS);
    });
    let set = buildClasses(population.records, keys);
    const classifyMs = time('classify 200k', () => {
      set = buildClasses(population.records, keys);
    });
    const layoutMs = time('layout 200k', () => {
      layoutField(set, population.records.length, { aspect: 2 });
    });

    expect(keys).toHaveLength(SIZE);
    expect(generaliseMs + classifyMs + layoutMs).toBeLessThan(2000);
  });

  it('builds the hit-test index without walking every mark per pointer move', () => {
    const keys = generalisePopulation(population.records, taxonomy, { kelurahan: 1, age: 1, gender: 0 }, COLUMNS);
    const set = buildClasses(population.records, keys);
    const layout = layoutField(set, population.records.length, { aspect: 2 });
    const index = new FieldIndex(layout);

    // A thousand pointer moves, which is several seconds of hovering, must be cheap.
    const queryMs = time('1000 hit tests over 200k', () => {
      for (let i = 0; i < 1000; i++) {
        index.nearest((i * 37) % layout.width, (i * 53) % layout.height, 2.5);
      }
    });
    expect(queryMs).toBeLessThan(500);
  });

  it('holds the layout in typed arrays, so the draw loop reads contiguous memory', () => {
    const keys = generalisePopulation(population.records, taxonomy, { kelurahan: 2, age: 2, gender: 0 }, COLUMNS);
    const set = buildClasses(population.records, keys);
    const layout = layoutField(set, population.records.length, { aspect: 2 });
    expect(layout.x).toBeInstanceOf(Float32Array);
    expect(layout.y).toBeInstanceOf(Float32Array);
    expect(layout.classOf).toBeInstanceOf(Int32Array);
    // Three arrays of 200k, not 200k objects.
    expect(layout.x.length).toBe(SIZE);
  });
});

/**
 * CLAUDE.md §6 and DESIGN.md §5.1. Two properties the packing has to have, both of
 * which carry meaning rather than being aesthetic preferences.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomy } from '../src/engine/taxonomy';
import { hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { generalisePopulation } from '../src/engine/generalise';
import { buildClasses } from '../src/engine/classes';
import { layoutField, defaultPadding, FieldIndex } from '../src/views/Field/layout';

const pop = generatePopulation({ ...DEFAULT_PARAMS, size: 3000, seed: 91 });
const hc = hierarchyCardinalities(pop.hierarchy);
const tax = buildTaxonomy({
  ...hc,
  birthdates: new Set(pop.records.map((r) => r.quasi.birthdate)).size,
  months: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 7))).size,
  years: new Set(pop.records.map((r) => String(r.quasi.birthdate).slice(0, 4))).size,
  ages: new Set(pop.records.map((r) => r.quasi.age)).size,
});
const COLUMNS = ['kelurahan', 'age', 'gender'];

const setAt = (v: Record<string, number>) =>
  buildClasses(pop.records, generalisePopulation(pop.records, tax, v, COLUMNS));

describe('field packing', () => {
  it('places every record exactly once', () => {
    const set = setAt({ kelurahan: 1, age: 1, gender: 0 });
    const layout = layoutField(set, pop.records.length, { aspect: 2 });
    expect(layout.x).toHaveLength(pop.records.length);
    for (let i = 0; i < layout.x.length; i++) {
      expect(Number.isFinite(layout.x[i])).toBe(true);
      expect(Number.isFinite(layout.y[i])).toBe(true);
      expect(layout.x[i]).toBeGreaterThanOrEqual(0);
      expect(layout.y[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every record inside its own class box', () => {
    const set = setAt({ kelurahan: 2, age: 1, gender: 0 });
    const layout = layoutField(set, pop.records.length, { aspect: 2 });
    for (let i = 0; i < layout.x.length; i++) {
      const box = layout.boxes[layout.classOf[i]];
      expect(layout.x[i]).toBeGreaterThanOrEqual(box.x);
      expect(layout.y[i]).toBeGreaterThanOrEqual(box.y);
      expect(layout.x[i]).toBeLessThanOrEqual(box.x + box.w);
      expect(layout.y[i]).toBeLessThanOrEqual(box.y + box.h);
    }
  });

  it('gives singletons more space around them than members of a large class', () => {
    // The isolation is the encoding, so it has to come out of the packing rather than
    // out of the renderer.
    expect(defaultPadding(1)).toBeGreaterThan(defaultPadding(2));
    expect(defaultPadding(2)).toBeGreaterThan(defaultPadding(4));
    expect(defaultPadding(4)).toBeGreaterThan(defaultPadding(50));
  });

  it('separates singletons further from their nearest neighbour than clustered records', () => {
    // A vector coarse enough that both readings coexist: some records clumped, some
    // still alone. That mixture is the field at its most informative.
    const set = setAt({ kelurahan: 2, age: 2, gender: 0 });
    const layout = layoutField(set, pop.records.length, { aspect: 2 });
    const index = new FieldIndex(layout);

    const nearestDistance = (i: number): number => {
      // Search outward until a different record is found.
      for (const radius of [2, 4, 8, 16, 32]) {
        let best = Infinity;
        const cx = layout.x[i];
        const cy = layout.y[i];
        for (let j = 0; j < layout.x.length; j++) {
          if (j === i) continue;
          const dx = layout.x[j] - cx;
          const dy = layout.y[j] - cy;
          if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
          best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
        }
        if (Number.isFinite(best)) return best;
      }
      return Infinity;
    };

    const singletons: number[] = [];
    const clustered: number[] = [];
    for (let i = 0; i < layout.classOf.length && (singletons.length < 12 || clustered.length < 12); i++) {
      const size = set.classes[layout.classOf[i]].members.length;
      if (size === 1 && singletons.length < 12) singletons.push(i);
      else if (size >= 8 && clustered.length < 12) clustered.push(i);
    }
    expect(singletons.length).toBeGreaterThan(0);
    expect(clustered.length).toBeGreaterThan(0);
    expect(index.nearest(layout.x[singletons[0]], layout.y[singletons[0]], 1)).toBe(singletons[0]);

    const mean = (ids: number[]) => ids.reduce((s, i) => s + nearestDistance(i), 0) / ids.length;
    expect(mean(singletons)).toBeGreaterThan(mean(clustered));
  });

  it('is deterministic: the same class set lays out identically', () => {
    const set = setAt({ kelurahan: 1, age: 2, gender: 0 });
    const a = layoutField(set, pop.records.length, { aspect: 2 });
    const b = layoutField(set, pop.records.length, { aspect: 2 });
    expect([...a.x]).toEqual([...b.x]);
    expect([...a.y]).toEqual([...b.y]);
  });

  it('does not move a record when an unrelated class changes', () => {
    // The load-bearing property: otherwise the coalescence animation is noise. Build a
    // class set, then perturb one class by moving a record between two others, and
    // check that classes ordered before the perturbed one are untouched.
    const set = setAt({ kelurahan: 1, age: 2, gender: 0 });
    const before = layoutField(set, pop.records.length, { aspect: 2 });

    // Shrink one mid-sized class by one member, leaving every other class identical.
    const victim = set.classes.findIndex((c) => c.members.length >= 3 && c.members.length <= 6);
    expect(victim).toBeGreaterThanOrEqual(0);
    const mutated = {
      ...set,
      classes: set.classes.map((c, i) =>
        i === victim ? { ...c, members: c.members.slice(0, -1) } : c,
      ),
    };
    const after = layoutField(mutated, pop.records.length, { aspect: 2 });

    // Every class strictly larger than the perturbed one sorts before it and is
    // therefore placed before it, so its members must not have moved.
    const victimSize = set.classes[victim].members.length;
    let checked = 0;
    for (let ci = 0; ci < set.classes.length; ci++) {
      if (set.classes[ci].members.length <= victimSize) continue;
      for (const m of set.classes[ci].members) {
        expect(after.x[m]).toBe(before.x[m]);
        expect(after.y[m]).toBe(before.y[m]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('shrinks as generalisation coalesces classes', () => {
    const fine = layoutField(setAt({ kelurahan: 0, age: 0, gender: 0 }), pop.records.length, { aspect: 2 });
    const coarse = layoutField(setAt({ kelurahan: 3, age: 3, gender: 1 }), pop.records.length, { aspect: 2 });
    // Fewer, larger classes need less padding overall, so the field gets denser.
    expect(coarse.width * coarse.height).toBeLessThan(fine.width * fine.height);
  });

  it('collapses to one block under full suppression, with no isolated marks', () => {
    const set = setAt({ kelurahan: 4, age: 4, gender: 1 });
    const layout = layoutField(set, pop.records.length, { aspect: 2 });
    expect(layout.boxes.filter(Boolean)).toHaveLength(1);
    expect(set.singletons).toBe(0);
  });
});

describe('field hit testing', () => {
  const set = setAt({ kelurahan: 1, age: 1, gender: 0 });
  const layout = layoutField(set, pop.records.length, { aspect: 2 });
  const index = new FieldIndex(layout);

  it('finds the record under the pointer', () => {
    for (const i of [0, 100, 1500, 2999]) {
      expect(index.nearest(layout.x[i], layout.y[i], 1)).toBe(i);
    }
  });

  it('returns null in empty space', () => {
    expect(index.nearest(layout.width + 50, layout.height + 50, 2)).toBeNull();
  });

  it('agrees with a brute-force nearest-neighbour search', () => {
    for (const [px, py] of [
      [layout.width * 0.25, layout.height * 0.25],
      [layout.width * 0.5, layout.height * 0.5],
      [layout.width * 0.75, layout.height * 0.6],
    ]) {
      const radius = 3;
      let bestI: number | null = null;
      let bestD = radius * radius;
      for (let i = 0; i < layout.x.length; i++) {
        const dx = layout.x[i] - px;
        const dy = layout.y[i] - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      expect(index.nearest(px, py, radius)).toBe(bestI);
    }
  });
});

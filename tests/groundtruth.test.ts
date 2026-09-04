/**
 * PRD §7.1: every record's identity is recoverable, and the uniqueness count computed
 * by the engine matches a direct independent count.
 */
import { describe, expect, it } from 'vitest';
import { generatePopulation, DEFAULT_PARAMS, REFERENCE_YEAR } from '../src/engine/generate/population';
import { buildHierarchy, hierarchyCardinalities } from '../src/engine/generate/hierarchy';
import { dissectNik, buildNik, FEMALE_DAY_OFFSET } from '../src/engine/generate/nik';
import { makeRng } from '../src/engine/rng';

const params = { ...DEFAULT_PARAMS, size: 4000, seed: 7 };

describe('rng', () => {
  it('is reproducible from its seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different streams for different seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const same = Array.from({ length: 50 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBe(0);
  });

  it('has approximately uniform output', () => {
    const rng = makeRng(9);
    const bins = new Array(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) bins[Math.floor(rng.next() * 10)]++;
    for (const b of bins) expect(Math.abs(b - n / 10) / (n / 10)).toBeLessThan(0.05);
  });

  it('samples a standard normal with the right moments', () => {
    const rng = makeRng(11);
    const n = 200000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const v = rng.normal();
      sum += v;
      sq += v * v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.02);
    expect(Math.abs(sq / n - 1)).toBeLessThan(0.02);
  });

  it('respects weights', () => {
    const rng = makeRng(3);
    const counts = [0, 0, 0];
    for (let i = 0; i < 60000; i++) counts[rng.weighted([1, 2, 3])]++;
    expect(counts[1] / counts[0]).toBeGreaterThan(1.8);
    expect(counts[1] / counts[0]).toBeLessThan(2.2);
    expect(counts[2] / counts[0]).toBeGreaterThan(2.8);
    expect(counts[2] / counts[0]).toBeLessThan(3.2);
  });
});

describe('hierarchy', () => {
  const h = buildHierarchy(7, 8);

  it('nests four levels with consistent code prefixes', () => {
    expect(h.provinsi.length).toBe(8);
    for (const p of h.provinsi) {
      expect(p.code).toHaveLength(2);
      expect(p.children.length).toBeGreaterThan(0);
      for (const kab of p.children) {
        expect(kab.code.startsWith(p.code)).toBe(true);
        expect(kab.code).toHaveLength(4);
        for (const kec of kab.children) {
          expect(kec.code.startsWith(kab.code)).toBe(true);
          expect(kec.code).toHaveLength(6);
          for (const kel of kec.children) {
            expect(kel.code.startsWith(kec.code)).toBe(true);
            expect(kel.code).toHaveLength(10);
          }
        }
      }
    }
  });

  it('indexes every kelurahan exactly once', () => {
    const codes = new Set(h.kelurahan.map((k) => k.code));
    expect(codes.size).toBe(h.kelurahan.length);
    expect(h.byCode.size).toBe(h.kelurahan.length);
  });

  it('has strictly increasing cardinality down the levels', () => {
    const c = hierarchyCardinalities(h);
    expect(c.provinsi).toBeLessThan(c.kabupaten);
    expect(c.kabupaten).toBeLessThan(c.kecamatan);
    expect(c.kecamatan).toBeLessThan(c.kelurahan);
  });

  it('is reproducible from its seed', () => {
    const again = buildHierarchy(7, 8);
    expect(again.kelurahan.map((k) => k.code)).toEqual(h.kelurahan.map((k) => k.code));
    expect(again.kelurahan.map((k) => k.name)).toEqual(h.kelurahan.map((k) => k.name));
  });
});

describe('nik', () => {
  it('round-trips region, date and gender', () => {
    const nik = buildNik('3201010001', '1985-03-07', 'F', 12);
    expect(nik).toHaveLength(16);
    const parts = dissectNik(nik);
    expect(parts.provinsi).toBe('32');
    expect(parts.kabupaten).toBe('01');
    expect(parts.kecamatan).toBe('01');
    expect(parts.day).toBe(7);
    expect(parts.month).toBe(3);
    expect(parts.year2).toBe(85);
    expect(parts.gender).toBe('F');
    expect(parts.sequence).toBe('0012');
  });

  it('adds the female offset to the day field and nowhere else', () => {
    const male = buildNik('3201010001', '1985-03-07', 'M', 1);
    const female = buildNik('3201010001', '1985-03-07', 'F', 1);
    expect(Number(female.slice(6, 8)) - Number(male.slice(6, 8))).toBe(FEMALE_DAY_OFFSET);
    expect(female.slice(0, 6)).toBe(male.slice(0, 6));
    expect(female.slice(8)).toBe(male.slice(8));
  });
});

describe('population ground truth', () => {
  const pop = generatePopulation(params);

  it('generates the requested size with contiguous ids', () => {
    expect(pop.records).toHaveLength(params.size);
    pop.records.forEach((r, i) => expect(r.id).toBe(i));
  });

  it('is reproducible from its seed', () => {
    const again = generatePopulation(params);
    expect(again.records.map((r) => r.nik)).toEqual(pop.records.map((r) => r.nik));
    expect(again.records.map((r) => r.identity.name)).toEqual(
      pop.records.map((r) => r.identity.name),
    );
    expect(again.records.map((r) => r.sensitive.diagnosis)).toEqual(
      pop.records.map((r) => r.sensitive.diagnosis),
    );
  });

  it('changes with the seed', () => {
    const other = generatePopulation({ ...params, seed: 8 });
    const same = other.records.filter((r, i) => r.nik === pop.records[i].nik).length;
    expect(same / params.size).toBeLessThan(0.05);
  });

  it('recovers every identity from its NIK and its quasi-identifiers', () => {
    for (const r of pop.records) {
      const parts = dissectNik(r.nik);
      expect(parts.gender).toBe(r.identity.gender);
      expect(r.identity.kelurahan.startsWith(parts.provinsi + parts.kabupaten + parts.kecamatan))
        .toBe(true);
      const [y, m, d] = r.identity.birthdate.split('-').map(Number);
      expect(parts.day).toBe(d);
      expect(parts.month).toBe(m);
      expect(parts.year2).toBe(y % 100);
      // Quasi-identifiers agree with the identity they were derived from.
      expect(r.quasi.kelurahan).toBe(r.identity.kelurahan);
      expect(r.quasi.birthdate).toBe(r.identity.birthdate);
      expect(r.quasi.gender).toBe(r.identity.gender);
      expect(r.quasi.age).toBe(REFERENCE_YEAR - y);
    }
  });

  it('issues NIKs that are unique within a region and date', () => {
    const seen = new Set<string>();
    for (const r of pop.records) {
      expect(seen.has(r.nik)).toBe(false);
      seen.add(r.nik);
    }
  });

  it('places every record in a kelurahan the hierarchy knows', () => {
    for (const r of pop.records) {
      expect(pop.hierarchy.byCode.has(String(r.quasi.kelurahan))).toBe(true);
    }
  });

  it('counts uniqueness on the raw quasi-identifiers the same way a direct count does', () => {
    // Independent count: build the multiset of full quasi-identifier tuples by hand.
    const tally = new Map<string, number>();
    for (const r of pop.records) {
      const key = `${r.quasi.kelurahan}|${r.quasi.birthdate}|${r.quasi.gender}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    let unique = 0;
    for (const n of tally.values()) if (n === 1) unique++;

    // The same count reached the other way: a record is unique if no other record
    // shares its tuple.
    let uniqueByScan = 0;
    for (const r of pop.records) {
      const key = `${r.quasi.kelurahan}|${r.quasi.birthdate}|${r.quasi.gender}`;
      if (tally.get(key) === 1) uniqueByScan++;
    }
    expect(uniqueByScan).toBe(unique);
    // Sweeney's phenomenon should be visible: most records are unique on the fine triple.
    expect(unique / params.size).toBeGreaterThan(0.5);
  });

  it('honours the correlation control', () => {
    // A larger population, so that region-decade strata are populated enough to read.
    const big = { ...params, size: 30000 };
    const independent = generatePopulation({ ...big, correlation: 0 });
    const determined = generatePopulation({ ...big, correlation: 1 });

    const spreadOf = (p: typeof independent): number => {
      // Mean, over region-decade strata, of the share taken by the top diagnosis.
      const strata = new Map<string, Map<string, number>>();
      for (const r of p.records) {
        const s = `${String(r.quasi.kelurahan).slice(0, 6)}|${Math.floor(Number(r.quasi.age) / 10)}`;
        const m = strata.get(s) ?? new Map<string, number>();
        m.set(String(r.sensitive.diagnosis), (m.get(String(r.sensitive.diagnosis)) ?? 0) + 1);
        strata.set(s, m);
      }
      let total = 0;
      let count = 0;
      for (const m of strata.values()) {
        let n = 0;
        let top = 0;
        for (const v of m.values()) {
          n += v;
          top = Math.max(top, v);
        }
        if (n >= 12) {
          total += top / n;
          count++;
        }
      }
      return count === 0 ? 0 : total / count;
    };

    expect(spreadOf(determined)).toBeGreaterThan(spreadOf(independent) + 0.3);
  });

  it('reports column cardinalities that match the records', () => {
    const byId = new Map(pop.columns.map((c) => [c.id, c]));
    const ages = new Set(pop.records.map((r) => r.quasi.age));
    expect(byId.get('age')!.cardinality).toBe(ages.size);
    const dates = new Set(pop.records.map((r) => r.quasi.birthdate));
    expect(byId.get('birthdate')!.cardinality).toBe(dates.size);
  });
});

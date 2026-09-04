/**
 * Generalisation hierarchies per column (PRD §4.3).
 *
 * A taxonomy is a ladder of levels. Level 0 is the raw value; each level above maps a
 * value to a coarser one, and the top level maps everything to a single suppressed
 * value. Suppression is the top of the ladder rather than a separate mechanism, which
 * keeps the lattice search (§5.3) a search over one product space.
 */
import type { ColumnId, Value } from './types';

export interface TaxonomyLevel {
  label: string;
  /** Map a raw value to its representation at this level. */
  map: (raw: Value) => Value;
  /** Distinct values at this level, for the assessor and for information loss. */
  cardinality: number;
}

export interface ColumnTaxonomy {
  column: ColumnId;
  label: string;
  levels: TaxonomyLevel[];
}

export type Taxonomy = Record<ColumnId, ColumnTaxonomy>;

/** The value every column takes at its suppressed top level. */
export const SUPPRESSED = '*';

const identity = (v: Value): Value => v;

function prefix(n: number): (v: Value) => Value {
  return (v) => String(v).slice(0, n);
}

/** Five-year band, the coarsest age generalisation short of suppression. */
export function ageBand(raw: Value, width: number): Value {
  const a = Number(raw);
  const lo = Math.floor(a / width) * width;
  return `${lo}-${lo + width - 1}`;
}

export interface TaxonomyCardinalities {
  kelurahan: number;
  kecamatan: number;
  kabupaten: number;
  provinsi: number;
  birthdates: number;
  months: number;
  years: number;
  ages: number;
}

/**
 * Build the taxonomy for the standard column set. Cardinalities come from the
 * population rather than being assumed, because the risk figures depend on them and a
 * wrong count would make every downstream number quietly wrong.
 */
export function buildTaxonomy(c: TaxonomyCardinalities): Taxonomy {
  const kelurahan: ColumnTaxonomy = {
    column: 'kelurahan',
    label: 'Region',
    levels: [
      { label: 'Kelurahan', map: identity, cardinality: c.kelurahan },
      { label: 'Kecamatan', map: prefix(6), cardinality: c.kecamatan },
      { label: 'Kabupaten/kota', map: prefix(4), cardinality: c.kabupaten },
      { label: 'Provinsi', map: prefix(2), cardinality: c.provinsi },
      { label: 'Suppressed', map: () => SUPPRESSED, cardinality: 1 },
    ],
  };

  const birthdate: ColumnTaxonomy = {
    column: 'birthdate',
    label: 'Date of birth',
    levels: [
      { label: 'Full date', map: identity, cardinality: c.birthdates },
      { label: 'Month and year', map: prefix(7), cardinality: c.months },
      { label: 'Year', map: prefix(4), cardinality: c.years },
      {
        label: 'Five-year band',
        map: (v) => {
          const y = Number(String(v).slice(0, 4));
          const lo = Math.floor(y / 5) * 5;
          return `${lo}-${lo + 4}`;
        },
        cardinality: Math.max(1, Math.ceil(c.years / 5)),
      },
      { label: 'Suppressed', map: () => SUPPRESSED, cardinality: 1 },
    ],
  };

  const gender: ColumnTaxonomy = {
    column: 'gender',
    label: 'Gender',
    levels: [
      { label: 'Reported', map: identity, cardinality: 2 },
      { label: 'Suppressed', map: () => SUPPRESSED, cardinality: 1 },
    ],
  };

  const age: ColumnTaxonomy = {
    column: 'age',
    label: 'Age',
    levels: [
      { label: 'Exact', map: identity, cardinality: c.ages },
      { label: 'Five-year band', map: (v) => ageBand(v, 5), cardinality: Math.ceil(c.ages / 5) },
      { label: 'Ten-year band', map: (v) => ageBand(v, 10), cardinality: Math.ceil(c.ages / 10) },
      { label: 'Twenty-year band', map: (v) => ageBand(v, 20), cardinality: Math.ceil(c.ages / 20) },
      { label: 'Suppressed', map: () => SUPPRESSED, cardinality: 1 },
    ],
  };

  return { kelurahan, birthdate, gender, age };
}

/** The label a reader sees for a column at a given level. */
export function levelLabel(tax: Taxonomy, column: ColumnId, level: number): string {
  const t = tax[column];
  if (!t) return String(level);
  return t.levels[Math.min(level, t.levels.length - 1)].label;
}

export function maxLevel(tax: Taxonomy, column: ColumnId): number {
  return (tax[column]?.levels.length ?? 1) - 1;
}

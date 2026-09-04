/**
 * Core engine types. CLAUDE.md §1.
 *
 * One deviation from the sketch in CLAUDE.md §1: the record interface is named
 * `PersonRecord`, not `Record`, because `Record<K, V>` is the built-in utility type
 * the very same interface body uses for its quasi and sensitive maps. Shadowing it
 * would make the declaration refer to itself.
 */

export type ColumnId = string;

/** A cell value. Ordinal and numeric columns carry numbers; the rest carry strings. */
export type Value = string | number;

export type ColumnRole = 'identifier' | 'quasi' | 'sensitive' | 'other';
export type ColumnType = 'categorical' | 'ordinal' | 'date' | 'numeric';

export interface ColumnSpec {
  id: ColumnId;
  label: string;
  role: ColumnRole;
  type: ColumnType;
  /** Number of distinct values at taxonomy level 0. */
  cardinality: number;
}

/**
 * Ground truth (PRD §4.1). Visibly synthetic: names are assembled from a fragment
 * table, never sampled from a real roll (CLAUDE.md §2).
 */
export interface Identity {
  name: string;
  /** Kelurahan code — the finest administrative unit. */
  kelurahan: string;
  /** ISO date, YYYY-MM-DD. */
  birthdate: string;
  gender: 'M' | 'F';
}

export interface PersonRecord {
  /** Ground truth handle, never displayed as identity. */
  id: number;
  /** 16 digits, generated. */
  nik: string;
  /** The attack surface. */
  quasi: Record<ColumnId, Value>;
  sensitive: Record<ColumnId, Value>;
  identity: Identity;
}

/** provinsi → kabupaten/kota → kecamatan → kelurahan. */
export interface HierarchyNode {
  /** Concatenated numeric code: 2 digits per level. */
  code: string;
  name: string;
  /** Relative population weight. */
  weight: number;
  children: HierarchyNode[];
}

export interface Hierarchy {
  provinsi: HierarchyNode[];
  /** Flat index of every kelurahan, in generation order. */
  kelurahan: KelurahanRef[];
  byCode: Map<string, KelurahanRef>;
}

export interface KelurahanRef {
  /** 10-digit code: provinsi(2) kabupaten(2) kecamatan(2) kelurahan(4). */
  code: string;
  name: string;
  weight: number;
  provinsi: { code: string; name: string };
  kabupaten: { code: string; name: string };
  kecamatan: { code: string; name: string };
}

export interface GeneratorParams {
  seed: number;
  size: number;
  /** Provinsi count; kabupaten/kecamatan/kelurahan fan-out follows from it. */
  provinsiCount: number;
  /** Mean age in years. */
  meanAge: number;
  ageSpread: number;
  /**
   * 0 = sensitive value independent of quasi-identifiers.
   * 1 = sensitive value fully determined by region and age band.
   * Drives homogeneity and skewness, which is why it is a control (PRD §4.1).
   */
  correlation: number;
  /** Sensitive attribute values with base weights. */
  sensitiveValues: readonly string[];
  sensitiveWeights: readonly number[];
}

export interface Population {
  seed: number;
  params: GeneratorParams;
  records: PersonRecord[];
  hierarchy: Hierarchy;
  columns: ColumnSpec[];
}

export interface GeneralisationVector {
  [column: string]: number;
}

export interface EquivalenceClass {
  /** The generalised quasi-identifier. */
  key: string;
  /** Record ids. */
  members: number[];
  k: number;
  l: number;
  t: number;
  sensitiveDistribution: Map<Value, number>;
}

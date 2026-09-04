/**
 * Apply a generalisation vector to a population.
 *
 * Pure: takes records and a vector, returns keys. Nothing is mutated, so the field can
 * hold two generalisation states at once and tween between them (CLAUDE.md §6).
 */
import type { GeneralisationVector, PersonRecord, Value } from './types';
import type { Taxonomy } from './taxonomy';

export const KEY_SEPARATOR = '·';

/** The quasi-identifier columns the app attacks, in a fixed order so keys are stable. */
export const QUASI_COLUMNS = ['kelurahan', 'birthdate', 'gender', 'age'] as const;

export function generaliseValue(
  tax: Taxonomy,
  column: string,
  level: number,
  raw: Value,
): Value {
  const t = tax[column];
  if (!t) return raw;
  const l = t.levels[Math.min(Math.max(0, level), t.levels.length - 1)];
  return l.map(raw);
}

/** The generalised quasi-identifier for one record, as a single string key. */
export function generaliseRecord(
  record: PersonRecord,
  tax: Taxonomy,
  vector: GeneralisationVector,
  columns: readonly string[] = QUASI_COLUMNS,
): string {
  const parts: string[] = [];
  for (const c of columns) {
    parts.push(String(generaliseValue(tax, c, vector[c] ?? 0, record.quasi[c])));
  }
  return parts.join(KEY_SEPARATOR);
}

/** Keys for a whole population, index-aligned with `records`. */
export function generalisePopulation(
  records: readonly PersonRecord[],
  tax: Taxonomy,
  vector: GeneralisationVector,
  columns: readonly string[] = QUASI_COLUMNS,
): string[] {
  const out: string[] = new Array(records.length);
  for (let i = 0; i < records.length; i++) {
    out[i] = generaliseRecord(records[i], tax, vector, columns);
  }
  return out;
}

export function zeroVector(columns: readonly string[] = QUASI_COLUMNS): GeneralisationVector {
  const v: GeneralisationVector = {};
  for (const c of columns) v[c] = 0;
  return v;
}

export function vectorLevel(vector: GeneralisationVector): number {
  let sum = 0;
  for (const k of Object.keys(vector)) sum += vector[k];
  return sum;
}

export function vectorKey(vector: GeneralisationVector, columns: readonly string[] = QUASI_COLUMNS): string {
  return columns.map((c) => vector[c] ?? 0).join(',');
}

export function parseVectorKey(key: string, columns: readonly string[] = QUASI_COLUMNS): GeneralisationVector {
  const parts = key.split(',').map(Number);
  const v: GeneralisationVector = {};
  columns.forEach((c, i) => {
    v[c] = parts[i] ?? 0;
  });
  return v;
}

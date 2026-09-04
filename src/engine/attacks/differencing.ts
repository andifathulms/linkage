/**
 * Differencing, and composition. PRD §4.2 and §5.8.
 *
 * Threat model: no record-level data is released at all. Only aggregates. The attacker
 * composes two queries whose predicates differ by one person and subtracts.
 *
 * This is the case that defeats every defense above it, because generalisation,
 * k-anonymity, l-diversity and t-closeness are all properties of a released table, and
 * there is no released table.
 */
import type { PersonRecord } from '../types';
import { scoreOutcomes, type AttackResult, type TargetOutcome } from './types';

/** A predicate over quasi-identifier columns. Deliberately small: this is what a public
 * statistics portal lets you ask, and no more. */
export interface Predicate {
  column: string;
  op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'prefix';
  value: string | number;
}

export interface AggregateQuery {
  kind: 'count' | 'sum' | 'mean';
  /** Column being summed or averaged; ignored for a count. */
  column?: string;
  predicates: Predicate[];
}

export function matches(record: PersonRecord, p: Predicate): boolean {
  const raw = record.quasi[p.column] ?? record.sensitive[p.column];
  switch (p.op) {
    case 'eq':
      return String(raw) === String(p.value);
    case 'ne':
      return String(raw) !== String(p.value);
    case 'lt':
      return Number(raw) < Number(p.value);
    case 'lte':
      return Number(raw) <= Number(p.value);
    case 'gt':
      return Number(raw) > Number(p.value);
    case 'gte':
      return Number(raw) >= Number(p.value);
    case 'prefix':
      return String(raw).startsWith(String(p.value));
  }
}

export function selectRecords(
  records: readonly PersonRecord[],
  predicates: readonly Predicate[],
): PersonRecord[] {
  return records.filter((r) => predicates.every((p) => matches(r, p)));
}

export interface QueryAnswer {
  value: number;
  /** How many records the predicate selected. Not released in practice; kept for scoring. */
  size: number;
  memberIds: number[];
}

export function answer(records: readonly PersonRecord[], q: AggregateQuery): QueryAnswer {
  const selected = selectRecords(records, q.predicates);
  const memberIds = selected.map((r) => r.id);
  if (q.kind === 'count') return { value: selected.length, size: selected.length, memberIds };

  const column = q.column ?? 'income';
  let sum = 0;
  for (const r of selected) sum += Number(r.sensitive[column] ?? r.quasi[column] ?? 0);
  if (q.kind === 'sum') return { value: sum, size: selected.length, memberIds };
  return {
    value: selected.length === 0 ? 0 : sum / selected.length,
    size: selected.length,
    memberIds,
  };
}

export interface DifferencingResult {
  a: QueryAnswer;
  b: QueryAnswer;
  /** Records in exactly one of the two selections. */
  isolatedIds: number[];
  /** True when the two selections differ by exactly one record. */
  isolatesOne: boolean;
  /**
   * The recovered value, when one record is isolated. For counts this is 1 — the fact
   * that the person is in the set at all. For sums and means it is their actual figure.
   */
  recovered: number | null;
  /** Ground truth for the isolated record's value, for scoring. */
  actual: number | null;
  difference: number;
}

/**
 * Run the subtraction. Two aggregates, one difference.
 *
 * The recovered value for a mean pair is derived, not assumed:
 *   sum_a = mean_a * n_a, sum_b = mean_b * n_b, and the isolated record's value is
 *   sum_a − sum_b when the b-selection is the a-selection minus that one person.
 */
export function runDifferencing(
  records: readonly PersonRecord[],
  qa: AggregateQuery,
  qb: AggregateQuery,
  column = 'income',
): DifferencingResult {
  const a = answer(records, qa);
  const b = answer(records, qb);

  const setA = new Set(a.memberIds);
  const setB = new Set(b.memberIds);
  const isolatedIds: number[] = [];
  for (const id of setA) if (!setB.has(id)) isolatedIds.push(id);
  for (const id of setB) if (!setA.has(id)) isolatedIds.push(id);

  const isolatesOne = isolatedIds.length === 1;
  const byId = new Map(records.map((r) => [r.id, r]));

  let recovered: number | null = null;
  let actual: number | null = null;

  if (isolatesOne) {
    const record = byId.get(isolatedIds[0]);
    if (record) {
      if (qa.kind === 'count') {
        recovered = Math.abs(a.value - b.value);
        actual = 1;
      } else if (qa.kind === 'sum') {
        recovered = Math.abs(a.value - b.value);
        actual = Number(record.sensitive[column] ?? record.quasi[column] ?? 0);
      } else {
        const sumA = a.value * a.size;
        const sumB = b.value * b.size;
        recovered = Math.abs(sumA - sumB);
        actual = Number(record.sensitive[column] ?? record.quasi[column] ?? 0);
      }
    }
  }

  return {
    a,
    b,
    isolatedIds,
    isolatesOne,
    recovered,
    actual,
    difference: a.value - b.value,
  };
}

/**
 * Composition. PRD §4.2: many individually harmless queries that jointly disclose.
 *
 * The attacker asks a series of counts, each of which reveals nothing on its own, and
 * intersects the selections. The scored result is how many targets were pinned to a
 * single record and how many candidates remained for the rest.
 */
export function runComposition(
  records: readonly PersonRecord[],
  targetIds: readonly number[],
  queries: readonly AggregateQuery[],
): AttackResult {
  const byId = new Map(records.map((r) => [r.id, r]));
  // Each query partitions the population into in and out; a target's membership pattern
  // is what an attacker who can see counts before and after can read off.
  const selections = queries.map((q) => new Set(answer(records, q).memberIds));

  const signatureOf = (record: PersonRecord): string =>
    selections.map((s) => (s.has(record.id) ? '1' : '0')).join('');

  const bySignature = new Map<string, number[]>();
  for (const r of records) {
    const sig = signatureOf(r);
    const bucket = bySignature.get(sig);
    if (bucket) bucket.push(r.id);
    else bySignature.set(sig, [r.id]);
  }

  const outcomes: TargetOutcome[] = [];
  for (const targetId of targetIds) {
    const record = byId.get(targetId);
    if (!record) continue;
    const candidates = bySignature.get(signatureOf(record)) ?? [];
    const guessId = candidates.length === 1 ? candidates[0] : null;
    outcomes.push({
      targetId,
      guessId,
      correct: guessId === targetId,
      candidateCount: candidates.length,
    });
  }
  return scoreOutcomes(outcomes);
}

/**
 * Construct the differencing pair for a target: one query over a group, and the same
 * query with one extra predicate that excludes exactly that person. This is what a
 * portal user does by hand, and building it here means the bench can demonstrate the
 * attack rather than describe it.
 */
export function buildDifferencingPair(
  records: readonly PersonRecord[],
  targetId: number,
  groupPredicates: readonly Predicate[],
  kind: AggregateQuery['kind'] = 'mean',
  column = 'income',
): { a: AggregateQuery; b: AggregateQuery } | null {
  const target = records.find((r) => r.id === targetId);
  if (!target) return null;
  const a: AggregateQuery = { kind, column, predicates: [...groupPredicates] };
  // "Everyone in the group" and "everyone in the group not born on that date". Both are
  // ordinary published breakdowns.
  const b: AggregateQuery = {
    kind,
    column,
    predicates: [
      ...groupPredicates,
      { column: 'birthdate', op: 'ne', value: String(target.quasi.birthdate) },
    ],
  };
  return { a, b };
}

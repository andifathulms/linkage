/**
 * Which column is doing the identifying, measured and estimated.
 *
 * The schema assessor already ranks columns by leave-one-out contribution: uniqueness
 * with the column, minus uniqueness without it. That is the honest way to rank, because
 * a column's risk is what it adds beyond what the others already give you rather than
 * its cardinality in isolation.
 *
 * But the assessor cannot see a dataset, so it computes that ranking from declared
 * cardinalities under an independence assumption, and it says so: "correlation makes
 * this estimate optimistic". The app states that caveat as a sentence and has never once
 * shown what it costs, which is the same failure it spends five cases criticising. A
 * claim without a count (PRD §6.2).
 *
 * This module supplies the count. On a generated population, where the truth is known,
 * it computes the same leave-one-out ranking two ways:
 *
 *   measured    By grouping the population. Correlation between columns is whatever the
 *               generator actually produced, because the records are right there.
 *
 *   estimated   By feeding the observed cardinality of each generalised column into
 *               `uniquenessFromCardinalities`, which is the exact function the assessor
 *               uses. Same estimator, same cardinalities. The only thing that differs is
 *               that this one assumes the columns are independent.
 *
 * Holding the estimator and the cardinalities fixed is what isolates the assumption. The
 * gap between the two numbers is not measurement error and it is not a better estimator
 * beating a worse one: it is the price of independence, at this correlation, on this
 * population, and the generator's correlation control sweeps it.
 *
 * Sign convention: optimism is measured minus estimated. Uniqueness is a risk, so an
 * estimate that comes in low is under-stating the risk, which is what "optimistic"
 * means here.
 */
import { uniquenessFromCardinalities } from './uniqueness';
import { KEY_SEPARATOR } from './generalise';

export interface ColumnAttribution {
  column: string;
  /** Distinct values this column takes at the generalisation in force. */
  cardinality: number;
  /** Share of the population alone on the full quasi-identifier, minus this column. */
  measuredWithout: number;
  estimatedWithout: number;
  /** What this column adds beyond the others. The drop when it is removed. */
  measuredContribution: number;
  estimatedContribution: number;
}

export interface AttributionReport {
  population: number;
  columns: string[];
  /** Share of the population alone on the full quasi-identifier, by grouping. */
  measuredUniqueness: number;
  /** The same under independence, from the observed cardinalities. */
  estimatedUniqueness: number;
  /**
   * Measured minus estimated. Positive means the independence assumption under-states
   * the true uniqueness, which is the direction the assessor warns about.
   */
  optimism: number;
  /** Per column, worst measured contribution first. */
  ranked: ColumnAttribution[];
  /**
   * Whether the two methods agree on which column matters most. A steward acting on the
   * assessor's ranking is relying on this being true, and it is the reading that decides
   * whether the caveat is academic or actionable.
   */
  rankingAgrees: boolean;
}

/** Share of records whose key occurs exactly once. */
export function uniquenessOf(keys: readonly string[]): number {
  if (keys.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  let alone = 0;
  for (const c of counts.values()) if (c === 1) alone += 1;
  return alone / keys.length;
}

/** Distinct values per column, from keys already generalised and joined in column order. */
function cardinalitiesOf(keys: readonly string[], columnCount: number): number[] {
  const seen: Array<Set<string>> = [];
  for (let c = 0; c < columnCount; c++) seen.push(new Set<string>());
  for (const key of keys) {
    const parts = key.split(KEY_SEPARATOR);
    for (let c = 0; c < columnCount; c++) seen[c].add(parts[c] ?? '');
  }
  return seen.map((s) => s.size);
}

/** Drop one column from every key, preserving the order of the rest. */
function keysWithout(keys: readonly string[], drop: number): string[] {
  const out: string[] = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const parts = keys[i].split(KEY_SEPARATOR);
    parts.splice(drop, 1);
    out[i] = parts.join(KEY_SEPARATOR);
  }
  return out;
}

/**
 * Compare the measured attribution against the assessor's estimator.
 *
 * `keys` is index-aligned with the population and built by `generalisePopulation` over
 * `columns` in that order, so component i of every key belongs to column i. Passing keys
 * built over a different column list would silently mislabel every row of the output,
 * which is why the column list is required rather than inferred.
 */
export function attributeUniqueness(
  keys: readonly string[],
  columns: readonly string[],
): AttributionReport {
  const n = keys.length;
  const cardinalities = cardinalitiesOf(keys, columns.length);

  const measuredUniqueness = uniquenessOf(keys);
  const estimatedUniqueness =
    columns.length === 0 ? 0 : uniquenessFromCardinalities(n, cardinalities);

  const attributions: ColumnAttribution[] = columns.map((column, i) => {
    const measuredWithout = columns.length <= 1 ? 0 : uniquenessOf(keysWithout(keys, i));
    const remaining = cardinalities.filter((_, j) => j !== i);
    const estimatedWithout =
      remaining.length === 0 ? 0 : uniquenessFromCardinalities(n, remaining);
    return {
      column,
      cardinality: cardinalities[i],
      measuredWithout,
      estimatedWithout,
      measuredContribution: measuredUniqueness - measuredWithout,
      estimatedContribution: estimatedUniqueness - estimatedWithout,
    };
  });

  const ranked = [...attributions].sort(
    (a, b) =>
      b.measuredContribution - a.measuredContribution || (a.column < b.column ? -1 : 1),
  );

  const byEstimate = [...attributions].sort(
    (a, b) =>
      b.estimatedContribution - a.estimatedContribution || (a.column < b.column ? -1 : 1),
  );

  const rankingAgrees =
    ranked.length === 0 || ranked[0].column === byEstimate[0].column;

  return {
    population: n,
    columns: [...columns],
    measuredUniqueness,
    estimatedUniqueness,
    optimism: measuredUniqueness - estimatedUniqueness,
    ranked,
    rankingAgrees,
  };
}

/**
 * Suppression, and who pays for it.
 *
 * The standard remedy when generalisation alone will not reach k is to drop the records
 * that still fail it. The app already does this for l-diversity in case 3 and reports it
 * as a count: so many records suppressed to reach l. A count is true and it is not the
 * finding.
 *
 * The finding is that the records dropped are not a random sample of the population.
 * A record fails k because too few people share its quasi-identifier, which means it was
 * rare, and rarity in an administrative population is not evenly distributed. It means a
 * small kelurahan, an unusual age, a category with few members. So the cost of reaching
 * k falls on whoever was already least like everybody else, and a table anonymised this
 * way under-represents exactly the populations a programme is often trying to see.
 *
 * This module measures that rather than asserting it. It returns which records were
 * suppressed and, per column, how far the suppressed subset's distribution sits from the
 * population's, reusing the same earth mover's distance that t-closeness is defined by
 * (Li et al.) so the measure is one the app already explains elsewhere.
 *
 * On register: the app reports the distribution and stops. It does not say this is
 * unfair, does not recommend against anonymising, and does not dramatise (DESIGN §7).
 * A steward who sees that 68% of the suppressed records come from three kelurahan that
 * hold 4% of the population does not need to be told what to think about it.
 */
import { earthMoversDistance } from './classes';
import type { PersonRecord, Value } from './types';

export interface ColumnSkew {
  column: string;
  /** Value counts among the suppressed records. */
  suppressed: Map<Value, number>;
  /** Value counts across the whole population. */
  population: Map<Value, number>;
  /** Stable value order, so charts and distances agree. */
  order: Value[];
  /**
   * Earth mover's distance between the two. Zero means suppression took a representative
   * slice of this column; larger means it did not.
   */
  distance: number;
  /**
   * The value most over-represented among the suppressed, with both shares, so the
   * finding can be stated with its denominators (DESIGN §7) rather than as a ratio.
   */
  mostAffected: {
    value: Value;
    suppressedCount: number;
    suppressedShare: number;
    populationCount: number;
    populationShare: number;
  } | null;
}

export interface SuppressionResult {
  targetK: number;
  /** Record ids dropped to reach the target. */
  suppressedIds: number[];
  suppressed: number;
  retained: number;
  population: number;
  /** Per column, how the suppressed subset differs from the population. */
  columns: ColumnSkew[];
  /**
   * Columns ordered by distance, worst first. The ranking is the reading; a steward
   * wants to know which attribute the cost concentrated in, not all of them at once.
   */
  ranked: ColumnSkew[];
}

export interface SuppressionOptions {
  /** Columns to compare. Read from `record.quasi` at raw precision. */
  columns: readonly string[];
  /** Columns whose values are ordered, so EMD uses the ordinal formula. */
  ordinalColumns?: readonly string[];
}

/**
 * Suppress every record whose class is smaller than the target, and measure what that
 * removed.
 *
 * `keys` is index-aligned with `records` at whatever generalisation is in force, so this
 * function does no taxonomy work and composes with the lattice search the same way
 * `buildClasses` does.
 *
 * Note what is deliberately *not* done here: suppression is not applied and then k
 * recomputed. Dropping a class cannot change any other class's size, because classes
 * partition the population, so one pass is exact. If that ever stops being true the test
 * will catch it.
 */
export function suppressToK(
  records: readonly PersonRecord[],
  keys: readonly string[],
  targetK: number,
  options: SuppressionOptions,
): SuppressionResult {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);

  const suppressedIds: number[] = [];
  const suppressedIndices: number[] = [];
  for (let i = 0; i < records.length; i++) {
    if ((counts.get(keys[i]) ?? 0) < targetK) {
      suppressedIds.push(records[i].id);
      suppressedIndices.push(i);
    }
  }

  const ordinal = new Set(options.ordinalColumns ?? []);
  const columns: ColumnSkew[] = options.columns.map((column) => {
    const population = new Map<Value, number>();
    for (const record of records) {
      const v = record.quasi[column];
      population.set(v, (population.get(v) ?? 0) + 1);
    }
    const suppressed = new Map<Value, number>();
    for (const i of suppressedIndices) {
      const v = records[i].quasi[column];
      suppressed.set(v, (suppressed.get(v) ?? 0) + 1);
    }

    // Ordinal columns keep their natural order; categorical ones sort by population
    // frequency, matching how buildClasses orders sensitive values.
    const isOrdinal = ordinal.has(column);
    const order = [...population.keys()].sort((a, b) => {
      if (isOrdinal) return a < b ? -1 : a > b ? 1 : 0;
      const d = (population.get(b) ?? 0) - (population.get(a) ?? 0);
      return d !== 0 ? d : String(a) < String(b) ? -1 : 1;
    });

    const distance = earthMoversDistance(suppressed, population, order, isOrdinal);

    const suppressedTotal = suppressedIndices.length;
    const populationTotal = records.length;
    let mostAffected: ColumnSkew['mostAffected'] = null;
    if (suppressedTotal > 0 && populationTotal > 0) {
      let bestLift = -Infinity;
      for (const value of order) {
        const sc = suppressed.get(value) ?? 0;
        if (sc === 0) continue;
        const pc = population.get(value) ?? 0;
        const ss = sc / suppressedTotal;
        const ps = pc / populationTotal;
        const lift = ss - ps;
        if (lift > bestLift) {
          bestLift = lift;
          mostAffected = {
            value,
            suppressedCount: sc,
            suppressedShare: ss,
            populationCount: pc,
            populationShare: ps,
          };
        }
      }
    }

    return { column, suppressed, population, order, distance, mostAffected };
  });

  const ranked = [...columns].sort(
    (a, b) => b.distance - a.distance || (a.column < b.column ? -1 : 1),
  );

  return {
    targetK,
    suppressedIds,
    suppressed: suppressedIds.length,
    retained: records.length - suppressedIds.length,
    population: records.length,
    columns,
    ranked,
  };
}

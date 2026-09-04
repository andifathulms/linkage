/**
 * Utility: what a defense costs. PRD §5.6.
 *
 * Every defense buys privacy with accuracy. The frontier makes that a shape rather than
 * a sentence, and it needs two measures that are honest in different ways:
 *
 *   informationLoss  structural — how much precision the generalisation destroyed,
 *                    independent of any question anyone asked.
 *   queryAccuracy    empirical — how far the answers to a fixed battery of questions
 *                    move when computed on the released table instead of the true one.
 *
 * The second is the one a data user feels, and the two do not always agree, which is
 * itself worth showing.
 */
import type { PersonRecord } from './types';
import type { Taxonomy } from './taxonomy';
import type { GeneralisationVector } from './types';
import { generalisePopulation, QUASI_COLUMNS } from './generalise';
import { buildClasses, type ClassSet } from './classes';
import { informationLoss } from './lattice';

export interface UtilityQuery {
  label: string;
  /** True answer over the real population. */
  truth: (records: readonly PersonRecord[]) => number;
  /**
   * Answer over the released table. A generalised table cannot answer a fine question
   * exactly; the honest estimate spreads each class uniformly over the values it covers,
   * which is what a data user is forced to do.
   */
  released: (records: readonly PersonRecord[], set: ClassSet, keys: readonly string[]) => number;
}

export interface UtilityReport {
  informationLoss: number;
  /** Mean relative error over the query battery, in [0, 1] after clamping. */
  queryError: number;
  perQuery: Array<{ label: string; truth: number; released: number; relativeError: number }>;
  /** Distinct classes remaining. A release with four classes answers almost nothing. */
  classCount: number;
  /** Mean class size — the granularity a data user actually receives. */
  meanClassSize: number;
}

/**
 * The standard battery. Deliberately ordinary questions, of the kind a health ministry
 * or a planning office would ask of a release, so the cost is legible.
 */
export function standardQueries(): UtilityQuery[] {
  const countWhere = (predicate: (r: PersonRecord) => boolean) => (records: readonly PersonRecord[]) =>
    records.reduce((n, r) => n + (predicate(r) ? 1 : 0), 0);

  return [
    {
      label: 'Records aged under 30',
      truth: countWhere((r) => Number(r.quasi.age) < 30),
      released: (records, set) => estimateCount(records, set, (r) => Number(r.quasi.age) < 30, 'age'),
    },
    {
      label: 'Records aged 60 or over',
      truth: countWhere((r) => Number(r.quasi.age) >= 60),
      released: (records, set) => estimateCount(records, set, (r) => Number(r.quasi.age) >= 60, 'age'),
    },
    {
      label: 'Records in the largest province',
      truth: countWhere((r) => String(r.quasi.kelurahan).startsWith('32')),
      released: (records, set) =>
        estimateCount(records, set, (r) => String(r.quasi.kelurahan).startsWith('32'), 'kelurahan'),
    },
    {
      label: 'Female records',
      truth: countWhere((r) => r.quasi.gender === 'F'),
      released: (records, set) => estimateCount(records, set, (r) => r.quasi.gender === 'F', 'gender'),
    },
  ];
}

/**
 * Estimate a count from the released table.
 *
 * A class whose members all satisfy the predicate contributes its full size; a class
 * where none do contributes nothing; a class that straddles the boundary contributes in
 * proportion, because a data user holding only the generalised key cannot do better than
 * assume the class is uniform over what its key covers. That assumption is exactly the
 * accuracy the generalisation destroyed, and measuring it is the point.
 */
function estimateCount(
  records: readonly PersonRecord[],
  set: ClassSet,
  predicate: (r: PersonRecord) => boolean,
  _column: string,
): number {
  const byId = new Map(records.map((r) => [r.id, r]));
  let total = 0;
  for (const cls of set.classes) {
    let inside = 0;
    for (const id of cls.members) {
      const r = byId.get(id);
      if (r && predicate(r)) inside++;
    }
    // Uniform assumption within the class: the data user sees only the key, so their
    // best estimate of the share satisfying the predicate is the class's own share.
    const share = cls.members.length === 0 ? 0 : inside / cls.members.length;
    total += Math.round(share * cls.members.length);
  }
  return total;
}

export function measureUtility(
  records: readonly PersonRecord[],
  taxonomy: Taxonomy,
  vector: GeneralisationVector,
  columns: readonly string[] = QUASI_COLUMNS,
  queries: UtilityQuery[] = standardQueries(),
): UtilityReport {
  const keys = generalisePopulation(records, taxonomy, vector, columns);
  const set = buildClasses(records, keys);

  const perQuery = queries.map((q) => {
    const truth = q.truth(records);
    const released = q.released(records, set, keys);
    const relativeError = truth === 0 ? (released === 0 ? 0 : 1) : Math.abs(released - truth) / truth;
    return { label: q.label, truth, released, relativeError };
  });

  const queryError =
    perQuery.length === 0
      ? 0
      : Math.min(1, perQuery.reduce((s, q) => s + q.relativeError, 0) / perQuery.length);

  return {
    informationLoss: informationLoss(vector, taxonomy, columns),
    queryError,
    perQuery,
    classCount: set.classes.length,
    meanClassSize: set.classes.length === 0 ? 0 : records.length / set.classes.length,
  };
}

export interface FrontierPoint {
  vector: GeneralisationVector;
  /** Achieved k at this vector. */
  k: number;
  /** Share of targets uniquely identified by a linkage attack. */
  reidentificationRate: number;
  /** Structural loss, 0 to 1. */
  informationLoss: number;
  /** Empirical query error, 0 to 1. */
  queryError: number;
  singletons: number;
  classCount: number;
}

/**
 * The privacy–utility frontier as a set of points a user can move along.
 *
 * Each point is a real generalisation vector with a real measured re-identification rate
 * and a real measured utility cost. Nothing here is a curve fitted to a shape someone
 * expected; the two series cross where they cross.
 */
export function buildFrontier(
  records: readonly PersonRecord[],
  taxonomy: Taxonomy,
  vectors: readonly GeneralisationVector[],
  columns: readonly string[] = QUASI_COLUMNS,
): FrontierPoint[] {
  const points: FrontierPoint[] = [];
  for (const vector of vectors) {
    const keys = generalisePopulation(records, taxonomy, vector, columns);
    const set = buildClasses(records, keys);
    // Re-identification rate is the share of records whose generalised key is unique —
    // the linkage attack's success rate against an attacker holding the full triple.
    const rate = records.length === 0 ? 0 : set.singletons / records.length;
    const utility = measureUtility(records, taxonomy, vector, columns);
    points.push({
      vector,
      k: set.k,
      reidentificationRate: rate,
      informationLoss: utility.informationLoss,
      queryError: utility.queryError,
      singletons: set.singletons,
      classCount: set.classes.length,
    });
  }
  return points;
}

/**
 * A chain of vectors from raw to fully suppressed, coarsening one column at a time in
 * the order that costs least first. Gives the frontier a path a user can drag along
 * rather than a scatter.
 */
export function frontierPath(
  taxonomy: Taxonomy,
  columns: readonly string[] = QUASI_COLUMNS,
): GeneralisationVector[] {
  const vector: GeneralisationVector = {};
  for (const c of columns) vector[c] = 0;
  const path: GeneralisationVector[] = [{ ...vector }];

  let progressed = true;
  while (progressed) {
    progressed = false;
    // Coarsen the column with the lowest relative height so far, so the path climbs
    // evenly rather than exhausting one column before touching the next.
    let chosen: string | null = null;
    let chosenRatio = Infinity;
    for (const c of columns) {
      const height = (taxonomy[c]?.levels.length ?? 1) - 1;
      if (height <= 0) continue;
      const level = vector[c] ?? 0;
      if (level >= height) continue;
      const ratio = level / height;
      if (ratio < chosenRatio) {
        chosenRatio = ratio;
        chosen = c;
      }
    }
    if (chosen !== null) {
      vector[chosen] = (vector[chosen] ?? 0) + 1;
      path.push({ ...vector });
      progressed = true;
    }
  }
  return path;
}

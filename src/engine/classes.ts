/**
 * Equivalence classes and the three class-level measures: k, l, t.
 *
 * Each measure defends against a specific threat model and fails outside it (PRD §6.3):
 *
 *   k  minimum class size. Assumes the attacker knows quasi-identifiers only. Defeated
 *      by homogeneity — a class of 50 that shares one sensitive value discloses that
 *      value without identifying anyone.
 *   l  distinct well-represented sensitive values in a class. Assumes value diversity is
 *      protection. Defeated by skewness — three values in 98/1/1 proportion is 3-diverse
 *      and still near-certain.
 *   t  earth mover's distance from the class distribution to the population's. Assumes
 *      the population distribution is public and harmless.
 */
import type { EquivalenceClass, PersonRecord, Value } from './types';

export interface ClassSet {
  classes: EquivalenceClass[];
  /** classIndex[recordIndex] = index into `classes`. */
  classIndex: number[];
  byKey: Map<string, number>;
  /** Minimum class size over the whole table — the actual k of the release. */
  k: number;
  /** Minimum l. */
  l: number;
  /** Maximum t. Larger is worse, unlike k and l. */
  t: number;
  /** Records in a class of size 1. */
  singletons: number;
  /** Records in a class of size 2 to 4 — nearly determinative (DESIGN §2.2). */
  narrow: number;
  populationDistribution: Map<Value, number>;
  /** Ordered sensitive values, so charts and distances agree on ordering. */
  sensitiveOrder: Value[];
}

/**
 * Earth mover's distance between a class distribution and the population's.
 *
 * For a categorical attribute the values have no order, so the ground distance between
 * any two distinct values is 1 and EMD reduces to half the total variation distance.
 * For an ordinal attribute the values are ordered and EMD is the mean absolute
 * difference of the cumulative distributions, normalised by the number of steps. Li et
 * al. define both; using the categorical formula on an ordinal attribute understates
 * the distance, so the caller declares which it is.
 */
export function earthMoversDistance(
  classDist: Map<Value, number>,
  popDist: Map<Value, number>,
  order: readonly Value[],
  ordinal = false,
): number {
  const classTotal = sumValues(classDist);
  const popTotal = sumValues(popDist);
  if (classTotal === 0 || popTotal === 0) return 0;

  if (!ordinal) {
    let tv = 0;
    for (const v of order) {
      const p = (classDist.get(v) ?? 0) / classTotal;
      const q = (popDist.get(v) ?? 0) / popTotal;
      tv += Math.abs(p - q);
    }
    return tv / 2;
  }

  const m = order.length;
  if (m <= 1) return 0;
  let cumulative = 0;
  let total = 0;
  for (let i = 0; i < m - 1; i++) {
    const p = (classDist.get(order[i]) ?? 0) / classTotal;
    const q = (popDist.get(order[i]) ?? 0) / popTotal;
    cumulative += p - q;
    total += Math.abs(cumulative);
  }
  return total / (m - 1);
}

function sumValues(m: Map<Value, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

/**
 * Distinct l-diversity: the number of distinct sensitive values in the class. This is
 * the weakest of the l-diversity family and the app says so at the point of use, since
 * a class that is 3-diverse in 98/1/1 proportion is where case 3 begins.
 */
export function distinctL(dist: Map<Value, number>): number {
  let n = 0;
  for (const c of dist.values()) if (c > 0) n++;
  return n;
}

/** Entropy l-diversity, reported alongside distinct l because they disagree usefully. */
export function entropyL(dist: Map<Value, number>): number {
  const total = sumValues(dist);
  if (total === 0) return 0;
  let h = 0;
  for (const c of dist.values()) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return Math.exp(h);
}

export interface ClassOptions {
  sensitiveColumn?: string;
  ordinalSensitive?: boolean;
}

/**
 * Group records by their generalised quasi-identifier key.
 *
 * `keys` is index-aligned with `records`, so the caller controls generalisation and this
 * function does no taxonomy work — which is what lets the lattice search reuse it
 * thousands of times without re-deriving anything.
 */
export function buildClasses(
  records: readonly PersonRecord[],
  keys: readonly string[],
  options: ClassOptions = {},
): ClassSet {
  const sensitiveColumn = options.sensitiveColumn ?? 'diagnosis';
  const byKey = new Map<string, number>();
  const classes: EquivalenceClass[] = [];
  const classIndex: number[] = new Array(records.length);
  const populationDistribution = new Map<Value, number>();

  for (let i = 0; i < records.length; i++) {
    const key = keys[i];
    let ci = byKey.get(key);
    if (ci === undefined) {
      ci = classes.length;
      byKey.set(key, ci);
      classes.push({
        key,
        members: [],
        k: 0,
        l: 0,
        t: 0,
        sensitiveDistribution: new Map<Value, number>(),
      });
    }
    const cls = classes[ci];
    cls.members.push(records[i].id);
    classIndex[i] = ci;

    const value = records[i].sensitive[sensitiveColumn];
    cls.sensitiveDistribution.set(value, (cls.sensitiveDistribution.get(value) ?? 0) + 1);
    populationDistribution.set(value, (populationDistribution.get(value) ?? 0) + 1);
  }

  // Stable value order: descending population frequency, ties broken by value, so the
  // class inspector's bars do not reorder as the generalisation changes.
  const sensitiveOrder = [...populationDistribution.keys()].sort((a, b) => {
    const d = (populationDistribution.get(b) ?? 0) - (populationDistribution.get(a) ?? 0);
    return d !== 0 ? d : String(a) < String(b) ? -1 : 1;
  });

  let k = Infinity;
  let l = Infinity;
  let t = 0;
  let singletons = 0;
  let narrow = 0;

  for (const cls of classes) {
    cls.k = cls.members.length;
    cls.l = distinctL(cls.sensitiveDistribution);
    cls.t = earthMoversDistance(
      cls.sensitiveDistribution,
      populationDistribution,
      sensitiveOrder,
      options.ordinalSensitive ?? false,
    );
    if (cls.k < k) k = cls.k;
    if (cls.l < l) l = cls.l;
    if (cls.t > t) t = cls.t;
    if (cls.k === 1) singletons += 1;
    else if (cls.k <= 4) narrow += cls.k;
  }

  return {
    classes,
    classIndex,
    byKey,
    k: classes.length === 0 ? 0 : k,
    l: classes.length === 0 ? 0 : l,
    t,
    singletons,
    narrow,
    populationDistribution,
    sensitiveOrder,
  };
}

/** Records that stand alone. The field's whole argument is that these are visible. */
export function singletonRecordIds(set: ClassSet): number[] {
  const out: number[] = [];
  for (const cls of set.classes) if (cls.members.length === 1) out.push(cls.members[0]);
  return out;
}

export type Exposure = 'exposed' | 'narrow' | 'protected';

export function exposureOf(size: number): Exposure {
  if (size === 1) return 'exposed';
  if (size <= 4) return 'narrow';
  return 'protected';
}

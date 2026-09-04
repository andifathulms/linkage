/**
 * Sensitivity, computed per query type. CLAUDE.md §5.
 *
 * Hardcoding sensitivity 1 everywhere is the standard way to build a differential
 * privacy implementation that does not actually provide differential privacy. So every
 * query carries the sensitivity that was derived for it, and the derivation in words,
 * and the interface shows both.
 *
 * Global sensitivity is the largest change one person's presence can make to the
 * answer:
 *
 *   count      1                      adding a person changes the count by one
 *   sum        clampHigh - clampLow   the widest contribution one person can make,
 *                                     which is why an unclamped sum has unbounded
 *                                     sensitivity and cannot be released
 *   mean       a composition; see below
 *   histogram  1 under add/remove     a person lands in exactly one bin
 */

export type QueryKind = 'count' | 'sum' | 'mean' | 'histogram';

export interface Clamp {
  low: number;
  high: number;
}

export interface Query {
  kind: QueryKind;
  sensitivity: number;
  /** How that number was arrived at, in words, for the interface. */
  derivation: string;
  /** Column being summed or averaged. */
  column?: string;
  clamp?: Clamp;
  /** Minimum group size the mean assumes. */
  minimumCount?: number;
  label?: string;
}

export class SensitivityError extends Error {}

export function countQuery(label?: string): Query {
  return {
    kind: 'count',
    sensitivity: 1,
    derivation:
      'A count changes by at most 1 when one person is added or removed, so its global sensitivity is 1.',
    label,
  };
}

/**
 * Sum. Sensitivity is the clamp range, not the range of the data — the clamp is what
 * bounds one person's contribution, and without one the sensitivity is unbounded.
 */
export function sumQuery(column: string, clamp: Clamp, label?: string): Query {
  if (!(clamp.high > clamp.low)) {
    throw new SensitivityError('A sum needs a clamp range with high above low.');
  }
  const sensitivity = clamp.high - clamp.low;
  return {
    kind: 'sum',
    sensitivity,
    derivation:
      `Each person contributes a value clamped to [${clamp.low}, ${clamp.high}], so one ` +
      `person's presence changes the sum by at most ${clamp.high} − ${clamp.low} = ${sensitivity}. ` +
      'Without the clamp the sensitivity would be unbounded and no finite noise would suffice.',
    column,
    clamp,
    label,
  };
}

/**
 * Mean. A composition, and it needs care.
 *
 * A mean over a group whose size is itself private is a ratio of two noisy quantities,
 * and treating it as if the denominator were public understates the disclosure. Two
 * honest options:
 *
 *   - Release the sum and the count separately, splitting the budget. The mean is then a
 *     post-processing of two DP answers, and post-processing is free.
 *   - Assume a publicly known minimum group size n, in which case replacing one person
 *     changes the mean by at most (high − low) / n.
 *
 * The second is implemented here, and it states the assumption it rests on, because a
 * mean released under an n that turns out to be smaller than assumed is not private at
 * the claimed epsilon.
 */
export function meanQuery(
  column: string,
  clamp: Clamp,
  minimumCount: number,
  label?: string,
): Query {
  if (!(clamp.high > clamp.low)) {
    throw new SensitivityError('A mean needs a clamp range with high above low.');
  }
  if (!Number.isFinite(minimumCount) || minimumCount < 1) {
    throw new SensitivityError(
      'A mean needs a publicly known minimum group size. Without one its sensitivity is unbounded as the group shrinks.',
    );
  }
  const sensitivity = (clamp.high - clamp.low) / minimumCount;
  return {
    kind: 'mean',
    sensitivity,
    derivation:
      `Values are clamped to [${clamp.low}, ${clamp.high}] and the group is publicly known to ` +
      `hold at least ${minimumCount} people, so replacing one person moves the mean by at most ` +
      `(${clamp.high} − ${clamp.low}) / ${minimumCount} = ${round(sensitivity)}. ` +
      'This assumes the minimum group size is public. If the true group is smaller, the released mean is not private at the stated epsilon.',
    column,
    clamp,
    minimumCount,
    label,
  };
}

/**
 * Histogram. One person falls in exactly one bin, so under the add/remove neighbouring
 * relation the L1 sensitivity is 1 — not the number of bins. Under the replace-one
 * relation it is 2, since one bin falls and another rises, and which relation is meant
 * has to be stated or the noise is wrong by a factor of two.
 */
export function histogramQuery(
  column: string,
  neighbouring: 'add-remove' | 'replace-one' = 'add-remove',
  label?: string,
): Query {
  const sensitivity = neighbouring === 'add-remove' ? 1 : 2;
  return {
    kind: 'histogram',
    sensitivity,
    derivation:
      neighbouring === 'add-remove'
        ? 'One person falls in exactly one bin, so adding or removing them changes the histogram by 1 in L1 — not by the number of bins.'
        : 'Replacing one person removes them from one bin and adds them to another, so the L1 change is 2.',
    column,
    label,
  };
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/** Clamp a value into the query's declared range, which is what the derivation assumed. */
export function clampValue(value: number, clamp: Clamp): number {
  return Math.max(clamp.low, Math.min(clamp.high, value));
}

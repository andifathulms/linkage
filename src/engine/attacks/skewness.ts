/**
 * Skewness. PRD §4.2.
 *
 * Threat model, stated first (PRD §6.3): l-diversity assumes that l distinct values in a
 * class means the attacker cannot choose between them. It counts values and not their
 * proportions.
 *
 * So a class holding one value 98 times and two others once each is 3-diverse, and an
 * attacker naming the common value is right 98 times in 100. This is Li et al.'s
 * skewness argument and it is why t-closeness exists.
 *
 * The attack is scored the way the others are, and it is scored against the population
 * baseline as well — a class that merely reflects the population discloses nothing new,
 * and the difference between the two figures is the actual finding.
 */
import type { PersonRecord } from '../types';
import type { ClassSet } from '../classes';
import { scoreInferences, type InferenceOutcome, type InferenceResult } from './types';

export interface SkewnessOptions {
  targetIds: readonly number[];
  sensitiveColumn?: string;
  /**
   * The confidence at which the attacker will claim a value. Below 1 this is not
   * certainty and the result reports how often it was wrong, which is the honest way to
   * present a probabilistic disclosure.
   */
  confidenceThreshold?: number;
}

export interface SkewnessResult extends InferenceResult {
  /**
   * Mean confidence over the targets claimed. A class distribution that gives 0.98
   * confidence is the case worth showing even though it never reaches certainty.
   */
  meanConfidence: number;
  /** Baseline confidence from the population distribution alone. */
  baselineConfidence: number;
}

export function runSkewness(
  records: readonly PersonRecord[],
  set: ClassSet,
  options: SkewnessOptions,
): SkewnessResult {
  const sensitiveColumn = options.sensitiveColumn ?? 'diagnosis';
  const threshold = options.confidenceThreshold ?? 0.8;

  const indexById = new Map<number, number>();
  for (let i = 0; i < records.length; i++) indexById.set(records[i].id, i);

  let popTotal = 0;
  let popTop = 0;
  let popTopValue = '';
  for (const [value, n] of set.populationDistribution) {
    popTotal += n;
    if (n > popTop) {
      popTop = n;
      popTopValue = String(value);
    }
  }
  const baselineConfidence = popTotal === 0 ? 0 : popTop / popTotal;

  const outcomes: InferenceOutcome[] = [];
  let baselineCorrect = 0;
  let confidenceSum = 0;
  let claimed = 0;

  for (const targetId of options.targetIds) {
    const i = indexById.get(targetId);
    if (i === undefined) continue;
    const cls = set.classes[set.classIndex[i]];
    const actual = String(records[i].sensitive[sensitiveColumn]);
    if (actual === popTopValue) baselineCorrect++;

    let top = 0;
    let topValue: string | null = null;
    for (const [value, n] of cls.sensitiveDistribution) {
      if (n > top) {
        top = n;
        topValue = String(value);
      }
    }
    const confidence = cls.members.length === 0 ? 0 : top / cls.members.length;
    const inferred = topValue !== null && confidence >= threshold ? topValue : null;
    if (inferred !== null) {
      claimed++;
      confidenceSum += confidence;
    }

    outcomes.push({
      targetId,
      classKey: cls.key,
      classSize: cls.members.length,
      inferred,
      actual,
      correct: inferred !== null && inferred === actual,
      confidence,
    });
  }

  return {
    ...scoreInferences(outcomes, baselineCorrect),
    meanConfidence: claimed === 0 ? 0 : confidenceSum / claimed,
    baselineConfidence,
  };
}

/**
 * Classes ranked by how far their sensitive distribution sits from the population's.
 * The class inspector draws the population as a hairline behind the class, and these are
 * the ones where the two shapes do not overlap (DESIGN §5.5).
 */
export function mostSkewedClasses(set: ClassSet, minimumSize = 2, limit = 20): number[] {
  const candidates: Array<[number, number]> = [];
  set.classes.forEach((cls, i) => {
    if (cls.members.length >= minimumSize) candidates.push([i, cls.t]);
  });
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates.slice(0, limit).map(([i]) => i);
}

/**
 * Classes that satisfy l-diversity and still concede near-certainty. Case 3 is built on
 * finding one of these, and the app should be able to point at it rather than hope.
 */
export function diverseButSkewed(
  set: ClassSet,
  minimumL: number,
  minimumConfidence: number,
  minimumSize = 5,
): number[] {
  const out: number[] = [];
  set.classes.forEach((cls, i) => {
    if (cls.members.length < minimumSize) return;
    if (cls.l < minimumL) return;
    let top = 0;
    for (const n of cls.sensitiveDistribution.values()) top = Math.max(top, n);
    if (top / cls.members.length >= minimumConfidence) out.push(i);
  });
  return out;
}

/**
 * Homogeneity. PRD §4.2.
 *
 * Threat model, stated before the attack (PRD §6.3): k-anonymity assumes the attacker
 * knows quasi-identifiers only and wants to name a person. It says nothing about what
 * they learn if they do not need the name.
 *
 * A class of fifty in which every record carries one diagnosis is 50-anonymous and
 * discloses that diagnosis about all fifty. The attacker never identifies anyone, which
 * is why k-anonymity does not see this coming.
 */
import type { PersonRecord } from '../types';
import type { ClassSet } from '../classes';
import { scoreInferences, type InferenceOutcome, type InferenceResult } from './types';

export interface HomogeneityOptions {
  targetIds: readonly number[];
  sensitiveColumn?: string;
  /**
   * Share of a class that must hold one value before the attacker will claim it. At 1.0
   * this is strict homogeneity; below that it is the near-homogeneous case, which is
   * commoner and just as disclosing.
   */
  threshold?: number;
}

export function runHomogeneity(
  records: readonly PersonRecord[],
  set: ClassSet,
  options: HomogeneityOptions,
): InferenceResult {
  const sensitiveColumn = options.sensitiveColumn ?? 'diagnosis';
  const threshold = options.threshold ?? 1;

  const indexById = new Map<number, number>();
  for (let i = 0; i < records.length; i++) indexById.set(records[i].id, i);

  // Baseline: what the attacker gets from the population distribution alone, by always
  // naming the commonest value. Reported so the finding is disclosure and not a guess.
  let popTop = 0;
  let popTopValue = '';
  for (const [value, n] of set.populationDistribution) {
    if (n > popTop) {
      popTop = n;
      popTopValue = String(value);
    }
  }

  const outcomes: InferenceOutcome[] = [];
  let baselineCorrect = 0;

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

  return scoreInferences(outcomes, baselineCorrect);
}

/** Classes where every member shares one sensitive value — the ones case 2 goes looking for. */
export function homogeneousClasses(set: ClassSet, minimumSize = 2): number[] {
  const out: number[] = [];
  set.classes.forEach((cls, i) => {
    if (cls.members.length >= minimumSize && cls.l === 1) out.push(i);
  });
  return out;
}

/** Baseline accuracy of always naming the commonest population value. */
export function populationBaseline(set: ClassSet): { value: string; rate: number } {
  let total = 0;
  let top = 0;
  let value = '';
  for (const [v, n] of set.populationDistribution) {
    total += n;
    if (n > top) {
      top = n;
      value = String(v);
    }
  }
  return { value, rate: total === 0 ? 0 : top / total };
}

/**
 * Background knowledge. PRD §4.2.
 *
 * Threat model: the attacker holds auxiliary facts that eliminate candidates within a
 * class. Not a name and not a record — a negative fact, of the kind that is ordinary
 * social knowledge. "He is not diabetic, I have eaten with him."
 *
 * l-diversity is stated against exactly this: a class needs l well-represented values so
 * that l−1 eliminating facts still leave a choice. The attack measures how many facts it
 * actually takes, which is usually fewer than the l figure suggests.
 */
import type { PersonRecord } from '../types';
import type { ClassSet } from '../classes';
import { scoreInferences, type InferenceOutcome, type InferenceResult } from './types';

export interface BackgroundFact {
  /** The value this fact eliminates for the given target. */
  eliminates: string;
}

export interface BackgroundOptions {
  targetIds: readonly number[];
  sensitiveColumn?: string;
  /**
   * How many eliminating facts the attacker holds per target. The interesting reading is
   * how the identification count moves as this rises from 0, so it is a control.
   */
  factCount: number;
  /**
   * Facts eliminate values the target does not hold, chosen deterministically by
   * population frequency: an attacker's incidental knowledge is likelier to concern
   * common conditions than rare ones.
   */
}

export function runBackground(
  records: readonly PersonRecord[],
  set: ClassSet,
  options: BackgroundOptions,
): InferenceResult {
  const sensitiveColumn = options.sensitiveColumn ?? 'diagnosis';
  const indexById = new Map<number, number>();
  for (let i = 0; i < records.length; i++) indexById.set(records[i].id, i);

  // Values in descending population frequency: the order an attacker's incidental
  // knowledge would plausibly arrive in.
  const byFrequency = [...set.populationDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => String(v));

  const outcomes: InferenceOutcome[] = [];
  let baselineCorrect = 0;
  const popTopValue = byFrequency[0] ?? '';

  for (const targetId of options.targetIds) {
    const i = indexById.get(targetId);
    if (i === undefined) continue;
    const cls = set.classes[set.classIndex[i]];
    const actual = String(records[i].sensitive[sensitiveColumn]);
    if (actual === popTopValue) baselineCorrect++;

    // The attacker's facts, all true: values the target does not hold.
    const eliminated = new Set<string>();
    for (const value of byFrequency) {
      if (eliminated.size >= options.factCount) break;
      if (value !== actual) eliminated.add(value);
    }

    // What remains in the class after elimination.
    const remaining = new Map<string, number>();
    let remainingTotal = 0;
    for (const [value, n] of cls.sensitiveDistribution) {
      const v = String(value);
      if (eliminated.has(v)) continue;
      remaining.set(v, n);
      remainingTotal += n;
    }

    let top = 0;
    let topValue: string | null = null;
    for (const [value, n] of remaining) {
      if (n > top) {
        top = n;
        topValue = value;
      }
    }

    const confidence = remainingTotal === 0 ? 0 : top / remainingTotal;
    // The attacker claims only when one value is left, or when what is left is certain.
    const inferred = remaining.size === 1 ? topValue : confidence >= 1 ? topValue : null;

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

/**
 * How many eliminating facts it takes to determine each target's value. Reported as a
 * distribution, because "l = 4" claims three facts are needed and the true figure is
 * usually one or two once the class distribution is uneven.
 */
export function factsRequired(
  records: readonly PersonRecord[],
  set: ClassSet,
  targetIds: readonly number[],
  sensitiveColumn = 'diagnosis',
): Map<number, number> {
  const indexById = new Map<number, number>();
  for (let i = 0; i < records.length; i++) indexById.set(records[i].id, i);

  const byFrequency = [...set.populationDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => String(v));

  const histogram = new Map<number, number>();
  for (const targetId of targetIds) {
    const i = indexById.get(targetId);
    if (i === undefined) continue;
    const cls = set.classes[set.classIndex[i]];
    const actual = String(records[i].sensitive[sensitiveColumn]);

    const present = new Set<string>();
    for (const [v, n] of cls.sensitiveDistribution) if (n > 0) present.add(String(v));

    let needed = 0;
    for (const value of byFrequency) {
      if (present.size <= 1) break;
      if (value === actual) continue;
      if (present.delete(value)) needed++;
    }
    histogram.set(needed, (histogram.get(needed) ?? 0) + 1);
  }
  return histogram;
}

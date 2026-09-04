/**
 * Every attack returns this shape. PRD §6.2, CLAUDE.md §3.
 *
 * There is no method anywhere in the engine that returns "this record is identifiable"
 * without the count that justifies it. An attack is run and scored against ground truth,
 * or it does not appear in the interface.
 */

export interface TargetOutcome {
  targetId: number;
  /** The record the attack concluded was the target, or null if it could not conclude. */
  guessId: number | null;
  correct: boolean;
  /**
   * Candidates the attack narrowed to. 1 means uniquely determined.
   *
   * This matters as much as `correct`: an attack that narrows 500,000 records to three
   * has done most of the work even though it did not finish, and the interface must be
   * able to show that (CLAUDE.md §3).
   */
  candidateCount: number;
}

export interface AttackResult {
  attempted: number;
  correct: number;
  incorrect: number;
  /** No unique candidate found. */
  failed: number;
  perTarget: TargetOutcome[];
}

/**
 * A disclosure attack does not name a person; it learns a sensitive value about one.
 * Scored the same way — against the truth, with the confidence that justified the claim.
 */
export interface InferenceOutcome {
  targetId: number;
  /** The class the target was placed in. */
  classKey: string;
  classSize: number;
  inferred: string | null;
  actual: string;
  correct: boolean;
  /** Share of the class holding the inferred value. 1 means certainty. */
  confidence: number;
}

export interface InferenceResult {
  attempted: number;
  correct: number;
  incorrect: number;
  failed: number;
  perTarget: InferenceOutcome[];
  /**
   * Correct inferences the attacker would have made anyway from the population
   * distribution alone. Subtracting this is what separates disclosure from a good guess,
   * and reporting an inference attack without it overstates the finding.
   */
  baselineCorrect: number;
}

export function emptyResult(): AttackResult {
  return { attempted: 0, correct: 0, incorrect: 0, failed: 0, perTarget: [] };
}

export function scoreOutcomes(outcomes: TargetOutcome[]): AttackResult {
  let correct = 0;
  let incorrect = 0;
  let failed = 0;
  for (const o of outcomes) {
    if (o.guessId === null) failed++;
    else if (o.correct) correct++;
    else incorrect++;
  }
  return { attempted: outcomes.length, correct, incorrect, failed, perTarget: outcomes };
}

export function scoreInferences(
  outcomes: InferenceOutcome[],
  baselineCorrect: number,
): InferenceResult {
  let correct = 0;
  let incorrect = 0;
  let failed = 0;
  for (const o of outcomes) {
    if (o.inferred === null) failed++;
    else if (o.correct) correct++;
    else incorrect++;
  }
  return {
    attempted: outcomes.length,
    correct,
    incorrect,
    failed,
    perTarget: outcomes,
    baselineCorrect,
  };
}

/**
 * How far an attack got, for the interface. Reported with denominators, never as a bare
 * percentage (DESIGN §7).
 */
export function narrowedTo(result: AttackResult, atMost: number): number {
  let n = 0;
  for (const o of result.perTarget) if (o.candidateCount <= atMost) n++;
  return n;
}

/**
 * The privacy budget. PRD §5.7.
 *
 * Sequential composition, additive in v1: answering k queries at epsilon_i each is
 * epsilon-differentially private for the sum of the epsilon_i.
 *
 * Advanced composition — the sqrt(k log(1/delta)) bound that lets a large number of
 * queries cost less than their sum — is out of scope, and is named as out of scope in
 * the interface (CLAUDE.md §5), because a user who has read about it will notice its
 * absence and should not have to wonder whether the app is wrong or merely simpler.
 *
 * There is no refill. That is the property being taught.
 */
import type { Query } from './sensitivity';
import type { NoisyAnswer } from './laplace';

export interface BudgetEntry {
  index: number;
  query: Query;
  epsilon: number;
  /** Delta, for Gaussian answers. Zero for Laplace. */
  delta: number;
  answer: NoisyAnswer;
  /** Budget remaining after this query. */
  remaining: number;
}

export interface Budget {
  allotted: number;
  spent: number;
  remaining: number;
  entries: BudgetEntry[];
  /** Accumulated delta, which composes additively too. */
  deltaSpent: number;
}

export function newBudget(allotted: number): Budget {
  return { allotted, spent: 0, remaining: allotted, entries: [], deltaSpent: 0 };
}

export class BudgetExhaustedError extends Error {
  constructor(readonly requested: number, readonly remaining: number) {
    super(
      `This query costs ${requested} and ${remaining} remains. The budget does not refill.`,
    );
    this.name = 'BudgetExhaustedError';
  }
}

export function canAfford(budget: Budget, epsilon: number): boolean {
  // Tolerance for floating-point accumulation, so a budget of 1.0 spent as ten 0.1s is
  // exhausted rather than leaving a sliver that permits an eleventh query.
  return epsilon <= budget.remaining + 1e-9;
}

/**
 * Charge a query to the budget. Pure: returns a new budget rather than mutating, so the
 * meter can animate between two states and a case can be replayed.
 */
export function charge(
  budget: Budget,
  query: Query,
  answer: NoisyAnswer,
  delta = 0,
): Budget {
  if (!canAfford(budget, answer.epsilon)) {
    throw new BudgetExhaustedError(answer.epsilon, budget.remaining);
  }
  const spent = budget.spent + answer.epsilon;
  const remaining = Math.max(0, budget.allotted - spent);
  return {
    allotted: budget.allotted,
    spent,
    remaining,
    deltaSpent: budget.deltaSpent + delta,
    entries: [
      ...budget.entries,
      {
        index: budget.entries.length,
        query,
        epsilon: answer.epsilon,
        delta,
        answer,
        remaining,
      },
    ],
  };
}

/** Total epsilon a sequence of queries would cost. Sequential composition is a sum. */
export function totalCost(epsilons: readonly number[]): number {
  let total = 0;
  for (const e of epsilons) total += e;
  return total;
}

/** How many queries at this epsilon the remaining budget affords. */
export function queriesRemaining(budget: Budget, epsilon: number): number {
  if (epsilon <= 0) return Infinity;
  return Math.floor((budget.remaining + 1e-9) / epsilon);
}

/**
 * The statement the interface makes about what is out of scope. Named rather than
 * omitted, per CLAUDE.md §5.
 */
export const COMPOSITION_SCOPE =
  'Composition here is sequential and additive: k queries at epsilon each cost k·epsilon. ' +
  'Advanced composition, which bounds the cost of many queries nearer sqrt(k)·epsilon at the price of a delta, is out of scope in this version.';

/**
 * The five cases plus sandbox. PRD §4.4, DESIGN §4.2.
 *
 * Each case is an attack the user performs, followed by the defense that closes it,
 * followed by the attack that beats that defense. A case is complete when its attack has
 * been performed and its defense applied; the next unlocks.
 *
 * The departure from the rest of the family is deliberate and documented (DESIGN §9):
 * five defenses each defeated by the next attack is a sequence with a dependency order,
 * and exposing all of it at once would be a wall of controls.
 */

export type CaseId = 'linkage' | 'k-anonymity' | 'l-diversity' | 'aggregates' | 'budget' | 'sandbox';

export interface CaseDefinition {
  id: CaseId;
  index: number;
  title: string;
  /** One line, shown in the header beside the case number. */
  summary: string;
}

export const CASES: readonly CaseDefinition[] = [
  {
    id: 'linkage',
    index: 1,
    title: 'The linkage',
    summary: 'Two tables, neither identifying. One join.',
  },
  {
    id: 'k-anonymity',
    index: 2,
    title: 'k-anonymity, and homogeneity',
    summary: 'Generalise until k is satisfied. Then learn a diagnosis anyway.',
  },
  {
    id: 'l-diversity',
    index: 3,
    title: 'l-diversity, and skewness',
    summary: 'Enforce diversity. Then find near-certainty inside it.',
  },
  {
    id: 'aggregates',
    index: 4,
    title: 'The aggregates',
    summary: 'No record-level data. Two averages. One subtraction.',
  },
  {
    id: 'budget',
    index: 5,
    title: 'Differential privacy, and the budget',
    summary: 'A guarantee that holds regardless of auxiliary knowledge, and its price.',
  },
  {
    id: 'sandbox',
    index: 6,
    title: 'Sandbox',
    summary: 'Every control, free composition.',
  },
];

export function caseById(id: CaseId): CaseDefinition {
  const found = CASES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown case ${id}`);
  return found;
}

/** Progress is local only, never serialised to the URL (CLAUDE.md §9). */
export const PROGRESS_KEY = 'linkage.progress.v1';

export function loadProgress(): CaseId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is CaseId => CASES.some((c) => c.id === v));
  } catch {
    return [];
  }
}

export function saveProgress(completed: readonly CaseId[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed));
  } catch {
    // Storage unavailable. Progress is a convenience, not a requirement.
  }
}

export function isUnlocked(id: CaseId, completed: readonly CaseId[]): boolean {
  const definition = caseById(id);
  if (definition.index === 1) return true;
  const previous = CASES[definition.index - 2];
  return completed.includes(previous.id);
}

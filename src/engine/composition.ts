/**
 * Composition of releases. PRD §4.2, the composition row of the attack table.
 *
 * k-anonymity is a property of one release. It is not a property of a publisher.
 *
 * Two tables drawn from the same people, each generalised differently and each
 * satisfying k on its own, partition that population two different ways. An attacker
 * holding both is not restricted to either partition: they are restricted to the
 * intersection, and intersecting two partitions can only cut classes, never merge them.
 * So a 5-anonymous release published twice is not 5-anonymous twice. It is whatever the
 * intersection turns out to be, which is routinely 1.
 *
 * This is the commonest way a correctly anonymised dataset stops being anonymised, and
 * it needs no new capability to exploit: the attacker performs the same join twice and
 * keeps the rows that agree. Textbook, and out of the literature rather than out of this
 * app (PRD §0.3).
 *
 * The assumption, which the interface must state at the point of use: the attacker knows
 * the two releases describe the same people and can align them row for row. Two releases
 * of *different* populations compose to nothing. Where the alignment is itself uncertain,
 * the joint class is an upper bound on the attacker's advantage rather than a
 * measurement of it.
 */
import { buildClasses, type ClassOptions, type ClassSet } from './classes';
import type { PersonRecord } from './types';

/**
 * Separator between the two releases' keys.
 *
 * A real unit separator rather than a printable character, because a generalised key is
 * built from arbitrary column values and any printable choice could collide with one.
 * A collision here would silently merge two distinct joint classes, which would
 * understate the attack.
 */
export const RELEASE_SEPARATOR = '\u001f';

/** Concatenate two index-aligned key arrays into the key an attacker holding both has. */
export function jointKeys(
  keysA: readonly string[],
  keysB: readonly string[],
): string[] {
  if (keysA.length !== keysB.length) {
    throw new Error(
      `composition needs index-aligned releases: ${keysA.length} keys against ${keysB.length}`,
    );
  }
  const out: string[] = new Array(keysA.length);
  for (let i = 0; i < keysA.length; i++) out[i] = keysA[i] + RELEASE_SEPARATOR + keysB[i];
  return out;
}

export interface RecordNarrowing {
  recordId: number;
  /** Class size in release A alone. */
  sizeA: number;
  sizeB: number;
  /** Class size for an attacker holding both. Never larger than either. */
  sizeJoint: number;
}

export interface CompositionResult {
  /** Each release on its own, as a steward would have assessed it before publishing. */
  a: ClassSet;
  b: ClassSet;
  /** What an attacker holding both is left with. */
  joint: ClassSet;
  /**
   * Records whose joint class is strictly smaller than the smaller of their two release
   * classes. These are the people the second release cost, and the count is what makes
   * the finding a measurement rather than a warning (PRD §6.2).
   */
  narrowed: RecordNarrowing[];
  /** Records alone in the joint partition but alone in neither release on its own. */
  newlyAlone: number;
}

/**
 * Compose two releases of the same population.
 *
 * `keysA` and `keysB` are both index-aligned with `records`, which encodes the alignment
 * assumption in the signature: this function cannot be handed two unrelated tables.
 */
export function composeReleases(
  records: readonly PersonRecord[],
  keysA: readonly string[],
  keysB: readonly string[],
  options: ClassOptions = {},
): CompositionResult {
  const a = buildClasses(records, keysA, options);
  const b = buildClasses(records, keysB, options);
  const joint = buildClasses(records, jointKeys(keysA, keysB), options);

  const narrowed: RecordNarrowing[] = [];
  let newlyAlone = 0;

  for (let i = 0; i < records.length; i++) {
    const sizeA = a.classes[a.classIndex[i]].members.length;
    const sizeB = b.classes[b.classIndex[i]].members.length;
    const sizeJoint = joint.classes[joint.classIndex[i]].members.length;
    const smaller = Math.min(sizeA, sizeB);
    if (sizeJoint < smaller) {
      narrowed.push({ recordId: records[i].id, sizeA, sizeB, sizeJoint });
      if (sizeJoint === 1 && smaller > 1) newlyAlone += 1;
    }
  }

  // Worst first: the reader wants the people the composition cost the most.
  narrowed.sort((x, y) => x.sizeJoint - y.sizeJoint || x.recordId - y.recordId);

  return { a, b, joint, narrowed, newlyAlone };
}

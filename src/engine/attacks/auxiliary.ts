/**
 * The attacker's roll, at the quality the attacker actually has it.
 *
 * `runLinkage` has always taken released keys and auxiliary keys as separate arguments,
 * and its own comment says the second is "what the attacker's roll carries, at whatever
 * precision they have". Every case in the app passes the same array twice, which models
 * an adversary holding a complete, current, error-free register of the same people. That
 * adversary does not exist, and the count the app reports under that assumption is a
 * ceiling rather than an estimate.
 *
 * This module degrades a roll along the two axes a steward will raise first:
 *
 *   coverage   The roll does not list everyone. An electoral roll omits minors, the
 *              unregistered, and anyone who moved in since it was compiled. A target the
 *              attacker cannot look up is a target they cannot place, and the attack
 *              scores it as attempted and failed rather than quietly dropping it.
 *
 *   error      The roll lists someone with a stale or wrong attribute. Somebody moved
 *              kecamatan, a birthdate was transcribed wrong, a record was never updated.
 *              The attacker joins on what the roll says, so a wrong attribute sends them
 *              to the wrong class or to no class at all.
 *
 * Both are models of an adversary, not measurements of one, and the interface has to say
 * so where it shows them. What they buy is the shape of the curve: how fast the
 * re-identification count falls as the roll gets worse, which is the reading that turns
 * a single dramatic number into a range a steward can reason about.
 *
 * Seeded and pure, like everything else in the engine (CLAUDE.md §3, §5).
 */
import { makeRng } from '../rng';
import { KEY_SEPARATOR } from '../generalise';

/**
 * The key given to a record the roll does not list.
 *
 * It is a sentinel rather than an empty string so that two uncovered records never match
 * each other, and it carries a control character so it cannot collide with a generalised
 * key built from real column values. `runLinkage` looks it up, finds nothing, and scores
 * the target as failed with a candidate count of zero, which needs no change there.
 */
export const ABSENT_FROM_ROLL = '\u001eabsent';

export interface RollQuality {
  /** Share of the population the roll lists, 0 to 1. */
  coverage: number;
  /** Share of listed records carrying at least one wrong quasi-identifier, 0 to 1. */
  errorRate: number;
  /** Stream seed, so a roll is reproducible from the configuration (CLAUDE.md §9). */
  seed: number;
}

export interface DegradedRoll {
  /** Index-aligned with the population. Absent records carry ABSENT_FROM_ROLL. */
  keys: string[];
  /** How many records the roll lists. */
  listed: number;
  /** How many of the listed records carry a wrong attribute. */
  wrong: number;
  /** Population size, so every count above can be shown with its denominator. */
  population: number;
}

/**
 * Degrade a roll.
 *
 * `keys` is what a perfect roll would carry, index-aligned with the population. The
 * result is what this attacker's roll carries instead.
 *
 * The error model, stated plainly because the app has to defend it: one component of the
 * key is replaced with the corresponding component from another record drawn uniformly.
 * That models a stale field rather than random noise, and it is deliberately not the
 * worst case. Replacing a component with a value nobody holds would send the attacker to
 * an empty class every time, which flatters the defense; taking a value somebody does
 * hold can send them to a wrong but populated class, which is what actually happens.
 */
export function degradeRoll(
  keys: readonly string[],
  quality: RollQuality,
): DegradedRoll {
  const coverage = clamp01(quality.coverage);
  const errorRate = clamp01(quality.errorRate);
  const rng = makeRng(quality.seed);
  const n = keys.length;

  const out: string[] = new Array(n);
  let listed = 0;
  let wrong = 0;

  // Split once. Every key in a release shares its column count, so the component index
  // drawn below addresses the same column for every record.
  const parts: string[][] = new Array(n);
  for (let i = 0; i < n; i++) parts[i] = keys[i].split(KEY_SEPARATOR);
  const columns = n === 0 ? 0 : parts[0].length;

  for (let i = 0; i < n; i++) {
    if (rng.next() >= coverage) {
      out[i] = ABSENT_FROM_ROLL;
      continue;
    }
    listed += 1;

    if (columns > 1 && rng.next() < errorRate) {
      const column = rng.int(columns);
      const donor = rng.int(n);
      const mine = parts[i].slice();
      mine[column] = parts[donor][column];
      const corrupted = mine.join(KEY_SEPARATOR);
      // A donor who happens to share the value leaves the key unchanged, so the record
      // is listed correctly and is not counted as wrong. Counting it would overstate the
      // degradation and make the readout disagree with the join.
      if (corrupted !== keys[i]) wrong += 1;
      out[i] = corrupted;
      continue;
    }

    out[i] = keys[i];
  }

  return { keys: out, listed, wrong, population: n };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

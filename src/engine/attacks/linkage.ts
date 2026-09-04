/**
 * Linkage. PRD §4.2, the founding attack.
 *
 * Threat model: the attacker holds a public roll — a voter register, an electoral roll,
 * a staff directory — carrying identity alongside ordinary attributes, and a released
 * table carrying those same attributes alongside a sensitive one. Neither identifies
 * anyone alone. The join is the attack.
 *
 * Sweeney bought Massachusetts voter registration records for twenty dollars and linked
 * them to hospital discharge data. Nothing here is more sophisticated than that.
 */
import type { PersonRecord } from '../types';
import { scoreOutcomes, type AttackResult, type TargetOutcome } from './types';

export interface LinkageOptions {
  /**
   * Quasi-identifier columns the auxiliary roll carries. The attack is only as strong as
   * the overlap, which is the point of making it a parameter rather than a constant.
   */
  columns: readonly string[];
  /** Record ids the attacker is trying to place. */
  targetIds: readonly number[];
}

export interface LinkageRow {
  recordId: number;
  key: string;
  /** Ids in the released table sharing this key. */
  matches: number[];
}

export interface LinkageDetail extends AttackResult {
  /** Per-target join detail, for the two-table view (DESIGN §5.2). */
  rows: LinkageRow[];
  /** Distinct keys in the released table, and how many rows each covers. */
  releasedKeyCounts: Map<string, number>;
}

/**
 * Run the join.
 *
 * `releasedKeys` is index-aligned with `records` and is the *generalised* key — the
 * defense, if one has been applied. `auxiliaryKeys` is what the attacker's roll carries,
 * at whatever precision they have. Passing both explicitly is what lets case 1 show a
 * raw join and case 2 show the same join defeated by generalisation, with no branching.
 */
export function runLinkage(
  records: readonly PersonRecord[],
  releasedKeys: readonly string[],
  auxiliaryKeys: readonly string[],
  options: LinkageOptions,
): LinkageDetail {
  const byKey = new Map<string, number[]>();
  for (let i = 0; i < records.length; i++) {
    const bucket = byKey.get(releasedKeys[i]);
    if (bucket) bucket.push(records[i].id);
    else byKey.set(releasedKeys[i], [records[i].id]);
  }

  const indexById = new Map<number, number>();
  for (let i = 0; i < records.length; i++) indexById.set(records[i].id, i);

  const outcomes: TargetOutcome[] = [];
  const rows: LinkageRow[] = [];

  for (const targetId of options.targetIds) {
    const idx = indexById.get(targetId);
    if (idx === undefined) continue;
    const key = auxiliaryKeys[idx];
    const matches = byKey.get(key) ?? [];
    rows.push({ recordId: targetId, key, matches });

    // A unique match is an identification. Anything else is a narrowing, and the count
    // is reported rather than rounded to "failed".
    const guessId = matches.length === 1 ? matches[0] : null;
    outcomes.push({
      targetId,
      guessId,
      correct: guessId === targetId,
      candidateCount: matches.length,
    });
  }

  const releasedKeyCounts = new Map<string, number>();
  for (const [key, ids] of byKey) releasedKeyCounts.set(key, ids.length);

  return { ...scoreOutcomes(outcomes), rows, releasedKeyCounts };
}

/**
 * The auxiliary roll the attacker is assumed to hold, as a table for the linkage view.
 * It carries identity and quasi-identifiers, and no sensitive value — that is the whole
 * asymmetry the attack exploits.
 */
export interface AuxiliaryRow {
  recordId: number;
  name: string;
  values: Record<string, string>;
  key: string;
}

export function buildAuxiliaryRoll(
  records: readonly PersonRecord[],
  keys: readonly string[],
  columns: readonly string[],
  ids: readonly number[],
): AuxiliaryRow[] {
  const indexById = new Map<number, number>();
  for (let i = 0; i < records.length; i++) indexById.set(records[i].id, i);
  const out: AuxiliaryRow[] = [];
  for (const id of ids) {
    const i = indexById.get(id);
    if (i === undefined) continue;
    const values: Record<string, string> = {};
    for (const c of columns) values[c] = String(records[i].quasi[c]);
    out.push({ recordId: id, name: records[i].identity.name, values, key: keys[i] });
  }
  return out;
}

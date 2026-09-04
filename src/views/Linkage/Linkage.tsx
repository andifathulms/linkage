/**
 * The linkage view. DESIGN.md §5.2, §6.4.
 *
 * Two tables approaching each other. Rows connect where quasi-identifiers match.
 * Ambiguous matches fade. A row matching exactly one row on the other side resolves.
 *
 * The resolution is quiet. No flash, no expansion, no sound. A record has simply become
 * identified, and the design's refusal to celebrate that is the register the whole app
 * is in.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PersonRecord } from '../../engine/types';
import { runLinkage, buildAuxiliaryRoll } from '../../engine/attacks/linkage';
import { usePrefersReducedMotion } from '../../ui/useReducedMotion';
import { Count } from '../../ui/primitives';

export interface LinkageProps {
  records: readonly PersonRecord[];
  releasedKeys: readonly string[];
  auxiliaryKeys: readonly string[];
  columns: readonly string[];
  targetIds: readonly number[];
  /** Rows to draw. The full attack is scored over every target; the view shows a slice. */
  visibleCount?: number;
  onScored?: (correct: number, attempted: number) => void;
}

interface DrawnRow {
  recordId: number;
  name: string;
  values: Record<string, string>;
  matches: number[];
  resolved: boolean;
}

export function Linkage({
  records,
  releasedKeys,
  auxiliaryKeys,
  columns,
  targetIds,
  visibleCount = 12,
  onScored,
}: LinkageProps) {
  const reducedMotion = usePrefersReducedMotion();

  const result = useMemo(
    () => runLinkage(records, releasedKeys, auxiliaryKeys, { columns, targetIds }),
    [records, releasedKeys, auxiliaryKeys, columns, targetIds],
  );

  const visible = useMemo<DrawnRow[]>(() => {
    const ids = targetIds.slice(0, visibleCount);
    const roll = buildAuxiliaryRoll(records, auxiliaryKeys, columns, ids);
    const byId = new Map(result.rows.map((r) => [r.recordId, r]));
    return roll.map((row) => {
      const detail = byId.get(row.recordId);
      return {
        recordId: row.recordId,
        name: row.name,
        values: row.values,
        matches: detail?.matches ?? [],
        resolved: (detail?.matches.length ?? 0) === 1,
      };
    });
  }, [records, auxiliaryKeys, columns, targetIds, visibleCount, result]);

  // Rows resolve one after another, in order, over the join duration. Discrete control
  // — the attack was executed — so a timed transition (DESIGN §6.1).
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (reducedMotion) {
      setRevealed(visible.length);
      return;
    }
    setRevealed(0);
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i += 1;
      setRevealed(i);
      if (i < visible.length) window.setTimeout(tick, 400 / Math.max(1, visible.length));
    };
    const handle = window.setTimeout(tick, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [visible, reducedMotion]);

  useEffect(() => {
    onScored?.(result.correct, result.attempted);
  }, [result, onScored]);

  const byId = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  return (
    <div className="linkage">
      <div className="linkage__scored">
        <Count of={result.correct} total={result.attempted} label="targets uniquely identified" />
        <span className="note">
          {result.failed.toLocaleString('en')} not determined.{' '}
          {result.perTarget.filter((t) => t.candidateCount > 1 && t.candidateCount <= 5).length.toLocaleString('en')}{' '}
          narrowed to five candidates or fewer.
        </span>
      </div>

      <div className="linkage__tables">
        <table className="table linkage__table linkage__table--auxiliary">
          <caption className="panel__title">
            Public roll — identity and ordinary attributes, no sensitive value
          </caption>
          <thead>
            <tr>
              <th>Name</th>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={row.recordId} data-state={i < revealed && row.resolved ? 'matched' : 'pending'}>
                <td>{row.name}</td>
                {columns.map((c) => (
                  <td key={c}>{row.values[c]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="linkage__joins" aria-hidden="true">
          {visible.map((row, i) => (
            <li
              key={row.recordId}
              className="linkage__join"
              data-state={
                i >= revealed ? 'pending' : row.resolved ? 'resolved' : row.matches.length === 0 ? 'none' : 'ambiguous'
              }
            >
              <span className="linkage__joinCount">
                {row.matches.length === 1 ? '1' : row.matches.length === 0 ? '0' : `${row.matches.length}`}
              </span>
            </li>
          ))}
        </ul>

        <table className="table linkage__table linkage__table--released">
          <caption className="panel__title">
            Released table — names removed, sensitive value present
          </caption>
          <thead>
            <tr>
              <th>Record</th>
              <th>Diagnosis</th>
              <th className="num">Candidates</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const matched = row.resolved ? byId.get(row.matches[0]) : null;
              const shown = i < revealed;
              return (
                <tr key={row.recordId} data-state={shown && row.resolved ? 'matched' : 'pending'}>
                  <td>{shown && matched ? matched.nik : '—'}</td>
                  <td>{shown && matched ? String(matched.sensitive.diagnosis) : '—'}</td>
                  <td className="num">{shown ? row.matches.length : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

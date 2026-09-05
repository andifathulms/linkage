/**
 * Two releases of the same population. PRD §4.2, the composition row.
 *
 * The threat model first, then the attack that defeats the defense (PRD §6.3). The
 * defense here is k-anonymity applied correctly, twice. The attack is holding both.
 *
 * The second vector is a control on this view rather than part of the shared
 * configuration, because it describes a hypothetical second release rather than the
 * population the URL is about (CLAUDE.md §9).
 */
import { useMemo, useState } from 'react';
import type { PersonRecord, GeneralisationVector } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import { generalisePopulation } from '../../engine/generalise';
import { composeReleases } from '../../engine/composition';
import { Finding, Readout, Slider, ThreatModel } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

export interface CompositionProps {
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  columns: readonly string[];
  /** The release already configured elsewhere in the sandbox. */
  vector: GeneralisationVector;
  seed: number;
}

export function Composition({ records, taxonomy, columns, vector, seed }: CompositionProps) {
  /**
   * The second release starts one step coarser on region and one finer on date, which is
   * the shape of the real mistake: a different analyst asked for a different cut, and
   * nobody compared the two.
   */
  const [second, setSecond] = useState<GeneralisationVector>(() => {
    const v: GeneralisationVector = {};
    for (const c of columns) {
      const height = (taxonomy[c]?.levels.length ?? 1) - 1;
      const base = vector[c] ?? 0;
      v[c] = c === 'kelurahan' ? Math.min(height, base + 1) : Math.max(0, base - 1);
    }
    return v;
  });

  const result = useMemo(() => {
    const keysA = generalisePopulation(records, taxonomy, vector, columns);
    const keysB = generalisePopulation(records, taxonomy, second, columns);
    return composeReleases(records, keysA, keysB);
  }, [records, taxonomy, vector, second, columns]);

  const exportNarrowed = () => {
    const csv = toCsv(
      ['record_id', 'class_size_release_a', 'class_size_release_b', 'class_size_joint'],
      result.narrowed.map((n) => [n.recordId, n.sizeA, n.sizeB, n.sizeJoint]),
    );
    downloadCsv(`linkage-composition-seed-${seed}.csv`, csv);
  };

  return (
    <section className="panel" aria-label="Composition of two releases">
      <div className="panel__title">Two releases</div>

      <ThreatModel
        assumes={
          <>
            k-anonymity assumes the attacker sees one release. Every class in it holds at least k
            people, so no row can be told from its neighbours.
          </>
        }
        defeatedBy={
          <>
            A second release of the same people, generalised differently. Each release partitions
            the population its own way, and an attacker holding both is confined to the
            intersection. Intersecting partitions can only cut classes, never merge them.
          </>
        }
      />

      <div className="readout" style={{ padding: 'var(--s-3) 0' }}>
        <Readout label="Smallest class, release A" value={result.a.k.toLocaleString('en')} />
        <Readout label="Smallest class, release B" value={result.b.k.toLocaleString('en')} />
        <Readout
          label="Smallest class, holding both"
          value={result.joint.k.toLocaleString('en')}
          exposed={result.joint.k < Math.min(result.a.k, result.b.k)}
        />
      </div>

      <Finding
        of={result.newlyAlone}
        total={records.length}
        label="records standing alone once both releases are held"
        detail={
          <>
            Alone in neither release on its own. {result.narrowed.length.toLocaleString('en')}{' '}
            records in total sit in a smaller class than either release put them in.
          </>
        }
        exposed={result.newlyAlone > 0}
      />

      <div style={{ marginTop: 'var(--s-3)' }}>
        <div className="panel__title">The second release</div>
        {columns.map((column) => {
          const t = taxonomy[column];
          if (!t) return null;
          const level = second[column] ?? 0;
          return (
            <Slider
              key={column}
              label={t.label}
              value={level}
              min={0}
              max={t.levels.length - 1}
              onChange={(next) => setSecond({ ...second, [column]: next })}
              display={t.levels[level].label}
            />
          );
        })}
      </div>

      <p className="note" style={{ marginTop: 'var(--s-3)' }}>
        This assumes the attacker knows both releases describe the same people and can align them
        row for row. Two releases of different populations compose to nothing, and where the
        alignment is itself uncertain the joint class is an upper bound on what the attacker has
        rather than a measurement of it.
      </p>

      {result.narrowed.length > 0 && (
        <>
          <table className="table" style={{ marginTop: 'var(--s-3)' }}>
            <caption className="panel__title">Records the second release cost the most</caption>
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">In release A</th>
                <th scope="col">In release B</th>
                <th scope="col">Holding both</th>
              </tr>
            </thead>
            <tbody>
              {result.narrowed.slice(0, 12).map((n) => (
                <tr key={n.recordId}>
                  <td>{n.recordId}</td>
                  <td>{n.sizeA.toLocaleString('en')}</td>
                  <td>{n.sizeB.toLocaleString('en')}</td>
                  <td>{n.sizeJoint.toLocaleString('en')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
            <button type="button" className="button button--quiet" onClick={exportNarrowed}>
              Export the narrowing as CSV
            </button>
          </div>
        </>
      )}
    </section>
  );
}

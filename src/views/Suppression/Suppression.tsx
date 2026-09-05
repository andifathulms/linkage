/**
 * Who pays for k.
 *
 * When generalisation alone will not reach the target, the standard remedy is to drop
 * the records that still fail it. The app reports that as a count elsewhere. A count is
 * true and it is not the finding.
 *
 * The finding is that the records dropped are not a random slice. A record fails k
 * because few people share its quasi-identifier, which means it was rare, and rarity in
 * an administrative population is not evenly spread.
 *
 * On register (DESIGN §7): this view reports the distribution and stops. It does not say
 * the result is unfair, does not recommend against anonymising, and does not dramatise.
 */
import { useMemo } from 'react';
import type { PersonRecord, GeneralisationVector, Value } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import { generalisePopulation } from '../../engine/generalise';
import { suppressToK } from '../../engine/suppression';
import { Finding, Readout } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

export interface SuppressionProps {
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  columns: readonly string[];
  vector: GeneralisationVector;
  targetK: number;
  seed: number;
}

/** Age is ordered, so its distance uses the ordinal formula (Li et al.). */
const ORDINAL = ['age'];

export function Suppression({
  records,
  taxonomy,
  columns,
  vector,
  targetK,
  seed,
}: SuppressionProps) {
  const result = useMemo(() => {
    const keys = generalisePopulation(records, taxonomy, vector, columns);
    return suppressToK(records, keys, targetK, { columns, ordinalColumns: ORDINAL });
  }, [records, taxonomy, vector, columns, targetK]);

  const exportSkew = () => {
    const csv = toCsv(
      ['column', 'value', 'suppressed', 'population', 'suppressed_share', 'population_share'],
      result.columns.flatMap((c) =>
        c.order.map((value: Value) => {
          const s = c.suppressed.get(value) ?? 0;
          const p = c.population.get(value) ?? 0;
          return [
            c.column,
            String(value),
            s,
            p,
            result.suppressed === 0 ? '0' : (s / result.suppressed).toFixed(6),
            (p / result.population).toFixed(6),
          ];
        }),
      ),
    );
    downloadCsv(`linkage-suppression-k${targetK}-seed-${seed}.csv`, csv);
  };

  return (
    <section className="panel" aria-label="Who pays for k">
      <div className="panel__title">Who pays for k</div>

      <p className="note">
        Reaching a target k by generalisation alone is often impossible without coarsening every
        column past usefulness. The remedy is to drop the records that still fail it. This is what
        that removes, at the generalisation and target now set.
      </p>

      <Finding
        of={result.suppressed}
        total={result.population}
        label={`records dropped to reach k = ${targetK}`}
        detail={
          <>
            {result.retained.toLocaleString('en')} records remain, and every class among them holds
            at least {targetK.toLocaleString('en')} people.
          </>
        }
        exposed={result.suppressed > 0}
      />

      {result.suppressed === 0 ? (
        <p className="note">
          Every class already meets the target, so nothing is dropped and there is no distribution
          to compare.
        </p>
      ) : (
        <>
          <div className="readout" style={{ padding: 'var(--s-3) 0' }}>
            {result.ranked.slice(0, 3).map((c) => (
              <Readout
                key={c.column}
                label={`${taxonomy[c.column]?.label ?? c.column}, distance from the population`}
                value={c.distance.toFixed(3)}
                exposed={c.distance > 0.2}
              />
            ))}
          </div>

          <p className="note">
            Distance is the earth mover's distance between the dropped records and the population,
            the same measure t-closeness is defined by. Zero means suppression took a
            representative slice of that column. Larger means it did not.
          </p>

          <table className="table" style={{ marginTop: 'var(--s-3)' }}>
            <caption className="panel__title">Where the cost concentrated</caption>
            <thead>
              <tr>
                <th scope="col">Column</th>
                <th scope="col">Distance</th>
                <th scope="col">Value most affected</th>
                <th scope="col">Of those dropped</th>
                <th scope="col">Of the population</th>
              </tr>
            </thead>
            <tbody>
              {result.ranked.map((c) => (
                <tr key={c.column}>
                  <td>{taxonomy[c.column]?.label ?? c.column}</td>
                  <td>{c.distance.toFixed(3)}</td>
                  <td>{c.mostAffected ? String(c.mostAffected.value) : ''}</td>
                  <td>
                    {c.mostAffected
                      ? `${c.mostAffected.suppressedCount.toLocaleString('en')} of ${result.suppressed.toLocaleString('en')}`
                      : ''}
                  </td>
                  <td>
                    {c.mostAffected
                      ? `${c.mostAffected.populationCount.toLocaleString('en')} of ${result.population.toLocaleString('en')}`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
            <button type="button" className="button button--quiet" onClick={exportSkew}>
              Export the distributions as CSV
            </button>
          </div>
        </>
      )}
    </section>
  );
}

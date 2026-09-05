/**
 * The assessor's estimate, against the population it is estimating.
 *
 * The schema assessor ranks columns by leave-one-out contribution, computed from
 * declared cardinalities under an assumption it states: that the columns are independent
 * and that records spread uniformly over the resulting cells. Stating an assumption is
 * the right thing to do and it is not the same as measuring what the assumption costs.
 *
 * Here both are available. The estimate is computed with the assessor's own estimator on
 * the cardinalities this population actually has, so the estimator and its inputs are
 * held fixed and the only difference is the assumption. The measurement is computed by
 * grouping the records.
 *
 * The copy below reports the two numbers and their difference and does not characterise
 * the difference, because the direction is a property of the population rather than a
 * general fact about the estimator, and the app does not assert what it has not measured
 * (PRD §6.2).
 */
import { useMemo } from 'react';
import type { PersonRecord, GeneralisationVector } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import { generalisePopulation } from '../../engine/generalise';
import { attributeUniqueness } from '../../engine/attribution';
import { Readout } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

export interface AttributionProps {
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  columns: readonly string[];
  vector: GeneralisationVector;
  seed: number;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function Attribution({ records, taxonomy, columns, vector, seed }: AttributionProps) {
  const report = useMemo(() => {
    const keys = generalisePopulation(records, taxonomy, vector, columns);
    return attributeUniqueness(keys, columns);
  }, [records, taxonomy, vector, columns]);

  const exportReport = () => {
    const csv = toCsv(
      [
        'column',
        'cardinality',
        'measured_without',
        'estimated_without',
        'measured_contribution',
        'estimated_contribution',
      ],
      report.ranked.map((c) => [
        c.column,
        c.cardinality,
        c.measuredWithout.toFixed(6),
        c.estimatedWithout.toFixed(6),
        c.measuredContribution.toFixed(6),
        c.estimatedContribution.toFixed(6),
      ]),
    );
    downloadCsv(`linkage-attribution-seed-${seed}.csv`, csv);
  };

  return (
    <section className="panel" aria-label="The estimate against the population">
      <div className="panel__title">The estimate, against the population</div>

      <p className="note">
        The assessor cannot see a dataset, so it estimates uniqueness from declared cardinalities,
        assuming the columns are independent and that records spread uniformly across the
        combinations. Here the population is generated, so the same estimator can be run on the
        cardinalities this population has and compared against what the records actually do. The
        estimator and its inputs are identical on both sides; only the assumption differs.
      </p>

      <div className="readout" style={{ padding: 'var(--s-3) 0' }}>
        <Readout label="Measured, by grouping the records" value={pct(report.measuredUniqueness)} />
        <Readout label="Estimated, under the assumption" value={pct(report.estimatedUniqueness)} />
        <Readout
          label="Difference"
          value={`${report.optimism >= 0 ? '+' : ''}${(report.optimism * 100).toFixed(1)} points`}
          exposed={Math.abs(report.optimism) > 0.1}
        />
      </div>

      <p className="note">
        The difference is measured minus estimated. Where it is negative the estimate reads more
        uniqueness than the population contains, and so over-states risk; where it is positive it
        reads less, and under-states it. On this generator the region weights are deliberately
        uneven and ages are drawn from a distribution, so records concentrate into far fewer
        occupied combinations than the product of cardinalities suggests, and the departure comes
        mostly from the uniformity half of the assumption rather than from correlation between
        columns. The generator's correlation control ties the sensitive value to a region and age
        stratum; it induces no correlation among the quasi-identifiers, so the other half of the
        assumption cannot be swept here.
      </p>

      <table className="table" style={{ marginTop: 'var(--s-3)' }}>
        <caption className="panel__title">
          What each column adds beyond the others, both ways
        </caption>
        <thead>
          <tr>
            <th scope="col">Column</th>
            <th scope="col">Distinct values</th>
            <th scope="col">Measured</th>
            <th scope="col">Estimated</th>
          </tr>
        </thead>
        <tbody>
          {report.ranked.map((c) => (
            <tr key={c.column}>
              <td>{taxonomy[c.column]?.label ?? c.column}</td>
              <td>{c.cardinality.toLocaleString('en')}</td>
              <td>{pct(c.measuredContribution)}</td>
              <td>{pct(c.estimatedContribution)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="note" style={{ marginTop: 'var(--s-3)' }}>
        {report.rankingAgrees
          ? 'Both methods put the same column at the top, so a reader acting on the estimated ranking would reach for the same column first.'
          : 'The two methods disagree about which column matters most, so a reader acting on the estimated ranking would reach for the wrong column first.'}{' '}
        Leave-one-out credits a column with what it adds beyond the others, so two columns carrying
        the same information are each scored at nearly nothing even when together they decide
        everything.
      </p>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="button button--quiet" onClick={exportReport}>
          Export the comparison as CSV
        </button>
      </div>
    </section>
  );
}

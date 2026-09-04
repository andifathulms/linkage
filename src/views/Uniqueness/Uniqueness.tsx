/**
 * The uniqueness study. PRD §4.6 and §2.
 *
 * Generate populations under each author's stated assumptions, run both methodologies,
 * and report what each produces. The app does not declare Sweeney or Golle correct
 * (PRD §6.4), and this view is written so that it cannot: both figures are shown, the
 * disagreement is quoted as unresolved, and neither is styled as the answer.
 */
import { useMemo } from 'react';
import type { PersonRecord } from '../../engine/types';
import {
  reconstruct,
  PUBLISHED,
  DISAGREEMENT,
  INDEPENDENCE_ASSUMPTION,
  type UniquenessConfiguration,
} from '../../engine/uniqueness';
import { Cite } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

export interface UniquenessProps {
  records: readonly PersonRecord[];
  seed: number;
}

/** The three headline configurations, in each author's own terms. */
const CONFIGURATIONS: Array<{
  configuration: UniquenessConfiguration;
  label: string;
  /** Digits of the region code that remain visible. */
  digits: number;
}> = [
  {
    configuration: { region: 'postcode', date: 'full', gender: true },
    label: 'District, comparable to a five-digit postcode, plus gender plus full date of birth',
    digits: 6,
  },
  {
    configuration: { region: 'city', date: 'full', gender: true },
    label: 'City or town, plus gender plus full date of birth',
    digits: 4,
  },
  {
    configuration: { region: 'county', date: 'full', gender: true },
    label: 'County-equivalent, plus gender plus full date of birth',
    digits: 2,
  },
];

export function Uniqueness({ records, seed }: UniquenessProps) {
  const results = useMemo(
    () =>
      CONFIGURATIONS.map((entry) => {
        const keys: string[] = [];
        const regions: string[] = [];
        const dates = new Set<string>();
        for (const r of records) {
          const region = String(r.quasi.kelurahan).slice(0, entry.digits);
          const date = String(r.quasi.birthdate);
          dates.add(date);
          keys.push(`${region}|${date}|${r.quasi.gender}`);
          regions.push(region);
        }
        return { entry, result: reconstruct(keys, regions, entry.configuration, dates.size) };
      }),
    [records],
  );

  const exportStudy = () => {
    const csv = toCsv(
      ['configuration', 'regions', 'cells_per_region', 'empirical', 'analytic', 'divergence', 'published_author', 'published_share'],
      results.flatMap(({ entry, result }) =>
        (result.published.length > 0 ? result.published : [null]).map((p) => [
          entry.label,
          result.regionCount,
          result.cellsPerRegion,
          result.empirical.toFixed(6),
          result.analytic.toFixed(6),
          result.divergence.toFixed(6),
          p?.author ?? '',
          p?.share ?? '',
        ]),
      ),
    );
    downloadCsv(`linkage-uniqueness-seed-${seed}.csv`, csv);
  };

  return (
    <section className="panel" aria-label="Uniqueness study">
      <div className="panel__title">The uniqueness study</div>

      <p>
        The most-cited statistic in data privacy is one two careful researchers disagree about by
        more than twenty-five percentage points. <Cite source="sweeney" /> reports 87% at postcode
        granularity on 1990 census data. <Cite source="golle" /> reports 63% on 2000 data, and 61%
        re-running Sweeney's own 1990 data.
      </p>
      <p className="note">{DISAGREEMENT}</p>

      <div className="table__scroll" style={{ marginTop: 'var(--s-3)' }}>
        <table className="table">
          <caption className="panel__title">
            Both methodologies, run on a generated population of {records.length.toLocaleString('en')} where the
            truth is known
          </caption>
          <thead>
            <tr>
              <th>Configuration</th>
              <th className="num">Regions</th>
              <th className="num">Counted directly</th>
              <th className="num">Analytic estimate</th>
              <th className="num">Divergence</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ entry, result }) => (
              <tr key={entry.label}>
                <td style={{ whiteSpace: 'normal', maxWidth: '20rem' }}>{entry.label}</td>
                <td className="num">{result.regionCount.toLocaleString('en')}</td>
                <td className="num">{(result.empirical * 100).toFixed(1)}%</td>
                <td className="num">{(result.analytic * 100).toFixed(1)}%</td>
                <td className="num">{(result.divergence * 100).toFixed(1)}pp</td>
                <td style={{ whiteSpace: 'normal' }}>
                  {result.published.map((p) => (
                    <span key={`${p.author}-${p.census}`} className="uniqueness__published">
                      {p.author} {p.census}: {(p.share * 100).toFixed(0)}%
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note" style={{ marginTop: 'var(--s-3)' }}>
        {INDEPENDENCE_ASSUMPTION}
      </p>
      <p className="note">
        The divergence column is the finding, not an error to be tuned away. Where the counted figure
        parts from the analytic one, the cause is that a real population is not spread evenly over
        birthdays or over regions, and the analytic formula assumes it is. Both authors computed
        something like the analytic figure on real data; the gap between their answers is at least
        partly a gap between two sets of assumptions about that spread, and neither paper records
        enough detail for the other to reproduce.
      </p>

      <div className="table__scroll" style={{ marginTop: 'var(--s-3)' }}>
        <table className="table">
          <caption className="panel__title">The published figures, both authors, unranked</caption>
          <thead>
            <tr>
              <th>Author</th>
              <th className="num">Census</th>
              <th>Region</th>
              <th className="num">Share</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {PUBLISHED.map((p, i) => (
              <tr key={i}>
                <td>{p.author}</td>
                <td className="num">{p.census}</td>
                <td>{p.configuration.region}</td>
                <td className="num">{(p.share * 100).toFixed(0)}%</td>
                <td style={{ whiteSpace: 'normal', maxWidth: '26rem' }}>{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="button button--quiet" onClick={exportStudy}>
          Export the study as CSV
        </button>
      </div>
    </section>
  );
}

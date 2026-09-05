/**
 * The release, and the population it came from.
 *
 * Two questions that look like one. A steward computes k on the extract in front of
 * them, which answers whether a person can be found in the extract. It does not answer
 * whether a row in the extract can be given a name, and that is decided by the
 * population, which the extract does not contain.
 *
 * The two coincide exactly when the release is the whole population, which is the case
 * every other view in this app is set up for. Move the fraction and they come apart.
 */
import { useMemo, useState } from 'react';
import type { PersonRecord, GeneralisationVector } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import { generalisePopulation } from '../../engine/generalise';
import { sampleRelease, measureRelease } from '../../engine/release';
import { Cite, Finding, Readout, Slider } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

export interface ReleaseProps {
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  columns: readonly string[];
  vector: GeneralisationVector;
  seed: number;
}

const FRACTIONS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 1];

export function Release({ records, taxonomy, columns, vector, seed }: ReleaseProps) {
  const [fraction, setFraction] = useState(0.05);

  const keys = useMemo(
    () => generalisePopulation(records, taxonomy, vector, columns),
    [records, taxonomy, vector, columns],
  );

  const risk = useMemo(() => {
    const sample = sampleRelease(records, fraction, seed);
    return measureRelease(keys, sample.indices);
  }, [records, keys, fraction, seed]);

  const series = useMemo(
    () =>
      FRACTIONS.map((f) => {
        const sample = sampleRelease(records, f, seed);
        return { fraction: f, risk: measureRelease(keys, sample.indices) };
      }),
    [records, keys, seed],
  );

  const exportSeries = () => {
    const csv = toCsv(
      [
        'fraction',
        'released',
        'population',
        'alone_in_release',
        'k_release',
        'nameable_in_population',
        'alone_but_not_nameable',
        'widest_hiding_place',
      ],
      series.map((s) => [
        s.fraction.toFixed(2),
        s.risk.released,
        s.risk.population,
        s.risk.aloneInRelease,
        s.risk.kRelease,
        s.risk.nameableInPopulation,
        s.risk.aloneButNotNameable,
        s.risk.widestHidingPlace,
      ]),
    );
    downloadCsv(`linkage-release-seed-${seed}.csv`, csv);
  };

  return (
    <section className="panel" aria-label="The release and the population">
      <div className="panel__title">The release, and the population</div>

      <p className="note">
        A release is usually an extract: a year, a programme, a province. k is a property of the
        extract, and it answers whether somebody can be found in it. Whether a released row can be
        given a name is a property of the population the row was drawn from, and the extract does
        not carry that. <Cite source="sweeney" /> reports a share of a population, not a share of
        anybody's extract, which is one reason the figure travels badly into a steward's own
        arithmetic.
      </p>

      <Slider
        label="Share of the population released"
        value={fraction}
        min={0.01}
        max={1}
        step={0.01}
        onChange={setFraction}
        display={`${Math.round(fraction * 100)}%`}
      />

      <Finding
        of={risk.aloneInRelease}
        total={risk.released}
        label="released rows standing alone in the release"
        detail={<>This is what k measures. The release reads k = {risk.kRelease.toLocaleString('en')}.</>}
        exposed={risk.aloneInRelease > 0}
      />

      <Finding
        of={risk.nameableInPopulation}
        total={risk.released}
        label="released rows that can be given a name"
        detail={
          <>
            Unique across the whole population of {risk.population.toLocaleString('en')}, so no
            other person shares the row's attributes.
          </>
        }
        exposed={risk.nameableInPopulation > 0}
      />

      <div className="readout" style={{ padding: 'var(--s-3) 0' }}>
        <Readout
          label="Alone in the release, yet not nameable"
          value={risk.aloneButNotNameable.toLocaleString('en')}
        />
        <Readout
          label="Most people sharing one such row's attributes"
          value={risk.widestHidingPlace.toLocaleString('en')}
        />
      </div>

      <p className="note">
        Where those two numbers are large, the extract's own k is describing the sampling rather
        than the risk. Where the release is the whole population they are zero by construction, and
        k means what a steward takes it to mean.
      </p>

      <table className="table" style={{ marginTop: 'var(--s-3)' }}>
        <caption className="panel__title">The same population, released at different shares</caption>
        <thead>
          <tr>
            <th scope="col">Released</th>
            <th scope="col">Rows</th>
            <th scope="col">k</th>
            <th scope="col">Alone</th>
            <th scope="col">Nameable</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.fraction}>
              <td>{Math.round(s.fraction * 100)}%</td>
              <td>{s.risk.released.toLocaleString('en')}</td>
              <td>{s.risk.kRelease.toLocaleString('en')}</td>
              <td>{s.risk.aloneInRelease.toLocaleString('en')}</td>
              <td>{s.risk.nameableInPopulation.toLocaleString('en')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="button button--quiet" onClick={exportSeries}>
          Export the series as CSV
        </button>
      </div>
    </section>
  );
}

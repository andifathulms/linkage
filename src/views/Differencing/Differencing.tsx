/**
 * The differencing bench. DESIGN.md §5.8.
 *
 * Two aggregate queries the user composes, their results, and their difference. When the
 * difference isolates a single individual, the app says so and shows which one.
 *
 * Then the same pair under differential privacy, where the difference is noise.
 */
import { useMemo, useState } from 'react';
import type { PersonRecord } from '../../engine/types';
import {
  runDifferencing,
  buildDifferencingPair,
  type AggregateQuery,
  type Predicate,
} from '../../engine/attacks/differencing';
import { meanQuery, countQuery, sumQuery, clampValue } from '../../engine/dp/sensitivity';
import { laplaceMechanism } from '../../engine/dp/laplace';
import { makeRng } from '../../engine/rng';
import { Readout } from '../../ui/primitives';

export interface DifferencingProps {
  records: readonly PersonRecord[];
  seed: number;
  /** Epsilon for the protected comparison. */
  epsilon: number;
  onIsolated?: () => void;
}

const INCOME_CLAMP = { low: 0, high: 20_000_000 };

/** The group both queries range over: the whole population. Module-level so it is a
 * stable reference and does not rebuild the query pair on every render. */
const WHOLE_POPULATION: readonly Predicate[] = [];

export function Differencing({ records, seed, epsilon, onIsolated }: DifferencingProps) {
  const [kind, setKind] = useState<AggregateQuery['kind']>('mean');
  const [targetId, setTargetId] = useState<number | null>(null);

  /**
   * Candidate targets: records whose birthdate is unique in the population, so that
   * "everyone" and "everyone not born on that date" differ by exactly one person. That
   * is not a contrived construction — it is what a portal's own breakdowns permit.
   */
  const candidates = useMemo(() => {
    const byDate = new Map<string, number[]>();
    for (const r of records) {
      const d = String(r.quasi.birthdate);
      const bucket = byDate.get(d);
      if (bucket) bucket.push(r.id);
      else byDate.set(d, [r.id]);
    }
    return [...byDate.values()].filter((ids) => ids.length === 1).map((ids) => ids[0]).slice(0, 40);
  }, [records]);

  const chosen = targetId ?? candidates[0] ?? null;

  const pair = useMemo(
    () =>
      chosen === null ? null : buildDifferencingPair(records, chosen, WHOLE_POPULATION, kind, 'income'),
    [records, chosen, kind],
  );

  const result = useMemo(
    () => (pair ? runDifferencing(records, pair.a, pair.b, 'income') : null),
    [records, pair],
  );

  /** The same pair under the Laplace mechanism, with sensitivity derived per query type. */
  const protectedPair = useMemo(() => {
    if (!result || !pair) return null;
    const query =
      kind === 'count'
        ? countQuery('records in the group')
        : kind === 'sum'
          ? sumQuery('income', INCOME_CLAMP, 'total income')
          : meanQuery('income', INCOME_CLAMP, Math.max(1, Math.min(result.a.size, result.b.size)), 'mean income');
    const rng = makeRng(seed ^ 0x51ed);
    const a = laplaceMechanism(rng, result.a.value, query.sensitivity, epsilon / 2);
    const b = laplaceMechanism(rng, result.b.value, query.sensitivity, epsilon / 2);
    const noisyRecovered =
      kind === 'mean' ? Math.abs(a.value * result.a.size - b.value * result.b.size) : Math.abs(a.value - b.value);
    return { query, a, b, noisyRecovered };
  }, [result, pair, kind, epsilon, seed]);

  const record = chosen === null ? null : records.find((r) => r.id === chosen) ?? null;

  return (
    <section className="panel" aria-label="Differencing bench">
      <div className="panel__title">Differencing bench</div>

      <div className="bench__controls">
        <div className="control">
          <label className="control__label" htmlFor="bench-kind">
            Aggregate
          </label>
          <select
            id="bench-kind"
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value as AggregateQuery['kind'])}
          >
            <option value="count">Count of records</option>
            <option value="sum">Total monthly income</option>
            <option value="mean">Mean monthly income</option>
          </select>
          <span className="control__value" />
        </div>
        <div className="control">
          <label className="control__label" htmlFor="bench-target">
            Excluded by the second query
          </label>
          <select
            id="bench-target"
            className="select"
            value={chosen ?? ''}
            onChange={(e) => setTargetId(Number(e.target.value))}
          >
            {candidates.map((id) => {
              const r = records.find((x) => x.id === id)!;
              return (
                <option key={id} value={id}>
                  everyone not born on {String(r.quasi.birthdate)}
                </option>
              );
            })}
          </select>
          <span className="control__value" />
        </div>
      </div>

      {result && pair && (
        <>
          <table className="table" style={{ marginTop: 'var(--s-2)' }}>
            <caption className="visually-hidden">The two published aggregates and their difference</caption>
            <thead>
              <tr>
                <th>Query</th>
                <th className="num">Records</th>
                <th className="num">Answer</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Everyone</td>
                <td className="num">{result.a.size.toLocaleString('en')}</td>
                <td className="num">{format(result.a.value, kind)}</td>
              </tr>
              <tr>
                <td>Everyone except one birthdate</td>
                <td className="num">{result.b.size.toLocaleString('en')}</td>
                <td className="num">{format(result.b.value, kind)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Difference</strong>
                </td>
                <td className="num">{(result.a.size - result.b.size).toLocaleString('en')}</td>
                <td className="num">
                  <strong>{format(result.difference, kind)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="readout" style={{ marginTop: 'var(--s-3)' }}>
            <Readout
              label="Records isolated by the pair"
              value={result.isolatedIds.length}
              exposed={result.isolatesOne}
            />
            {result.isolatesOne && record && (
              <>
                <Readout label="Recovered" value={format(result.recovered ?? 0, kind)} exposed />
                <Readout label="True value" value={format(result.actual ?? 0, kind)} />
              </>
            )}
          </div>

          {result.isolatesOne && (
            <p className="note" style={{ marginTop: 'var(--s-2)' }}>
              The two queries differ by one person. Both are ordinary published breakdowns, neither
              releases a record, and their difference is that person's figure exactly. No
              generalisation, k-anonymity, l-diversity or t-closeness applies here, because there is
              no released table for them to be properties of.{' '}
              <button type="button" className="button button--quiet" onClick={onIsolated}>
                Note this
              </button>
            </p>
          )}

          {protectedPair && (
            <div className="panel" style={{ marginTop: 'var(--s-3)' }}>
              <div className="panel__title">The same pair under the Laplace mechanism</div>
              <div className="readout">
                <Readout label="Epsilon, split across two queries" value={epsilon.toFixed(2)} />
                <Readout label="Sensitivity" value={format(protectedPair.query.sensitivity, kind)} />
                <Readout label="Recovered from the noisy pair" value={format(protectedPair.noisyRecovered, kind)} />
                <Readout label="True value" value={format(result.actual ?? 0, kind)} />
              </div>
              <p className="note" style={{ marginTop: 'var(--s-2)' }}>
                {protectedPair.query.derivation}
              </p>
              <p className="note">
                The difference is now dominated by noise. The guarantee does not depend on what the
                attacker already knows, which is what separates it from every defense above.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function format(value: number, kind: AggregateQuery['kind']): string {
  if (kind === 'count') return Math.round(value).toLocaleString('en');
  return Math.round(clampValue(value, { low: -1e12, high: 1e12 })).toLocaleString('en');
}

/**
 * The budget meter. DESIGN.md §5.7, CLAUDE.md §5.
 *
 * Epsilon spent against epsilon allotted, with the query log beneath — each query, its
 * sensitivity, its derivation, and its cost.
 *
 * The meter only empties. There is no refill control and no reset within a case, because
 * that is the property being taught.
 */
import { useMemo, useState } from 'react';
import type { PersonRecord } from '../../engine/types';
import {
  newBudget,
  charge,
  canAfford,
  queriesRemaining,
  COMPOSITION_SCOPE,
  type Budget as BudgetState,
} from '../../engine/dp/budget';
import { countQuery, meanQuery, histogramQuery, sumQuery, type Query } from '../../engine/dp/sensitivity';
import { laplaceMechanism } from '../../engine/dp/laplace';
import { makeRng } from '../../engine/rng';
import { answer, type AggregateQuery } from '../../engine/attacks/differencing';
import { Readout, Cite } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

const INCOME_CLAMP = { low: 0, high: 20_000_000 };

export interface BudgetPanelProps {
  records: readonly PersonRecord[];
  seed: number;
  epsilon: number;
  onEpsilon: (value: number) => void;
  allotted?: number;
  onExhausted?: () => void;
}

type QueryChoice = 'count' | 'count-province' | 'mean-income' | 'sum-income' | 'histogram';

const CHOICES: Array<{ id: QueryChoice; label: string; build: (n: number) => Query; plan: AggregateQuery }> = [
  {
    id: 'count',
    label: 'How many records in total',
    build: () => countQuery('records in total'),
    plan: { kind: 'count', predicates: [] },
  },
  {
    id: 'count-province',
    label: 'How many records in province 32',
    build: () => countQuery('records in province 32'),
    plan: { kind: 'count', predicates: [{ column: 'kelurahan', op: 'prefix', value: '32' }] },
  },
  {
    id: 'mean-income',
    label: 'Mean monthly income',
    build: (n) => meanQuery('income', INCOME_CLAMP, Math.max(1, n), 'mean monthly income'),
    plan: { kind: 'mean', column: 'income', predicates: [] },
  },
  {
    id: 'sum-income',
    label: 'Total monthly income',
    build: () => sumQuery('income', INCOME_CLAMP, 'total monthly income'),
    plan: { kind: 'sum', column: 'income', predicates: [] },
  },
  {
    id: 'histogram',
    label: 'Diagnosis histogram, one bin',
    build: () => histogramQuery('diagnosis', 'add-remove', 'diagnosis histogram'),
    plan: { kind: 'count', predicates: [{ column: 'diagnosis', op: 'eq', value: 'Cardiac' }] },
  },
];

export function BudgetPanel({
  records,
  seed,
  epsilon,
  onEpsilon,
  allotted = 1,
  onExhausted,
}: BudgetPanelProps) {
  const [budget, setBudget] = useState<BudgetState>(() => newBudget(allotted));
  const [choice, setChoice] = useState<QueryChoice>('count');
  const [error, setError] = useState<string | null>(null);

  const rng = useMemo(() => makeRng(seed ^ 0xb0d9e7), [seed]);

  const ask = () => {
    const entry = CHOICES.find((c) => c.id === choice)!;
    const truth = answer(records, entry.plan);
    const query = entry.build(truth.size);
    if (!canAfford(budget, epsilon)) {
      setError(
        `This query costs ${epsilon.toFixed(2)} and ${budget.remaining.toFixed(2)} remains. The budget does not refill.`,
      );
      onExhausted?.();
      return;
    }
    setError(null);
    const noisy = laplaceMechanism(rng, truth.value, query.sensitivity, epsilon);
    const next = charge(budget, query, noisy);
    setBudget(next);
    if (!canAfford(next, epsilon)) onExhausted?.();
  };

  const exportLog = () => {
    const csv = toCsv(
      ['index', 'query', 'kind', 'sensitivity', 'epsilon', 'noise_scale', 'released', 'remaining', 'derivation'],
      budget.entries.map((e) => [
        e.index + 1,
        e.query.label ?? e.query.kind,
        e.query.kind,
        e.query.sensitivity,
        e.epsilon,
        e.answer.scale,
        Math.round(e.answer.value),
        e.remaining.toFixed(4),
        e.query.derivation,
      ]),
    );
    downloadCsv(`linkage-budget-seed-${seed}.csv`, csv);
  };

  const fraction = budget.allotted === 0 ? 0 : budget.spent / budget.allotted;

  return (
    <section className="panel" aria-label="Privacy budget">
      <div className="panel__title">Budget</div>

      <div
        className="meter"
        role="meter"
        aria-valuenow={budget.spent}
        aria-valuemin={0}
        aria-valuemax={budget.allotted}
        aria-label="Epsilon spent"
      >
        <div className="meter__fill" style={{ width: `${Math.min(100, fraction * 100)}%` }} />
      </div>

      <div className="readout" style={{ marginTop: 'var(--s-2)' }}>
        <Readout label="Spent" value={budget.spent.toFixed(2)} />
        <Readout
          label="Remaining"
          value={budget.remaining.toFixed(2)}
          exposed={budget.remaining <= 0}
        />
        <Readout label="Allotted" value={budget.allotted.toFixed(2)} />
        <Readout label="Queries left at this epsilon" value={queriesRemaining(budget, epsilon)} />
      </div>

      <div className="control" style={{ marginTop: 'var(--s-2)' }}>
        <label className="control__label" htmlFor="budget-epsilon">
          Epsilon per query
        </label>
        <input
          id="budget-epsilon"
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={epsilon}
          onChange={(e) => onEpsilon(Number(e.target.value))}
        />
        <span className="control__value">{epsilon.toFixed(2)}</span>
      </div>

      <div className="control">
        <label className="control__label" htmlFor="budget-query">
          Query
        </label>
        <select
          id="budget-query"
          className="select"
          value={choice}
          onChange={(e) => setChoice(e.target.value as QueryChoice)}
        >
          {CHOICES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="control__value" />
      </div>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="button" onClick={ask} disabled={!canAfford(budget, epsilon)}>
          Ask
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={exportLog}
          disabled={budget.entries.length === 0}
        >
          Export log as CSV
        </button>
      </div>

      {error && (
        <p className="note" style={{ marginTop: 'var(--s-2)', color: 'var(--exposed)' }}>
          {error}
        </p>
      )}

      {budget.entries.length > 0 && (
        <div className="table__scroll" style={{ marginTop: 'var(--s-3)' }}>
          <table className="table">
            <caption className="panel__title">The query log, and what it spent</caption>
            <thead>
              <tr>
                <th>Query</th>
                <th className="num">Sensitivity</th>
                <th className="num">Epsilon</th>
                <th className="num">Noise scale</th>
                <th className="num">Released</th>
                <th className="num">True</th>
                <th className="num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {budget.entries.map((e) => (
                <tr key={e.index}>
                  <td title={e.query.derivation}>{e.query.label ?? e.query.kind}</td>
                  <td className="num">{formatNumber(e.query.sensitivity)}</td>
                  <td className="num">{e.epsilon.toFixed(2)}</td>
                  <td className="num">{formatNumber(e.answer.scale)}</td>
                  <td className="num">{formatNumber(e.answer.value)}</td>
                  <td className="num">{formatNumber(e.answer.trueValue)}</td>
                  <td className="num">{e.remaining.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {budget.entries.length > 0 && (
        <p className="note" style={{ marginTop: 'var(--s-2)' }}>
          {budget.entries[budget.entries.length - 1].query.derivation}
        </p>
      )}

      <p className="note" style={{ marginTop: 'var(--s-2)' }}>
        {COMPOSITION_SCOPE} <Cite source="dwork" />
      </p>
      <p className="note">
        There is no refill control. A hundred queries at 0.1 is a budget of 10, and when it is spent
        the release is over.
      </p>
    </section>
  );
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en');
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3);
}

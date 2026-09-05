/**
 * The attacker's roll, at the quality the attacker has it.
 *
 * Every other view in this app joins the released table to a perfect register of the
 * same people. That is the ceiling, and this view is where the ceiling gets a floor put
 * under it: coverage and error are the two objections a steward raises first, and the
 * app should be able to answer them with a curve rather than a shrug.
 *
 * The curve is drawn in SVG. No charting library (CLAUDE.md, stack).
 */
import { useMemo, useState } from 'react';
import type { PersonRecord, GeneralisationVector } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import { generalisePopulation } from '../../engine/generalise';
import { degradeRoll } from '../../engine/attacks/auxiliary';
import { runLinkage } from '../../engine/attacks/linkage';
import { Finding, Readout, Slider } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

export interface RollProps {
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  columns: readonly string[];
  vector: GeneralisationVector;
  seed: number;
}

/** Coverage steps the curve is drawn at. Ten points is enough to read a shape. */
const STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

const WIDTH = 320;
const HEIGHT = 140;
const PAD = 24;

export function Roll({ records, taxonomy, columns, vector, seed }: RollProps) {
  const [coverage, setCoverage] = useState(0.7);
  const [errorRate, setErrorRate] = useState(0.1);

  const keys = useMemo(
    () => generalisePopulation(records, taxonomy, vector, columns),
    [records, taxonomy, vector, columns],
  );

  const targets = useMemo(
    () => records.slice(0, Math.min(500, records.length)).map((r) => r.id),
    [records],
  );

  const score = useMemo(() => {
    const roll = degradeRoll(keys, { coverage, errorRate, seed });
    const result = runLinkage(records, keys, roll.keys, { columns, targetIds: targets });
    return { roll, result };
  }, [records, keys, coverage, errorRate, seed, columns, targets]);

  /** The same attack across the coverage range, at the error rate now set. */
  const curve = useMemo(
    () =>
      STEPS.map((c) => {
        const roll = degradeRoll(keys, { coverage: c, errorRate, seed });
        const result = runLinkage(records, keys, roll.keys, { columns, targetIds: targets });
        return { coverage: c, correct: result.correct };
      }),
    [records, keys, errorRate, seed, columns, targets],
  );

  const maxCorrect = Math.max(1, ...curve.map((p) => p.correct));
  const x = (c: number) => PAD + c * (WIDTH - PAD * 2);
  const y = (v: number) => HEIGHT - PAD - (v / maxCorrect) * (HEIGHT - PAD * 2);
  const path = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.coverage)} ${y(p.correct)}`).join(' ');

  const exportCurve = () => {
    const csv = toCsv(
      ['coverage', 'error_rate', 'targets', 'uniquely_identified'],
      curve.map((p) => [p.coverage.toFixed(2), errorRate.toFixed(2), targets.length, p.correct]),
    );
    downloadCsv(`linkage-roll-seed-${seed}.csv`, csv);
  };

  return (
    <section className="panel" aria-label="The attacker's roll">
      <div className="panel__title">The attacker's roll</div>

      <p className="note">
        Everywhere else the join runs against a complete, current, error-free register of the same
        people. No such register exists. Coverage is the share of the population the roll lists;
        error is the share of those listings carrying a wrong quasi-identifier. Both are models of
        an adversary rather than measurements of one, and what they buy is the shape below.
      </p>

      <Finding
        of={score.result.correct}
        total={score.result.attempted}
        label="targets uniquely identified"
        detail={
          <>
            {score.roll.listed.toLocaleString('en')} of{' '}
            {score.roll.population.toLocaleString('en')} people are listed in the roll, of whom{' '}
            {score.roll.wrong.toLocaleString('en')} carry a wrong attribute.
          </>
        }
        exposed={score.result.correct > 0}
      />

      <div className="readout" style={{ padding: 'var(--s-3) 0' }}>
        <Readout label="Not determined" value={score.result.failed.toLocaleString('en')} />
        <Readout
          label="Narrowed to a wrong single candidate"
          value={score.result.incorrect.toLocaleString('en')}
        />
      </div>

      <Slider
        label="Roll coverage"
        value={coverage}
        min={0}
        max={1}
        step={0.01}
        onChange={setCoverage}
        display={`${Math.round(coverage * 100)}%`}
      />
      <Slider
        label="Wrong attributes in the roll"
        value={errorRate}
        min={0}
        max={1}
        step={0.01}
        onChange={setErrorRate}
        display={`${Math.round(errorRate * 100)}%`}
      />

      <figure style={{ margin: 'var(--s-3) 0 0' }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          role="img"
          aria-label={`Identifications against roll coverage at ${Math.round(errorRate * 100)} per cent error. ${curve.map((p) => `${Math.round(p.coverage * 100)} per cent coverage, ${p.correct} identified`).join('. ')}`}
        >
          <line
            x1={PAD}
            y1={HEIGHT - PAD}
            x2={WIDTH - PAD}
            y2={HEIGHT - PAD}
            stroke="var(--rule-strong)"
            strokeWidth="1"
          />
          <line
            x1={PAD}
            y1={PAD}
            x2={PAD}
            y2={HEIGHT - PAD}
            stroke="var(--rule-strong)"
            strokeWidth="1"
          />
          <path d={path} fill="none" stroke="var(--exposed)" strokeWidth="1.5" />
          <circle cx={x(coverage)} cy={y(score.result.correct)} r="3" fill="var(--ink)" />
          <text x={PAD} y={HEIGHT - 8} fontSize="9" fill="var(--ink-faint)">
            0%
          </text>
          <text x={WIDTH - PAD} y={HEIGHT - 8} fontSize="9" fill="var(--ink-faint)" textAnchor="end">
            100% coverage
          </text>
          <text x={PAD} y={PAD - 8} fontSize="9" fill="var(--ink-faint)">
            {maxCorrect.toLocaleString('en')} identified
          </text>
        </svg>
      </figure>

      <table className="table" style={{ marginTop: 'var(--s-3)' }}>
        <caption className="panel__title">The same attack across the coverage range</caption>
        <thead>
          <tr>
            <th scope="col">Coverage</th>
            <th scope="col">Uniquely identified</th>
            <th scope="col">Of targets</th>
          </tr>
        </thead>
        <tbody>
          {curve.map((p) => (
            <tr key={p.coverage}>
              <td>{Math.round(p.coverage * 100)}%</td>
              <td>{p.correct.toLocaleString('en')}</td>
              <td>{targets.length.toLocaleString('en')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="button button--quiet" onClick={exportCurve}>
          Export the curve as CSV
        </button>
      </div>
    </section>
  );
}

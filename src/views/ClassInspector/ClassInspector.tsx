/**
 * Equivalence class inspector. DESIGN.md §5.5.
 *
 * One class: its key, its size, l, and t, and its sensitive value distribution as a
 * small bar chart with the population distribution drawn behind it as a hairline
 * outline.
 *
 * Homogeneity is a chart with one bar. Skewness is a distribution sitting visibly away
 * from the outline behind it. Neither needs a label, and neither gets one.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ClassSet } from '../../engine/classes';
import { entropyL } from '../../engine/classes';
import type { GeneralisationVector, PersonRecord } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import { generaliseValue, KEY_SEPARATOR } from '../../engine/generalise';
import { Cite } from '../../ui/primitives';

/**
 * Named as custom properties rather than as values, so the chart follows the ground.
 * DESIGN §2.4: muted, low-chroma, and deliberately not a traffic light — no sensitive
 * value in this application is drawn as the bad one.
 */
const SENSITIVE_COLOURS = [
  'var(--sensitive-1)',
  'var(--sensitive-2)',
  'var(--sensitive-3)',
  'var(--sensitive-4)',
  'var(--sensitive-5)',
];

export interface ClassInspectorProps {
  set: ClassSet;
  classIndex: number;
  onClose: () => void;
  /**
   * What built this class. The key alone says what the class is; these say how a person
   * became a member of it, which is the step the rest of the application never shows.
   *
   * The vector and columns are the ones that produced this particular class set, not the
   * application's current configuration — case 1 groups on Sweeney's triple at raw
   * precision regardless of what the sliders say.
   */
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  vector: GeneralisationVector;
  columns: readonly string[];
}

export function ClassInspector({
  set,
  classIndex,
  onClose,
  records,
  taxonomy,
  vector,
  columns,
}: ClassInspectorProps) {
  const panel = useRef<HTMLElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  /**
   * The inspector renders near the end of the case, a long way from whatever opened it,
   * so a keyboard user who selected a class had to tab forward blindly to find it. It
   * takes focus on open and gives it back on close.
   *
   * Except when the field opened it. The canvas walks classes with the arrow keys and
   * selects as it goes, so taking focus there would move the reader out of the field on
   * their first keypress and end the walk. The field announces the class it lands on
   * instead, which is what a walk needs.
   *
   * Not a dialog: the rest of the page stays operable behind it, so it does not trap
   * focus and does not claim a role that would say it does.
   */
  useEffect(() => {
    const active = document.activeElement;
    const fromField = active instanceof HTMLElement && active.classList.contains('field__canvas');
    returnTo.current = active;
    if (!fromField) panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Give focus back only if closing the panel is what lost it. Removing a focused
      // element drops focus to the body, so that is the signal; if the reader has moved
      // somewhere else, activeElement is that element and pulling them back would be a
      // second theft rather than a repair.
      const active = document.activeElement;
      const focusWasLost = active === null || active === document.body;
      if (focusWasLost && returnTo.current instanceof HTMLElement && returnTo.current.isConnected) {
        returnTo.current.focus();
      }
    };
  }, [onClose]);

  const cls = set.classes[classIndex];

  const bars = useMemo(() => {
    if (!cls) return [];
    let populationTotal = 0;
    for (const n of set.populationDistribution.values()) populationTotal += n;
    return set.sensitiveOrder.map((value, i) => ({
      value: String(value),
      colour: SENSITIVE_COLOURS[i % SENSITIVE_COLOURS.length],
      classShare:
        cls.members.length === 0
          ? 0
          : (cls.sensitiveDistribution.get(value) ?? 0) / cls.members.length,
      populationShare:
        populationTotal === 0 ? 0 : (set.populationDistribution.get(value) ?? 0) / populationTotal,
      count: cls.sensitiveDistribution.get(value) ?? 0,
    }));
  }, [cls, set]);

  /**
   * How one member became a member.
   *
   * The key says what the class is. This says how somebody got into it: their real
   * values, the rung each column is on, and the component that rung produced. Read down
   * the last column and you have the key.
   *
   * One member stands for all of them, and that is not a shortcut. Producing this same
   * key is exactly what membership means, so any member would show the same right-hand
   * column and a different left-hand one.
   */
  const trace = useMemo(() => {
    if (!cls) return null;
    const id = cls.members[0];
    const record = records.find((r) => r.id === id);
    if (!record) return null;
    return {
      id,
      rows: columns.map((column) => {
        const level = vector[column] ?? 0;
        const raw = record.quasi[column];
        const t = taxonomy[column];
        const rungs = t?.levels.length ?? 1;
        return {
          column,
          label: t?.label ?? column,
          rung: t?.levels[Math.min(level, rungs - 1)]?.label ?? 'As recorded',
          raw: String(raw),
          generalised: String(generaliseValue(taxonomy, column, level, raw)),
        };
      }),
    };
  }, [cls, records, taxonomy, vector, columns]);

  if (!cls) return null;

  const height = 96;
  const barWidth = 34;
  const gap = 10;
  const width = bars.length * (barWidth + gap);
  const maxShare = Math.max(0.001, ...bars.map((b) => Math.max(b.classShare, b.populationShare)));

  return (
    <section className="panel inspector" ref={panel} tabIndex={-1}>
      <div className="inspector__head">
        <h2 className="panel__title">Class inspector</h2>
        <button type="button" className="button button--quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="readout">
        <div className="readout__item">
          <span className="readout__label">Generalised key</span>
          <span className="control__value">{cls.key}</span>
        </div>
        <div className="readout__item">
          <span className="readout__label">Size</span>
          <span
            className={`readout__value${cls.members.length === 1 ? ' readout__value--exposed' : ''}`}
          >
            {cls.members.length.toLocaleString('en')}
          </span>
        </div>
        <div className="readout__item">
          <span className="readout__label">l, distinct</span>
          <span className="readout__value">{cls.l}</span>
        </div>
        <div className="readout__item">
          <span className="readout__label">l, entropy</span>
          <span className="readout__value">{entropyL(cls.sensitiveDistribution).toFixed(2)}</span>
        </div>
        <div className="readout__item">
          <span className="readout__label">t, from the population</span>
          <span className="readout__value">{cls.t.toFixed(3)}</span>
        </div>
      </div>

      {trace && (
        <div className="table__scroll">
          <table className="table">
            <caption className="panel__title">
              How record {trace.id} came to be in this class
            </caption>
            <thead>
              <tr>
                <th scope="col">Column</th>
                <th scope="col">As recorded</th>
                <th scope="col">Generalised to</th>
                <th scope="col">Becomes</th>
              </tr>
            </thead>
            <tbody>
              {trace.rows.map((row) => (
                <tr key={row.column}>
                  <td>{row.label}</td>
                  <td>{row.raw}</td>
                  <td>{row.rung}</td>
                  <td>{row.generalised}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="note">
        The last column, joined with {KEY_SEPARATOR}, is the key above. Every other member of
        this class has different values in the second column and the same ones in the fourth,
        and that is what puts them here: producing this key is what membership is.
      </p>

      <p className="note">
        The chart below holds the inputs to all three measures. Filled bars are this class;
        the hairline outline behind them is the whole population.
      </p>

      {/* The three measures, with their arithmetic and the reason for it, beside the chart
          that holds their inputs. Each is cited where it is applied rather than in a list
          at the end. */}
      <dl className="working">
        <dt>l, distinct = {cls.l}</dt>
        <dd>
          Count the bars with anything in them. It is the weakest of the l-diversity family
          and this application says so where it matters: three values in 98 to 1 to 1
          proportion counts as 3 and protects almost nobody. <Cite source="ldiversity" />
        </dd>

        <dt>l, entropy = {entropyL(cls.sensitiveDistribution).toFixed(2)}</dt>
        <dd>
          The exponential of the Shannon entropy of the bars, which is the number of values
          this class would have if they were evenly spread. Reported beside the distinct
          count because the two disagree usefully: where they diverge, the class is diverse
          by the letter and lopsided in fact.
        </dd>

        <dt>t, from the population = {cls.t.toFixed(3)}</dt>
        <dd>
          The earth mover's distance from the filled bars to the outline: how much
          probability has to be moved, and how far, to turn one into the other. Zero means
          this class looks like the population and learning someone is in it tells an
          attacker nothing new. Earth mover's rather than a simpler difference because it
          respects the distance between values, which is what makes it right for an ordered
          attribute like income and is the whole content of t-closeness.{' '}
          <Cite source="tcloseness" />
        </dd>
      </dl>

      <svg
        className="inspector__chart"
        viewBox={`0 0 ${width} ${height + 20}`}
        width="100%"
        height={height + 20}
        role="img"
        aria-label={`Sensitive value distribution in this class of ${cls.members.length}, against the population distribution.`}
      >
        {/* A baseline, so the bars and the population outlines stand on something
            rather than floating in the panel. */}
        <line
          x1={0}
          y1={height + 0.5}
          x2={width}
          y2={height + 0.5}
          stroke="var(--rule-strong)"
          strokeWidth="1"
        />
        {bars.map((bar, i) => {
          const x = i * (barWidth + gap);
          const h = (bar.classShare / maxShare) * height;
          const ph = (bar.populationShare / maxShare) * height;
          return (
            <g key={bar.value}>
              {/* Population distribution behind, as a hairline outline. */}
              <rect
                x={x - 3}
                y={height - ph}
                width={barWidth + 6}
                height={ph}
                fill="none"
                stroke="var(--ink-faint)"
                strokeWidth="1"
              />
              <rect
                className="inspector__bar"
                x={x}
                y={height - h}
                width={barWidth}
                height={h}
                fill={bar.colour}
                style={{ transformOrigin: `0px ${height}px` }}
              />
              <text
                x={x + barWidth / 2}
                y={height + 14}
                textAnchor="middle"
                fontSize="9"
                fill="var(--ink-mid)"
                fontFamily="var(--font-sans)"
              >
                {bar.value.slice(0, 6)}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="table">
        <caption className="visually-hidden">
          Sensitive value distribution in this class against the population
        </caption>
        <thead>
          <tr>
            <th>Value</th>
            <th className="num">In class</th>
            <th className="num">Share</th>
            <th className="num">Population share</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.value}>
              <td>{bar.value}</td>
              <td className="num">{bar.count}</td>
              <td className="num">{(bar.classShare * 100).toFixed(1)}%</td>
              <td className="num">{(bar.populationShare * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

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
import { useMemo } from 'react';
import type { ClassSet } from '../../engine/classes';
import { entropyL } from '../../engine/classes';

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
}

export function ClassInspector({ set, classIndex, onClose }: ClassInspectorProps) {
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

  if (!cls) return null;

  const height = 96;
  const barWidth = 34;
  const gap = 10;
  const width = bars.length * (barWidth + gap);
  const maxShare = Math.max(0.001, ...bars.map((b) => Math.max(b.classShare, b.populationShare)));

  return (
    <section className="panel inspector" aria-label="Equivalence class inspector">
      <div className="inspector__head">
        <span className="panel__title">Class inspector</span>
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

      <svg
        className="inspector__chart"
        viewBox={`0 0 ${width} ${height + 20}`}
        width="100%"
        height={height + 20}
        role="img"
        aria-label={`Sensitive value distribution in this class of ${cls.members.length}, against the population distribution.`}
      >
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

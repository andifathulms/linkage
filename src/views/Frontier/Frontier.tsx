/**
 * The privacy–utility frontier. DESIGN.md §5.6.
 *
 * Horizontal: privacy, as achieved k. Two vertical series: re-identification rate, and a
 * utility measure. The two curves cross somewhere, and where they cross is the decision
 * nobody can make for you — so there is a draggable marker with both values reading out.
 */
import { useMemo, useState } from 'react';
import type { GeneralisationVector, PersonRecord } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import { buildFrontier, frontierPath } from '../../engine/utility';
import { Readout, Slider } from '../../ui/primitives';
import { toCsv, downloadCsv } from '../../ui/csv';

export interface FrontierProps {
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  columns: readonly string[];
  onSelect: (vector: GeneralisationVector) => void;
  seed: number;
}

const W = 480;
const H = 200;
const PAD = 34;

export function Frontier({ records, taxonomy, columns, onSelect, seed }: FrontierProps) {
  const path = useMemo(() => frontierPath(taxonomy, columns), [taxonomy, columns]);
  const points = useMemo(
    () => buildFrontier(records, taxonomy, path, columns),
    [records, taxonomy, path, columns],
  );
  const [marker, setMarker] = useState(0);

  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - v * (H - PAD * 2);

  const line = (series: (i: number) => number) =>
    points
      .map((_, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(series(i)).toFixed(1)}`)
      .join(' ');

  const current = points[Math.min(marker, points.length - 1)];

  const exportFrontier = () => {
    const csv = toCsv(
      [...columns, 'k', 'reidentification_rate', 'information_loss', 'query_error', 'classes'],
      points.map((p) => [
        ...columns.map((c) => p.vector[c] ?? 0),
        p.k,
        p.reidentificationRate.toFixed(6),
        p.informationLoss.toFixed(6),
        p.queryError.toFixed(6),
        p.classCount,
      ]),
    );
    downloadCsv(`linkage-frontier-seed-${seed}.csv`, csv);
  };

  return (
    <section className="panel" aria-label="Privacy–utility frontier">
      <div className="panel__title">Privacy–utility frontier</div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: W }}
        role="img"
        aria-label="Re-identification rate and information loss against generalisation level."
      >
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--rule)" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--rule)" />

        <path
          d={line((i) => points[i].reidentificationRate)}
          fill="none"
          stroke="var(--exposed)"
          strokeWidth="1.5"
        />
        <path
          d={line((i) => points[i].informationLoss)}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.5"
        />
        <path
          d={line((i) => points[i].queryError)}
          fill="none"
          stroke="var(--ink-mid)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        <line
          x1={x(marker)}
          y1={PAD}
          x2={x(marker)}
          y2={H - PAD}
          stroke="var(--ink)"
          strokeWidth="1"
        />
        <circle cx={x(marker)} cy={y(current.reidentificationRate)} r="3.5" fill="var(--exposed)" />
        <circle cx={x(marker)} cy={y(current.informationLoss)} r="3.5" fill="var(--ink)" />

        <text x={PAD} y={PAD - 8} fontSize="9" fill="var(--ink-mid)">
          1.0
        </text>
        <text x={PAD} y={H - PAD + 14} fontSize="9" fill="var(--ink-mid)">
          raw
        </text>
        <text x={W - PAD} y={H - PAD + 14} fontSize="9" fill="var(--ink-mid)" textAnchor="end">
          fully suppressed
        </text>
      </svg>

      <Slider
        label="Position"
        value={marker}
        min={0}
        max={points.length - 1}
        onChange={setMarker}
        display={`${marker + 1} of ${points.length}`}
      />

      <div className="readout" style={{ marginTop: 'var(--s-2)' }}>
        <Readout label="Achieved k" value={current.k.toLocaleString('en')} />
        <Readout
          label="Records uniquely determined"
          value={`${current.singletons.toLocaleString('en')} of ${records.length.toLocaleString('en')}`}
          exposed={current.singletons > 0}
        />
        <Readout
          label="Information loss"
          value={`${(current.informationLoss * 100).toFixed(0)}%`}
        />
        <Readout label="Mean query error" value={`${(current.queryError * 100).toFixed(1)}%`} />
        <Readout label="Classes" value={current.classCount.toLocaleString('en')} />
      </div>

      <div className="frontier__legend">
        <span className="frontier__key" style={{ borderColor: 'var(--exposed)' }}>
          Re-identification rate
        </span>
        <span className="frontier__key" style={{ borderColor: 'var(--ink)' }}>
          Information loss
        </span>
        <span className="frontier__key" style={{ borderColor: 'var(--ink-mid)' }}>
          Query error
        </span>
      </div>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="button" onClick={() => onSelect(current.vector)}>
          Apply this point to the field
        </button>
        <button type="button" className="button button--quiet" onClick={exportFrontier}>
          Export frontier as CSV
        </button>
      </div>

      <p className="note" style={{ marginTop: 'var(--s-2)' }}>
        Every defense buys privacy with accuracy. The two curves cross somewhere along this path,
        and where they cross is not a recommendation this application can make for you — it depends
        on what the release is for and who is harmed if it fails.
      </p>
    </section>
  );
}

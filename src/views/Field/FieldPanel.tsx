/**
 * The field with its readout and its keyboard-reachable table equivalent.
 *
 * PRD §8.8: every instrument has a keyboard-reachable table equivalent. The canvas is
 * the fast reading; the table is the complete one, and both are always available rather
 * than one being an accessibility afterthought.
 */
import { useMemo, useState } from 'react';
import type { ClassSet } from '../../engine/classes';
import { exposureOf } from '../../engine/classes';
import { Field, type FieldHover } from './Field';
import { toCsv, downloadCsv } from '../../ui/csv';
import { Slider } from '../../ui/primitives';

export interface FieldPanelProps {
  set: ClassSet;
  recordCount: number;
  height?: number;
  selectedClass: number | null;
  onSelectClass: (index: number | null) => void;
  seed: number;
}

export function FieldPanel({
  set,
  recordCount,
  height = 300,
  selectedClass,
  onSelectClass,
  seed,
}: FieldPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<FieldHover | null>(null);
  const [showTable, setShowTable] = useState(false);

  const smallest = useMemo(() => {
    let best = -1;
    for (let i = 0; i < set.classes.length; i++) {
      if (best === -1 || set.classes[i].members.length < set.classes[best].members.length) best = i;
    }
    return best;
  }, [set]);

  const rows = useMemo(() => {
    // Largest risk first: the smallest classes are the ones a reader needs.
    return set.classes
      .map((c, i) => ({ index: i, key: c.key, size: c.members.length, l: c.l, t: c.t }))
      .sort((a, b) => a.size - b.size || (a.key < b.key ? -1 : 1))
      .slice(0, 300);
  }, [set]);

  const exportClasses = () => {
    const csv = toCsv(
      ['class_key', 'size', 'l', 't'],
      set.classes.map((c) => [c.key, c.members.length, c.l, c.t.toFixed(6)]),
    );
    downloadCsv(`linkage-classes-seed-${seed}.csv`, csv);
  };

  return (
    <section aria-label="The field">
      <div className={`field__readout${set.singletons > 0 ? ' field__readout--exposed' : ''}`}>
        {hover ? (
          <>
            <span>
              key <strong>{hover.classKey}</strong>
            </span>
            <span>
              class size <strong>{hover.classSize.toLocaleString('en')}</strong>
            </span>
            <span>{hover.unique ? 'uniquely determined' : 'not uniquely determined'}</span>
          </>
        ) : (
          <>
            <span>
              {recordCount.toLocaleString('en')} records, grouped by class
            </span>
            <span>
              smallest class <strong>{set.k.toLocaleString('en')}</strong>
            </span>
            <span>classes {set.classes.length.toLocaleString('en')}</span>
            <span>
              standing alone <strong>{set.singletons.toLocaleString('en')}</strong>
            </span>
          </>
        )}
      </div>

      <Field
        set={set}
        recordCount={recordCount}
        height={height}
        zoom={zoom}
        selectedClass={selectedClass}
        onSelectClass={onSelectClass}
        onHover={setHover}
      />

      <div className="field__controls">
        <Slider
          label="Zoom"
          value={zoom}
          min={1}
          max={12}
          step={0.1}
          onChange={setZoom}
          display={`${zoom.toFixed(1)}×`}
        />
        <div className="buttons">
          <button
            type="button"
            className="button button--quiet"
            onClick={() => onSelectClass(smallest)}
            disabled={smallest < 0}
          >
            Select the smallest class
          </button>
          <button
            type="button"
            className="button button--quiet"
            aria-expanded={showTable}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? 'Hide table' : 'Table equivalent'}
          </button>
          <button type="button" className="button button--quiet" onClick={exportClasses}>
            Export classes as CSV
          </button>
        </div>
      </div>

      {showTable && (
        <div className="table__scroll panel">
          <table className="table">
            <caption className="panel__title">
              Equivalence classes, smallest first. Showing {rows.length.toLocaleString('en')} of{' '}
              {set.classes.length.toLocaleString('en')}.
            </caption>
            <thead>
              <tr>
                <th>Generalised key</th>
                <th className="num">Size</th>
                <th className="num">l</th>
                <th className="num">t</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-exposure={exposureOf(row.size)}>
                  <td>{row.key}</td>
                  <td className="num">{row.size}</td>
                  <td className="num">{row.l}</td>
                  <td className="num">{row.t.toFixed(3)}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => onSelectClass(row.index)}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

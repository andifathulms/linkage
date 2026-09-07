/**
 * Generalisation controls. DESIGN.md §4.1, §6.1.
 *
 * Continuous control, direct mapping, zero easing: the slider is the level. The field
 * coalesces because the class set changed, not because the slider animated.
 */
import type { GeneralisationVector, Value } from '../engine/types';
import type { Taxonomy } from '../engine/taxonomy';
import { generaliseValue } from '../engine/generalise';
import { SUPPRESSED } from '../engine/taxonomy';
import { Slider } from '../ui/primitives';

export interface GeneralisationProps {
  taxonomy: Taxonomy;
  vector: GeneralisationVector;
  columns: readonly string[];
  onChange: (vector: GeneralisationVector) => void;
  targetK?: number;
  onTargetK?: (k: number) => void;
  /**
   * One record's raw quasi-identifier values. The control names the rung it is on;
   * these let it also show what that rung does to a value, which is the operation
   * itself and the thing the label alone cannot convey.
   */
  sample?: Record<string, Value>;
}

export function Generalisation({
  taxonomy,
  vector,
  columns,
  onChange,
  targetK,
  onTargetK,
  sample,
}: GeneralisationProps) {
  return (
    <section className="panel">
      <h2 className="panel__title">Generalisation</h2>
      {columns.map((column) => {
        const t = taxonomy[column];
        if (!t) return null;
        const level = vector[column] ?? 0;
        const raw = sample?.[column];
        const generalised = raw === undefined ? undefined : generaliseValue(taxonomy, column, level, raw);
        return (
          <div key={column}>
            <Slider
              label={t.label}
              value={level}
              min={0}
              max={t.levels.length - 1}
              onChange={(next) => onChange({ ...vector, [column]: next })}
              display={t.levels[level].label}
            />
            {/* What the rung does, on a real value from this population. The label says
                which rung; this says what the rung is. Both change as the slider moves,
                so the operation is legible from the control rather than only from the
                field's reaction to it. */}
            {raw !== undefined && (
              <p className="generalisation__example">
                <span className="generalisation__from">{String(raw)}</span>
                <span aria-hidden="true"> becomes </span>
                <span className="visually-hidden"> becomes </span>
                <span className="generalisation__to">
                  {generalised === SUPPRESSED ? 'nothing, the column is dropped' : String(generalised)}
                </span>
              </p>
            )}
          </div>
        );
      })}
      {onTargetK && targetK !== undefined && (
        <>
          <hr className="rule" />
          <Slider label="Target k" value={targetK} min={1} max={100} onChange={onTargetK} />
        </>
      )}
    </section>
  );
}

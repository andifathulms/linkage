/**
 * Generalisation controls. DESIGN.md §4.1, §6.1.
 *
 * Continuous control, direct mapping, zero easing: the slider is the level. The field
 * coalesces because the class set changed, not because the slider animated.
 */
import type { GeneralisationVector } from '../engine/types';
import type { Taxonomy } from '../engine/taxonomy';
import { Slider } from '../ui/primitives';

export interface GeneralisationProps {
  taxonomy: Taxonomy;
  vector: GeneralisationVector;
  columns: readonly string[];
  onChange: (vector: GeneralisationVector) => void;
  targetK?: number;
  onTargetK?: (k: number) => void;
}

export function Generalisation({
  taxonomy,
  vector,
  columns,
  onChange,
  targetK,
  onTargetK,
}: GeneralisationProps) {
  return (
    <section className="panel" aria-label="Generalisation">
      <div className="panel__title">Generalisation</div>
      {columns.map((column) => {
        const t = taxonomy[column];
        if (!t) return null;
        const level = vector[column] ?? 0;
        return (
          <Slider
            key={column}
            label={t.label}
            value={level}
            min={0}
            max={t.levels.length - 1}
            onChange={(next) => onChange({ ...vector, [column]: next })}
            display={t.levels[level].label}
          />
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

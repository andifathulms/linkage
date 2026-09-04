/**
 * The field. DESIGN.md §5.1, CLAUDE.md §6.
 *
 * One canvas, one draw pass, marks as filled rects. Coalescence is one rAF loop
 * interpolating between two precomputed layouts — never 200,000 animated components.
 *
 * Colour is reinforcement only. Isolation carries the primary encoding, so the field
 * stays readable in greyscale (DESIGN §2.2, §9).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClassSet } from '../../engine/classes';
import { exposureOf } from '../../engine/classes';
import { layoutField, FieldIndex, type FieldLayout } from './layout';
import { usePrefersReducedMotion } from '../../ui/useReducedMotion';

const COALESCE_MS = 620;
const EASE = (t: number): number => {
  // cubic-bezier(.32,.72,0,1), approximated by its closed-form-ish shape. The exact
  // curve matters less than that it decelerates hard, so the last singletons being
  // absorbed is the part the eye lands on (DESIGN §6.3).
  const u = 1 - t;
  return 1 - u * u * u * u;
};

export interface FieldHover {
  recordIndex: number;
  classKey: string;
  classSize: number;
  unique: boolean;
}

export interface FieldProps {
  set: ClassSet;
  recordCount: number;
  height: number;
  /** Called when a mark is selected, with the class index. */
  onSelectClass?: (classIndex: number) => void;
  selectedClass?: number | null;
  /** Zoom, 1 to 12. Continuous control: direct mapping, zero easing (DESIGN §6.1). */
  zoom: number;
  onHover?: (hover: FieldHover | null) => void;
}

/** DESIGN §2.2. Protected is the default and carries no colour; only the exposed and the
 * nearly exposed are tinted, so a well-anonymised field is a field of plain ink marks. */
const PROTECTED = '#191c18';
const NARROW = '#c08a3e';
const EXPOSED = '#a8452c';
const GROUND = '#d6dad2';

/** Kept as the single definition of the mapping, and asserted against exposureOf. */
export function colourFor(size: number): string {
  const exposure = exposureOf(size);
  if (exposure === 'exposed') return EXPOSED;
  if (exposure === 'narrow') return NARROW;
  return PROTECTED;
}

export function Field({
  set,
  recordCount,
  height,
  onSelectClass,
  selectedClass,
  zoom,
  onHover,
}: FieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const reducedMotion = usePrefersReducedMotion();

  const aspect = Math.max(0.2, width / Math.max(1, height));
  const layout = useMemo(
    () => layoutField(set, recordCount, { aspect }),
    [set, recordCount, aspect],
  );
  const index = useMemo(() => new FieldIndex(layout), [layout]);

  /**
   * Marks bucketed by colour, computed once per layout rather than per frame.
   *
   * Grouping by colour lets the draw loop set fillStyle three times instead of once per
   * mark, but building the groups inside the loop would allocate 200,000 array entries
   * every frame and lose more than the batching gained. Exposure depends only on class
   * size, so the grouping changes exactly when the layout does.
   */
  const buckets = useMemo(() => {
    const counts = [0, 0, 0];
    const bucketIndex = new Uint8Array(layout.classOf.length);
    for (let i = 0; i < layout.classOf.length; i++) {
      const size = set.classes[layout.classOf[i]].members.length;
      const b = size === 1 ? 2 : size <= 4 ? 1 : 0;
      bucketIndex[i] = b;
      counts[b]++;
    }
    const arrays = counts.map((n) => new Int32Array(n));
    const cursors = [0, 0, 0];
    for (let i = 0; i < bucketIndex.length; i++) {
      const b = bucketIndex[i];
      arrays[b][cursors[b]++] = i;
    }
    // Protected first, so the two tinted states draw over the plain ink rather than
    // under it — a lone mark must never be hidden by a neighbouring clump.
    return [
      { colour: PROTECTED, indices: arrays[0] },
      { colour: NARROW, indices: arrays[1] },
      { colour: EXPOSED, indices: arrays[2] },
    ];
  }, [layout, set]);

  // The layout the field is animating from. Held in a ref rather than state, because a
  // render per frame for 200,000 marks would defeat the entire approach.
  const previousLayout = useRef<FieldLayout | null>(null);
  const animationStart = useRef<number>(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(Math.max(200, entry.contentRect.width));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssWidth = width;
      const cssHeight = height;
      if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = GROUND;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Scale so the layout fills the canvas, then apply the user's zoom about the
      // centre. Zoom is continuous and belongs to the user; it is never automatic.
      const base = Math.min(cssWidth / layout.width, cssHeight / layout.height);
      const scale = base * zoom;
      const offsetX = cssWidth / 2 - (layout.width / 2) * scale;
      const offsetY = cssHeight / 2 - (layout.height / 2) * scale;

      const markPx = Math.max(1.5, Math.min(9, scale * 0.9));
      const from = previousLayout.current;
      const t = from && from.x.length === layout.x.length ? EASE(progress) : 1;

      // One pass over precomputed buckets: no allocation inside the frame.
      for (const bucket of buckets) {
        if (bucket.indices.length === 0) continue;
        ctx.fillStyle = bucket.colour;
        for (let n = 0; n < bucket.indices.length; n++) {
          const i = bucket.indices[n];
          const lx = from && t < 1 ? from.x[i] + (layout.x[i] - from.x[i]) * t : layout.x[i];
          const ly = from && t < 1 ? from.y[i] + (layout.y[i] - from.y[i]) * t : layout.y[i];
          const px = offsetX + lx * scale;
          const py = offsetY + ly * scale;
          if (px < -markPx || py < -markPx || px > cssWidth || py > cssHeight) continue;
          ctx.fillRect(px, py, markPx, markPx);
        }
      }

      // At close zoom, classes gain a boundary — the second reading (DESIGN §5.1).
      if (zoom >= 4) {
        ctx.strokeStyle = 'rgba(25, 28, 24, 0.22)';
        ctx.lineWidth = 1;
        for (const box of layout.boxes) {
          if (!box) continue;
          const bx = offsetX + box.x * scale;
          const by = offsetY + box.y * scale;
          const bw = box.w * scale;
          const bh = box.h * scale;
          if (bx + bw < 0 || by + bh < 0 || bx > cssWidth || by > cssHeight) continue;
          ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(bw), Math.round(bh));
        }
      }

      if (selectedClass != null && layout.boxes[selectedClass]) {
        const box = layout.boxes[selectedClass];
        ctx.strokeStyle = '#191c18';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          offsetX + box.x * scale - 1,
          offsetY + box.y * scale - 1,
          box.w * scale + 2,
          box.h * scale + 2,
        );
      }
    },
    [layout, buckets, width, height, zoom, selectedClass],
  );

  // Coalescence: one rAF loop, all marks moving together (DESIGN §6.3).
  useEffect(() => {
    const from = previousLayout.current;
    const shouldAnimate = !reducedMotion && from !== null && from.x.length === layout.x.length;

    if (!shouldAnimate) {
      draw(1);
      previousLayout.current = layout;
      return;
    }

    animationStart.current = performance.now();
    const step = () => {
      const elapsed = performance.now() - animationStart.current;
      const progress = Math.min(1, elapsed / COALESCE_MS);
      draw(progress);
      if (progress < 1) frame.current = requestAnimationFrame(step);
      else previousLayout.current = layout;
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [layout, draw, reducedMotion]);

  // Zoom and resize redraw without animation: continuous control, direct mapping.
  useEffect(() => {
    if (previousLayout.current === layout) draw(1);
  }, [zoom, width, height, selectedClass, draw, layout]);

  const pointerToField = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const base = Math.min(rect.width / layout.width, rect.height / layout.height);
    const scale = base * zoom;
    const offsetX = rect.width / 2 - (layout.width / 2) * scale;
    const offsetY = rect.height / 2 - (layout.height / 2) * scale;
    return {
      x: (event.clientX - rect.left - offsetX) / scale,
      y: (event.clientY - rect.top - offsetY) / scale,
    };
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onHover) return;
    const point = pointerToField(event);
    if (!point) return;
    const i = index.nearest(point.x, point.y, 2.5);
    if (i === null) {
      onHover(null);
      return;
    }
    const cls = set.classes[layout.classOf[i]];
    onHover({
      recordIndex: i,
      classKey: cls.key,
      classSize: cls.members.length,
      unique: cls.members.length === 1,
    });
  };

  const handleClick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerToField(event);
    if (!point || !onSelectClass) return;
    const i = index.nearest(point.x, point.y, 3);
    if (i !== null) onSelectClass(layout.classOf[i]);
  };

  /**
   * Keyboard navigation over the field (PRD §8.7). Arrow keys walk the classes in
   * layout order, which is size order, so Home lands on the largest class and End on the
   * smallest — the one that is the actual guarantee. The readout announces each move, so
   * the field is navigable without seeing it.
   */
  const ordered = useMemo(() => {
    return layout.boxes
      .map((box, i) => ({ box, i }))
      .filter((entry) => entry.box)
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
      .map((entry) => entry.i);
  }, [layout]);

  const announce = (classIndex: number) => {
    const cls = set.classes[classIndex];
    if (!cls) return;
    onHover?.({
      recordIndex: cls.members[0],
      classKey: cls.key,
      classSize: cls.members.length,
      unique: cls.members.length === 1,
    });
    onSelectClass?.(classIndex);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (ordered.length === 0) return;
    const position = selectedClass == null ? -1 : ordered.indexOf(selectedClass);
    let next = position;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = Math.min(ordered.length - 1, position + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = position <= 0 ? 0 : position - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = ordered.length - 1;
        break;
      case 'PageDown':
        next = Math.min(ordered.length - 1, (position < 0 ? 0 : position) + 25);
        break;
      case 'PageUp':
        next = Math.max(0, (position < 0 ? 0 : position) - 25);
        break;
      default:
        return;
    }
    event.preventDefault();
    announce(ordered[next]);
  };

  return (
    <div ref={wrapRef} className="field" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="field__canvas"
        style={{ width: '100%', height }}
        onPointerMove={handleMove}
        onPointerLeave={() => onHover?.(null)}
        onPointerDown={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label={`Field of ${recordCount} records in ${set.classes.length} equivalence classes. Smallest class ${set.k}. ${set.singletons} records stand alone. Use the arrow keys to walk the classes, End for the smallest.`}
      />
    </div>
  );
}

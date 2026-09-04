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

/**
 * DESIGN §2.2. Protected is the default and carries no colour; only the exposed and the
 * nearly exposed are tinted, so a well-anonymised field is a field of plain ink marks.
 *
 * The values are read from the stylesheet rather than written here, so the field and the
 * rest of the interface cannot drift apart and the plate ground needs no second table.
 * The literals below are the ledger values and are used only where there is no computed
 * style to read — a server render, or a test environment without a layout engine.
 */
export interface Palette {
  protected: string;
  narrow: string;
  exposed: string;
  ground: string;
  boundary: string;
  select: string;
}

const LEDGER_PALETTE: Palette = {
  protected: '#22261c',
  narrow: '#b07f2e',
  exposed: '#ad4127',
  ground: '#dfe3da',
  boundary: 'rgba(20, 23, 15, 0.2)',
  select: '#14170f',
};

const PALETTE_VARS: ReadonlyArray<[keyof Palette, string]> = [
  ['protected', '--mark-protected'],
  ['narrow', '--mark-narrow'],
  ['exposed', '--mark-exposed'],
  ['ground', '--mark-ground'],
  ['boundary', '--mark-boundary'],
  ['select', '--mark-select'],
];

export function readPalette(element: Element | null): Palette {
  if (!element || typeof window === 'undefined' || !window.getComputedStyle) {
    return LEDGER_PALETTE;
  }
  const style = window.getComputedStyle(element);
  const palette = { ...LEDGER_PALETTE };
  for (const [key, variable] of PALETTE_VARS) {
    const value = style.getPropertyValue(variable).trim();
    if (value) palette[key] = value;
  }
  return palette;
}

/** Kept as the single definition of the mapping, and asserted against exposureOf. */
export function colourFor(size: number, palette: Palette = LEDGER_PALETTE): string {
  const exposure = exposureOf(size);
  if (exposure === 'exposed') return palette.exposed;
  if (exposure === 'narrow') return palette.narrow;
  return palette.protected;
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
  const [palette, setPalette] = useState<Palette>(LEDGER_PALETTE);
  const [hoverClass, setHoverClass] = useState<number | null>(null);
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
      { role: 'protected' as const, indices: arrays[0] },
      { role: 'narrow' as const, indices: arrays[1] },
      { role: 'exposed' as const, indices: arrays[2] },
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

  /**
   * The field takes its colours from the stylesheet, and re-reads them when the ground
   * changes. Canvas cannot inherit a custom property, so this is the join between the
   * two grounds and the one drawing surface that is not CSS.
   */
  useEffect(() => {
    const read = () => setPalette(readPalette(wrapRef.current));
    read();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
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
      if (
        canvas.width !== Math.round(cssWidth * dpr) ||
        canvas.height !== Math.round(cssHeight * dpr)
      ) {
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = palette.ground;
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

      // First paint: the population arrives rather than appearing. One alpha ramp over
      // the same transition, which costs nothing per mark — the positions are already
      // final, so nothing is being implied about where a record came from.
      ctx.globalAlpha = from ? 1 : EASE(progress);

      // One pass over precomputed buckets: no allocation inside the frame.
      for (const bucket of buckets) {
        if (bucket.indices.length === 0) continue;
        ctx.fillStyle = palette[bucket.role];
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

      ctx.globalAlpha = 1;

      // At close zoom, classes gain a boundary — the second reading (DESIGN §5.1).
      if (zoom >= 4) {
        ctx.strokeStyle = palette.boundary;
        ctx.lineWidth = 1;
        for (const box of layout.boxes) {
          if (!box) continue;
          const bx = offsetX + box.x * scale;
          const by = offsetY + box.y * scale;
          const bw = box.w * scale;
          const bh = box.h * scale;
          if (bx + bw < 0 || by + bh < 0 || bx > cssWidth || by > cssHeight) continue;
          ctx.strokeRect(
            Math.round(bx) + 0.5,
            Math.round(by) + 0.5,
            Math.round(bw),
            Math.round(bh),
          );
        }
      }

      // The class under the pointer gets a hairline before it gets a click, so the
      // thing the readout is describing is visible in the field at the same moment.
      if (hoverClass != null && hoverClass !== selectedClass && layout.boxes[hoverClass]) {
        const box = layout.boxes[hoverClass];
        ctx.strokeStyle = palette.boundary;
        ctx.lineWidth = 1;
        ctx.strokeRect(
          offsetX + box.x * scale - 1.5,
          offsetY + box.y * scale - 1.5,
          box.w * scale + 3,
          box.h * scale + 3,
        );
      }

      if (selectedClass != null && layout.boxes[selectedClass]) {
        const box = layout.boxes[selectedClass];
        const bx = offsetX + box.x * scale;
        const by = offsetY + box.y * scale;
        const bw = box.w * scale;
        const bh = box.h * scale;
        // Crosshairs to the edges: at 200,000 marks a 3 px box is not findable on its
        // own, and the selected class is usually the smallest one in the field.
        ctx.strokeStyle = palette.boundary;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(by + bh / 2) + 0.5);
        ctx.lineTo(Math.max(0, bx - 4), Math.round(by + bh / 2) + 0.5);
        ctx.moveTo(Math.min(cssWidth, bx + bw + 4), Math.round(by + bh / 2) + 0.5);
        ctx.lineTo(cssWidth, Math.round(by + bh / 2) + 0.5);
        ctx.moveTo(Math.round(bx + bw / 2) + 0.5, 0);
        ctx.lineTo(Math.round(bx + bw / 2) + 0.5, Math.max(0, by - 4));
        ctx.moveTo(Math.round(bx + bw / 2) + 0.5, Math.min(cssHeight, by + bh + 4));
        ctx.lineTo(Math.round(bx + bw / 2) + 0.5, cssHeight);
        ctx.stroke();

        ctx.strokeStyle = palette.select;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
      }
    },
    [layout, buckets, width, height, zoom, selectedClass, hoverClass, palette],
  );

  // Coalescence: one rAF loop, all marks moving together (DESIGN §6.3).
  useEffect(() => {
    const from = previousLayout.current;
    const shouldAnimate = !reducedMotion && (from === null || from.x.length === layout.x.length);

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
  }, [zoom, width, height, selectedClass, hoverClass, palette, draw, layout]);

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
      setHoverClass(null);
      onHover(null);
      return;
    }
    setHoverClass(layout.classOf[i]);
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
        onPointerLeave={() => {
          setHoverClass(null);
          onHover?.(null);
        }}
        onPointerDown={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label={`Field of ${recordCount} records in ${set.classes.length} equivalence classes. Smallest class ${set.k}. ${set.singletons} records stand alone. Use the arrow keys to walk the classes, End for the smallest.`}
      />
    </div>
  );
}

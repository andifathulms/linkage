/**
 * Field layout. CLAUDE.md §6, DESIGN.md §5.1.
 *
 * Every record is one mark, laid out grouped by equivalence class. Records that cannot
 * be told apart sit together; a record nobody can hide among sits alone with space
 * around it, and that single mark is the app's whole argument.
 *
 * Two properties the packing must have, both load-bearing:
 *
 *   Singletons get deliberate padding. Their isolation is the visual encoding, not a
 *   side effect — DESIGN §5.1 requires the packing to produce it rather than leave it to
 *   chance.
 *
 *   A record must not move when an unrelated class changes. Otherwise the coalescence
 *   animation is noise instead of information. This is why classes are placed in an
 *   order derived from their own key and size, and members are placed by their position
 *   within their class — nothing depends on a global index that shifts when some other
 *   class splits.
 *
 * Pure: no canvas, no DOM. The renderer consumes positions; the tests consume the same
 * ones.
 */
import type { ClassSet } from '../../engine/classes';

export interface FieldLayout {
  /** x[i], y[i] for record index i, in field units. */
  x: Float32Array;
  y: Float32Array;
  /** Class index per record, so the renderer can colour by exposure without a lookup. */
  classOf: Int32Array;
  width: number;
  height: number;
  /** Per-class bounding boxes, for the hover readout and the class outline at zoom. */
  boxes: ClassBox[];
  markSize: number;
}

export interface ClassBox {
  classIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
}

export interface LayoutOptions {
  /** Aspect ratio to fill. Layout is in abstract units; the renderer scales. */
  aspect: number;
  /** Spacing between marks within a class, in mark widths. */
  gap?: number;
  /** Extra padding around a class, in mark widths, as a function of its size. */
  padding?: (size: number) => number;
}

/**
 * Padding by class size. A singleton gets the most, a pair nearly as much, and a class
 * of five or more gets the base amount. The curve is deliberate: the field should read
 * as isolated points at k=1 and as clumps once k is satisfied, and the transition
 * between those two readings is what the coalescence animation shows.
 */
export function defaultPadding(size: number): number {
  if (size === 1) return 3.2;
  if (size === 2) return 2.2;
  if (size <= 4) return 1.5;
  return 0.8;
}

/**
 * Lay a class out as a near-square block of marks, and return its dimensions in mark
 * units including padding.
 */
function classDimensions(size: number, gap: number, pad: number): { cols: number; rows: number; w: number; h: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(size)));
  const rows = Math.max(1, Math.ceil(size / cols));
  const w = cols * (1 + gap) - gap + pad * 2;
  const h = rows * (1 + gap) - gap + pad * 2;
  return { cols, rows, w, h };
}

/**
 * Shelf packing in a stable order.
 *
 * Classes are sorted by size descending, ties broken by key, and laid into rows that
 * wrap at the target width. Sorting by size means a class's neighbours change only when
 * its own size changes relative to others — which is exactly when the reader should see
 * movement — and the key tiebreak makes the order deterministic across runs.
 */
export function layoutField(set: ClassSet, recordCount: number, options: LayoutOptions): FieldLayout {
  const gap = options.gap ?? 0.35;
  const padding = options.padding ?? defaultPadding;

  const order = set.classes.map((_, i) => i);
  order.sort((a, b) => {
    const d = set.classes[b].members.length - set.classes[a].members.length;
    if (d !== 0) return d;
    return set.classes[a].key < set.classes[b].key ? -1 : 1;
  });

  // Total mark area, to pick a target width that fills the requested aspect.
  let area = 0;
  const dims = new Map<number, ReturnType<typeof classDimensions>>();
  for (const ci of order) {
    const size = set.classes[ci].members.length;
    const d = classDimensions(size, gap, padding(size));
    dims.set(ci, d);
    area += d.w * d.h;
  }
  const targetWidth = Math.max(1, Math.sqrt(area * options.aspect));

  const x = new Float32Array(recordCount);
  const y = new Float32Array(recordCount);
  const classOf = new Int32Array(recordCount);
  const boxes: ClassBox[] = new Array(set.classes.length);

  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;
  let maxX = 0;

  for (const ci of order) {
    const cls = set.classes[ci];
    const d = dims.get(ci)!;
    if (cursorX > 0 && cursorX + d.w > targetWidth) {
      cursorX = 0;
      cursorY += shelfHeight;
      shelfHeight = 0;
    }

    const pad = padding(cls.members.length);
    boxes[ci] = { classIndex: ci, x: cursorX, y: cursorY, w: d.w, h: d.h, size: cls.members.length };

    // Members are placed by their position within the class, so a record's offset
    // depends on its own class and nothing else.
    for (let m = 0; m < cls.members.length; m++) {
      const recordIndex = cls.members[m];
      const col = m % d.cols;
      const row = Math.floor(m / d.cols);
      x[recordIndex] = cursorX + pad + col * (1 + gap);
      y[recordIndex] = cursorY + pad + row * (1 + gap);
      classOf[recordIndex] = ci;
    }

    cursorX += d.w;
    shelfHeight = Math.max(shelfHeight, d.h);
    maxX = Math.max(maxX, cursorX);
  }

  return {
    x,
    y,
    classOf,
    width: Math.max(1, maxX),
    height: Math.max(1, cursorY + shelfHeight),
    boxes,
    markSize: 1,
  };
}

/**
 * Hit test by dividing pointer coordinates into a uniform grid over the layout, so one
 * listener serves 200,000 marks without a per-mark handler (CLAUDE.md §6).
 */
export class FieldIndex {
  private readonly cells: Map<number, number[]> = new Map();
  private readonly cellSize: number;
  private readonly cols: number;

  constructor(
    private readonly layout: FieldLayout,
    cellSize = 4,
  ) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(layout.width / cellSize) + 1;
    for (let i = 0; i < layout.x.length; i++) {
      const key = this.cellKey(layout.x[i], layout.y[i]);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(i);
      else this.cells.set(key, [i]);
    }
  }

  private cellKey(x: number, y: number): number {
    return Math.floor(y / this.cellSize) * this.cols + Math.floor(x / this.cellSize);
  }

  /** Nearest record index within `radius` field units, or null. */
  nearest(x: number, y: number, radius = 2): number | null {
    let best: number | null = null;
    let bestDistance = radius * radius;
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const bucket = this.cells.get((cy + dy) * this.cols + (cx + dx));
        if (!bucket) continue;
        for (const i of bucket) {
          const ddx = this.layout.x[i] - x;
          const ddy = this.layout.y[i] - y;
          const d = ddx * ddx + ddy * ddy;
          if (d < bestDistance) {
            bestDistance = d;
            best = i;
          }
        }
      }
    }
    return best;
  }
}

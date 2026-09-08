/**
 * Minimal generalisation achieving a target k, over the product of per-column taxonomy
 * levels. PRD §5.3, CLAUDE.md §4.
 *
 * Monotonicity is the whole algorithm: if a generalisation vector satisfies k, every
 * vector above it does too, because coarsening a column can only merge equivalence
 * classes and merging can only raise the minimum class size. So a satisfying node prunes
 * everything above it, a failing node prunes everything below it, and only the frontier
 * needs testing.
 *
 * `prunedBy` and `order` exist for the visualisation and are not overhead to be
 * optimised away: they are what makes the lattice view an honest picture of a search
 * rather than a re-enactment of one.
 */
import type { GeneralisationVector, PersonRecord } from './types';
import type { Taxonomy } from './taxonomy';
import { generaliseValue, vectorKey, QUASI_COLUMNS } from './generalise';

export interface LatticeNode {
  vector: GeneralisationVector;
  /** Sum of component levels. Position in the lattice's vertical reading. */
  level: number;
  satisfies: boolean | null;
  k: number | null;
  informationLoss: number;
  tested: boolean;
  /** Key of the node whose result implied this one, or null if tested directly. */
  prunedBy: string | null;
}

export interface LatticeSearch {
  nodes: LatticeNode[];
  byKey: Map<string, LatticeNode>;
  minimal: GeneralisationVector[];
  /** Exact test order, for the animation. */
  order: string[];
  /** Nodes actually evaluated against the population. */
  testedCount: number;
  /** Nodes whose result was inferred by monotonicity. */
  prunedCount: number;
  columns: readonly string[];
  targetK: number;
}

/**
 * Information loss for a vector, as the mean normalised taxonomy height across columns.
 *
 * A column generalised to level 2 of 4 has lost half its precision, by this measure. It
 * is the Prec metric from the k-anonymity literature, and it is deliberately simple:
 * the frontier view needs an ordering that a reader can follow, and a more elaborate
 * loss function would make the minimal set harder to argue about, not easier.
 */
export function informationLoss(
  vector: GeneralisationVector,
  taxonomy: Taxonomy,
  columns: readonly string[] = QUASI_COLUMNS,
): number {
  let total = 0;
  let counted = 0;
  for (const c of columns) {
    const t = taxonomy[c];
    if (!t) continue;
    const height = t.levels.length - 1;
    if (height <= 0) continue;
    total += Math.min(vector[c] ?? 0, height) / height;
    counted++;
  }
  return counted === 0 ? 0 : total / counted;
}

function enumerateVectors(
  taxonomy: Taxonomy,
  columns: readonly string[],
): GeneralisationVector[] {
  const heights = columns.map((c) => (taxonomy[c]?.levels.length ?? 1) - 1);
  const out: GeneralisationVector[] = [];
  const current = new Array(columns.length).fill(0);

  const recurse = (i: number): void => {
    if (i === columns.length) {
      const v: GeneralisationVector = {};
      columns.forEach((c, j) => {
        v[c] = current[j];
      });
      out.push(v);
      return;
    }
    for (let level = 0; level <= heights[i]; level++) {
      current[i] = level;
      recurse(i + 1);
    }
    current[i] = 0;
  };
  recurse(0);
  return out;
}

/** a ≤ b componentwise: b is at or above a in the lattice. */
function dominates(a: GeneralisationVector, b: GeneralisationVector, columns: readonly string[]): boolean {
  for (const c of columns) if ((a[c] ?? 0) > (b[c] ?? 0)) return false;
  return true;
}

export interface SearchOptions {
  columns?: readonly string[];
  /** Evaluate every node rather than pruning. For the exhaustive-versus-pruned test. */
  exhaustive?: boolean;
  /**
   * A probe prepared over the same records, taxonomy and columns.
   *
   * k is a property of a vector and a population. It does not depend on the target, so
   * a caller sweeping the target can prepare once and search many times rather than
   * re-deriving every column at every rung on each move. Optional: omitted, the search
   * prepares its own and behaves exactly as before.
   */
  probe?: LatticeProbe;
}

/**
 * The part of a lattice search that depends on the population rather than on the target.
 *
 * Every column at every rung, generalised once and interned to a small integer, plus a
 * memo of the k each vector produces. Preparing this is the expensive half of a search;
 * reusing it is what makes moving the target cheap.
 */
export interface LatticeProbe {
  /** The smallest class the vector produces. Memoised across searches. */
  k(vector: GeneralisationVector): number;
  columns: readonly string[];
}

export function prepareLattice(
  records: readonly PersonRecord[],
  taxonomy: Taxonomy,
  columns: readonly string[] = QUASI_COLUMNS,
): LatticeProbe {
  interface Lane {
    ids: Int32Array;
    /** Distinct values this column takes at this rung. */
    cardinality: number;
  }
  const codes = new Map<string, Lane[]>();
  for (const column of columns) {
    const rungs = taxonomy[column]?.levels.length ?? 1;
    const perLevel: Lane[] = [];
    for (let level = 0; level < rungs; level++) {
      const ids = new Int32Array(records.length);
      const seen = new Map<string, number>();
      for (let i = 0; i < records.length; i++) {
        const value = String(generaliseValue(taxonomy, column, level, records[i].quasi[column]));
        let id = seen.get(value);
        if (id === undefined) {
          id = seen.size;
          seen.set(value, id);
        }
        ids[i] = id;
      }
      perLevel.push({ ids, cardinality: Math.max(1, seen.size) });
    }
    codes.set(column, perLevel);
  }

  const memo = new Map<string, number>();

  /**
   * Where the product of the columns' cardinalities fits in an exact integer, the ids
   * pack into one number and the count runs on numeric keys. Where it does not, the same
   * count runs on a string key. Both group by exactly the same thing and return the same
   * k; the packing is an encoding, not an approximation, and the guard keeps it exact.
   */
  const compute = (vector: GeneralisationVector): number => {
    if (records.length === 0) return 0;
    const lanes: Lane[] = columns.map((c) => {
      const perLevel = codes.get(c)!;
      return perLevel[Math.min(vector[c] ?? 0, perLevel.length - 1)];
    });

    let product = 1;
    for (const lane of lanes) product *= lane.cardinality;

    let smallest = Infinity;
    if (Number.isSafeInteger(product)) {
      const counts = new Map<number, number>();
      for (let i = 0; i < records.length; i++) {
        let code = 0;
        for (const lane of lanes) code = code * lane.cardinality + lane.ids[i];
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      for (const count of counts.values()) if (count < smallest) smallest = count;
    } else {
      const counts = new Map<string, number>();
      for (let i = 0; i < records.length; i++) {
        let key = String(lanes[0].ids[i]);
        for (let j = 1; j < lanes.length; j++) key += ',' + lanes[j].ids[i];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const count of counts.values()) if (count < smallest) smallest = count;
    }
    return smallest === Infinity ? 0 : smallest;
  };

  return {
    columns,
    k(vector) {
      const key = vectorKey(vector, columns);
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      const value = compute(vector);
      memo.set(key, value);
      return value;
    },
  };
}

/**
 * The search.
 *
 * Nodes are visited in ascending total level, which is the order that makes pruning pay:
 * a node that satisfies k at a low level implies a large upward cone, and a node that
 * fails implies its whole downward cone. Within a level, ties break on vector key so
 * that the order — and therefore the animation — is deterministic.
 */
export function searchLattice(
  records: readonly PersonRecord[],
  taxonomy: Taxonomy,
  targetK: number,
  options: SearchOptions = {},
): LatticeSearch {
  const columns = options.columns ?? QUASI_COLUMNS;
  const vectors = enumerateVectors(taxonomy, columns);

  const nodes: LatticeNode[] = vectors.map((vector) => ({
    vector,
    level: columns.reduce((s, c) => s + (vector[c] ?? 0), 0),
    satisfies: null,
    k: null,
    informationLoss: informationLoss(vector, taxonomy, columns),
    tested: false,
    prunedBy: null,
  }));

  const byKey = new Map<string, LatticeNode>();
  for (const node of nodes) byKey.set(vectorKey(node.vector, columns), node);

  const visitOrder = [...nodes].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    const ka = vectorKey(a.vector, columns);
    const kb = vectorKey(b.vector, columns);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  // k is a property of the vector and the population, not of the target, so the caller
  // may hand in a probe prepared once and sweep the target against it.
  const probe = options.probe ?? prepareLattice(records, taxonomy, columns);

  const order: string[] = [];
  let testedCount = 0;
  let prunedCount = 0;

  for (const node of visitOrder) {
    const key = vectorKey(node.vector, columns);
    if (!options.exhaustive && node.satisfies !== null) continue;

    const k = probe.k(node.vector);
    node.k = k;
    node.satisfies = k >= targetK;
    node.tested = true;
    testedCount++;
    order.push(key);

    if (options.exhaustive) continue;

    // Monotonic inference. A satisfying node implies everything above it satisfies;
    // a failing node implies everything below it fails. Recording which node implied
    // which is what draws the pruning as inference rather than as absence.
    for (const other of nodes) {
      if (other === node || other.satisfies !== null) continue;
      if (node.satisfies && dominates(node.vector, other.vector, columns)) {
        other.satisfies = true;
        other.prunedBy = key;
        prunedCount++;
      } else if (!node.satisfies && dominates(other.vector, node.vector, columns)) {
        other.satisfies = false;
        other.prunedBy = key;
        prunedCount++;
      }
    }
  }

  return {
    nodes,
    byKey,
    minimal: minimalVectors(nodes, columns),
    order,
    testedCount,
    prunedCount,
    columns,
    targetK,
  };
}

/**
 * The minimal satisfying nodes: satisfying, with no satisfying node strictly below them.
 * These sit on the frontier and are what the search is for.
 */
export function minimalVectors(
  nodes: readonly LatticeNode[],
  columns: readonly string[] = QUASI_COLUMNS,
): GeneralisationVector[] {
  const satisfying = nodes.filter((n) => n.satisfies === true);
  const minimal: GeneralisationVector[] = [];
  for (const node of satisfying) {
    const hasLower = satisfying.some(
      (other) =>
        other !== node &&
        dominates(other.vector, node.vector, columns) &&
        other.level < node.level,
    );
    if (!hasLower) minimal.push(node.vector);
  }
  return minimal.sort((a, b) => {
    const ka = vectorKey(a, columns);
    const kb = vectorKey(b, columns);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Of the minimal vectors, the one that loses least information. */
export function bestMinimal(
  search: LatticeSearch,
  taxonomy: Taxonomy,
): GeneralisationVector | null {
  if (search.minimal.length === 0) return null;
  let best = search.minimal[0];
  let bestLoss = informationLoss(best, taxonomy, search.columns);
  for (const v of search.minimal.slice(1)) {
    const loss = informationLoss(v, taxonomy, search.columns);
    if (loss < bestLoss) {
      best = v;
      bestLoss = loss;
    }
  }
  return best;
}

/**
 * The frontier: satisfying nodes with at least one failing node directly below them.
 * Drawn as a line through the grid (DESIGN §5.3).
 */
export function frontierNodes(search: LatticeSearch): LatticeNode[] {
  const { columns } = search;
  return search.nodes.filter((node) => {
    if (node.satisfies !== true) return false;
    for (const c of columns) {
      const level = node.vector[c] ?? 0;
      if (level === 0) continue;
      const below = { ...node.vector, [c]: level - 1 };
      const other = search.byKey.get(vectorKey(below, columns));
      if (other && other.satisfies === false) return true;
    }
    return false;
  });
}

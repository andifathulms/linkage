/**
 * The generalisation lattice. DESIGN.md §5.3.
 *
 * Nodes as a grid indexed by per-column generalisation level, so position encodes the
 * vector directly and a reader can navigate by geometry.
 *
 * Untested nodes faint. Tested-and-failing hollow. Tested-and-satisfying filled. Pruned
 * nodes drawn with a hairline to the node that implied them, so the pruning is visible
 * as inference rather than as absence.
 *
 * Selecting a node applies its vector to the field above, so the lattice is a navigable
 * control on the field and not a separate illustration.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneralisationVector, PersonRecord } from '../../engine/types';
import type { Taxonomy } from '../../engine/taxonomy';
import {
  searchLattice,
  prepareLattice,
  frontierNodes,
  type LatticeNode,
} from '../../engine/lattice';
import { vectorKey } from '../../engine/generalise';
import { usePrefersReducedMotion } from '../../ui/useReducedMotion';
import { Readout } from '../../ui/primitives';

export interface LatticeProps {
  records: readonly PersonRecord[];
  taxonomy: Taxonomy;
  columns: readonly string[];
  targetK: number;
  onSelect: (vector: GeneralisationVector) => void;
  selected: GeneralisationVector;
}

const CELL = 22;
const NODE = 9;

export function Lattice({ records, taxonomy, columns, targetK, onSelect, selected }: LatticeProps) {
  const reducedMotion = usePrefersReducedMotion();
  /* The expensive half depends on the population, not on the target. Prepared here so
     that moving the target k slider re-runs the pruning against a memo instead of
     generalising every column at every rung again. */
  const probe = useMemo(
    () => prepareLattice(records, taxonomy, columns),
    [records, taxonomy, columns],
  );
  const search = useMemo(
    () => searchLattice(records, taxonomy, targetK, { columns, probe }),
    [records, taxonomy, targetK, columns, probe],
  );
  const frontier = useMemo(
    () => new Set(frontierNodes(search).map((n) => vectorKey(n.vector, columns))),
    [search, columns],
  );
  const minimal = useMemo(
    () => new Set(search.minimal.map((v) => vectorKey(v, columns))),
    [search, columns],
  );

  /**
   * The test order is replayed at 90 ms per node (DESIGN §6.2). Under reduced motion the
   * nodes fill instantly and the step control below remains available.
   */
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reducedMotion) {
      setStep(search.order.length);
      return;
    }
    setStep(0);
    let i = 0;
    const handle = window.setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= search.order.length) window.clearInterval(handle);
    }, 90);
    return () => window.clearInterval(handle);
  }, [search, reducedMotion]);

  const testedByStep = useMemo(() => new Set(search.order.slice(0, step)), [search, step]);

  /**
   * Layout: the first two columns index the grid; any further columns are laid out as
   * repeated blocks, so position still encodes the vector exactly.
   */
  const [colA, colB, ...rest] = columns;
  const heightA = (taxonomy[colA]?.levels.length ?? 1) - 1;
  const heightB = (taxonomy[colB]?.levels.length ?? 1) - 1;
  const restSizes = rest.map((c) => taxonomy[c]?.levels.length ?? 1);
  const blocksPerRow = restSizes[0] ?? 1;
  const blockW = (heightA + 1) * CELL + CELL;
  const blockH = (heightB + 1) * CELL + CELL;
  const blockCount = restSizes.reduce((n, s) => n * s, 1);
  const rows = Math.ceil(blockCount / blocksPerRow);
  const width = blocksPerRow * blockW;
  const height = rows * blockH;

  const positionOf = (node: LatticeNode): { x: number; y: number } => {
    let blockIndex = 0;
    let multiplier = 1;
    rest.forEach((c, i) => {
      blockIndex += (node.vector[c] ?? 0) * multiplier;
      multiplier *= restSizes[i];
    });
    const bx = (blockIndex % blocksPerRow) * blockW;
    const by = Math.floor(blockIndex / blocksPerRow) * blockH;
    return {
      x: bx + (node.vector[colA] ?? 0) * CELL + CELL / 2,
      y: by + (node.vector[colB] ?? 0) * CELL + CELL / 2,
    };
  };

  const selectedKey = vectorKey(selected, columns);

  /**
   * A roving tab stop.
   *
   * Every node used to be tabbable, which put up to 125 stops between the lattice and
   * whatever follows it and no way past except through all of them. The grid is one
   * stop now, and the arrow keys move within it, which is the same contract the field
   * canvas offers and the one a composite widget is supposed to have.
   */
  const nodeKeys = useMemo(
    () => search.nodes.map((node) => vectorKey(node.vector, columns)),
    [search, columns],
  );
  const [rovingKey, setRovingKey] = useState<string | null>(null);
  const nodeRefs = useRef(new Map<string, SVGRectElement>());
  const active = rovingKey ?? selectedKey ?? nodeKeys[0] ?? null;

  const moveTo = (index: number) => {
    const clamped = Math.max(0, Math.min(nodeKeys.length - 1, index));
    const key = nodeKeys[clamped];
    if (!key) return;
    setRovingKey(key);
    nodeRefs.current.get(key)?.focus();
  };

  const onNodeKeyDown = (event: React.KeyboardEvent<SVGRectElement>, node: LatticeNode) => {
    const here = nodeKeys.indexOf(vectorKey(node.vector, columns));
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(node.vector);
        return;
      case 'ArrowRight':
      case 'ArrowDown':
        moveTo(here + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        moveTo(here - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(nodeKeys.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <section className="panel">
      <h2 className="panel__title">
        Generalisation lattice, minimal vectors achieving k = {targetK}
      </h2>

      <div className="readout">
        <Readout label="Nodes" value={search.nodes.length.toLocaleString('en')} />
        <Readout label="Tested" value={search.testedCount.toLocaleString('en')} />
        <Readout label="Inferred by monotonicity" value={search.prunedCount.toLocaleString('en')} />
        <Readout label="Minimal vectors" value={search.minimal.length} />
      </div>

      <svg
        className="lattice"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ maxWidth: width }}
        role="img"
        aria-label={`Lattice of ${search.nodes.length} generalisation vectors. ${search.testedCount} were tested; ${search.prunedCount} were inferred.`}
      >
        {/* Hairlines from an inferred node to the tested node that implied it. */}
        {search.nodes.map((node) => {
          if (!node.prunedBy) return null;
          const source = search.byKey.get(node.prunedBy);
          if (!source) return null;
          if (!testedByStep.has(node.prunedBy)) return null;
          const a = positionOf(node);
          const b = positionOf(source);
          return (
            <line
              key={`p-${vectorKey(node.vector, columns)}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--rule)"
              strokeWidth="0.5"
            />
          );
        })}

        {search.nodes.map((node) => {
          const key = vectorKey(node.vector, columns);
          const known = node.tested
            ? testedByStep.has(key)
            : node.prunedBy !== null && testedByStep.has(node.prunedBy);
          const p = positionOf(node);
          const isMinimal = minimal.has(key);
          const onFrontier = frontier.has(key);
          const isSelected = key === selectedKey;

          const fill = !known ? 'none' : node.satisfies ? 'var(--ink)' : 'none';
          const stroke = !known
            ? 'var(--ink-faint)'
            : node.satisfies
              ? 'var(--ink)'
              : 'var(--ink-mid)';

          return (
            <g key={key}>
              {isMinimal && known && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE / 2 + 3}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth="1"
                />
              )}
              <rect
                x={p.x - NODE / 2}
                y={p.y - NODE / 2}
                width={NODE}
                height={NODE}
                fill={fill}
                stroke={stroke}
                strokeWidth={onFrontier && known ? 1.5 : 1}
                opacity={known ? 1 : 0.5}
                ref={(el) => {
                  if (el) nodeRefs.current.set(key, el);
                  else nodeRefs.current.delete(key);
                }}
                tabIndex={key === active ? 0 : -1}
                role="button"
                aria-label={`Vector ${key}. ${
                  node.k !== null ? `k is ${node.k}.` : 'Inferred.'
                } ${node.satisfies ? 'Satisfies' : 'Does not satisfy'} k = ${targetK}.${
                  isMinimal ? ' Minimal.' : ''
                }`}
                onClick={() => {
                  setRovingKey(key);
                  onSelect(node.vector);
                }}
                onKeyDown={(e) => onNodeKeyDown(e, node)}
                style={{ cursor: 'pointer' }}
              />
              {isSelected && (
                <rect
                  x={p.x - NODE / 2 - 3}
                  y={p.y - NODE / 2 - 3}
                  width={NODE + 6}
                  height={NODE + 6}
                  fill="none"
                  stroke="var(--exposed)"
                  strokeWidth="1.5"
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Step back
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setStep((s) => Math.min(search.order.length, s + 1))}
          disabled={step >= search.order.length}
        >
          Step forward
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setStep(search.order.length)}
        >
          Run to the end
        </button>
        <span className="control__value">
          {step} of {search.order.length} tests
        </span>
      </div>

      <div className="table__scroll" style={{ marginTop: 'var(--s-3)' }}>
        <table className="table">
          <caption className="panel__title">
            Minimal generalisations achieving k = {targetK}
          </caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{taxonomy[c]?.label ?? c}</th>
              ))}
              <th className="num">k</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {search.minimal.map((v) => {
              const node = search.byKey.get(vectorKey(v, columns));
              return (
                <tr key={vectorKey(v, columns)}>
                  {columns.map((c) => (
                    <td key={c}>{taxonomy[c]?.levels[v[c] ?? 0]?.label ?? v[c]}</td>
                  ))}
                  <td className="num">{node?.k ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => onSelect(v)}
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              );
            })}
            {search.minimal.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2}>
                  No generalisation over these columns reaches k = {targetK}, including full
                  suppression.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="note" style={{ marginTop: 'var(--s-2)' }}>
        Generalising further can only merge classes, so it can only raise k. That is why a
        satisfying node implies everything above it and a failing node implies everything below it —
        the hairlines show which result implied which, and only the frontier between them had to be
        tested.
      </p>
    </section>
  );
}

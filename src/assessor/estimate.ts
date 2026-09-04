/**
 * The schema assessor's estimator. PRD §4.7, CLAUDE.md §7.
 *
 * Input is column metadata and a population size. Output is estimated uniqueness under
 * the declared quasi-identifiers, the minimum generalisation needed to reach a target k,
 * the utility cost of that generalisation, and a ranked list of which columns contribute
 * most risk.
 *
 * The estimate uses the same uniqueness mathematics as the Sweeney/Golle reconstruction,
 * applied to declared cardinalities under an independence assumption — and states that
 * assumption, because correlated columns make the estimate optimistic and the assessor
 * must not be trusted blindly by someone about to publish a dataset.
 */
import type { AssessorInput, ColumnDescription, SchemaOnly } from './schema';
import { validateAssessorInput } from './schema';
import {
  uniquenessFromCardinalities,
  expectedClassCount,
  INDEPENDENCE_ASSUMPTION,
} from '../engine/uniqueness';

export interface ColumnRisk {
  name: string;
  cardinality: number;
  /**
   * Uniqueness with this column removed from the quasi-identifier set. The contribution
   * is the drop, which is the honest way to rank: a column's risk is what it adds beyond
   * what the others already give you, not its cardinality in isolation.
   */
  uniquenessWithout: number;
  contribution: number;
}

export interface GeneralisationPlan {
  /** Level chosen per column, indexing its declared generalisationLevels. */
  levels: Array<{ name: string; level: number; label: string; cardinality: number }>;
  /** Expected minimum class size at this plan, under the independence assumption. */
  expectedK: number;
  /** Mean normalised taxonomy height — the same Prec measure the lattice view uses. */
  informationLoss: number;
  /** Whether the target was reached at all. */
  reached: boolean;
}

export interface AssessorReport {
  populationSize: number;
  quasiColumns: string[];
  /** Distinct quasi-identifier combinations, as declared. */
  cells: number;
  /** Estimated share of the population unique on the declared quasi-identifiers. */
  uniqueness: number;
  expectedUniqueRecords: number;
  expectedClasses: number;
  expectedMeanClassSize: number;
  ranked: ColumnRisk[];
  plan: GeneralisationPlan | null;
  targetK: number;
  assumption: string;
  /** Anything about the declaration itself worth saying before the numbers are read. */
  caveats: string[];
}

function cellsOf(cardinalities: readonly number[]): number {
  let cells = 1;
  for (const c of cardinalities) cells *= Math.max(1, c);
  return cells;
}

/**
 * Expected minimum class size is not the mean. With n records over c cells the mean is
 * n/c, and the minimum over occupied cells is far smaller — which is the whole reason
 * k is defined as a minimum. This uses the expected count in the sparsest occupied cell
 * under a Poisson approximation, floored at 1 because an occupied cell holds someone.
 */
function expectedMinimumClassSize(populationSize: number, cells: number): number {
  if (cells <= 1) return populationSize;
  const lambda = populationSize / cells;
  // With many cells, singletons are near-certain unless lambda is large. The expected
  // minimum is 1 whenever any cell is expected to hold exactly one record.
  const expectedSingletonCells = cells * lambda * Math.exp(-lambda);
  if (expectedSingletonCells >= 1) return 1;
  // Otherwise fall back to the mean occupancy of occupied cells.
  const occupied = expectedClassCount(populationSize, cells);
  return occupied === 0 ? populationSize : populationSize / occupied;
}

/**
 * Minimum generalisation reaching the target k, searched over the declared level
 * product. Same monotonicity as the lattice search: coarsening can only merge cells, so
 * the first plan found in ascending total level is minimal.
 */
function planFor(
  columns: readonly ColumnDescription[],
  populationSize: number,
  targetK: number,
): GeneralisationPlan | null {
  const quasi = columns.filter((c) => c.role === 'quasi');
  if (quasi.length === 0) return null;

  // Available levels per column: level 0 is the declared cardinality; further levels come
  // from the declared ladder, with full suppression appended so the search always ends.
  const ladders = quasi.map((c) => {
    const levels = [{ label: 'As declared', cardinality: c.cardinality }, ...c.generalisationLevels];
    if (levels[levels.length - 1].cardinality > 1) levels.push({ label: 'Suppressed', cardinality: 1 });
    return { column: c, levels };
  });

  const heights = ladders.map((l) => l.levels.length - 1);
  const maxTotal = heights.reduce((s, h) => s + h, 0);

  for (let total = 0; total <= maxTotal; total++) {
    const found = searchAtLevel(ladders, heights, total, populationSize, targetK);
    if (found) return found;
  }
  return null;
}

function searchAtLevel(
  ladders: Array<{ column: ColumnDescription; levels: Array<{ label: string; cardinality: number }> }>,
  heights: number[],
  total: number,
  populationSize: number,
  targetK: number,
): GeneralisationPlan | null {
  const current = new Array(ladders.length).fill(0);

  const recurse = (i: number, remaining: number): GeneralisationPlan | null => {
    if (i === ladders.length) {
      if (remaining !== 0) return null;
      const cells = cellsOf(current.map((level, j) => ladders[j].levels[level].cardinality));
      const expectedK = expectedMinimumClassSize(populationSize, cells);
      if (expectedK < targetK) return null;
      return {
        levels: current.map((level, j) => ({
          name: ladders[j].column.name,
          level,
          label: ladders[j].levels[level].label,
          cardinality: ladders[j].levels[level].cardinality,
        })),
        expectedK,
        informationLoss:
          current.reduce((s, level, j) => s + (heights[j] === 0 ? 0 : level / heights[j]), 0) /
          ladders.length,
        reached: true,
      };
    }
    for (let level = 0; level <= Math.min(heights[i], remaining); level++) {
      current[i] = level;
      const found = recurse(i + 1, remaining - level);
      if (found) return found;
    }
    current[i] = 0;
    return null;
  };

  return recurse(0, total);
}

/** Assess a declared schema. Takes its input through the exact-type bound (§0.2). */
export function assess<T extends SchemaOnly<T>>(input: T, targetK = 5): AssessorReport {
  return assessValidated(validateAssessorInput(input), targetK);
}

export function assessValidated(input: AssessorInput, targetK = 5): AssessorReport {
  const quasi = input.columns.filter((c) => c.role === 'quasi');
  const cardinalities = quasi.map((c) => c.cardinality);
  const cells = cellsOf(cardinalities);

  const uniqueness = quasi.length === 0 ? 0 : uniquenessFromCardinalities(input.populationSize, cardinalities);
  const expectedClasses = Math.min(cells, expectedClassCount(input.populationSize, cells));

  const ranked: ColumnRisk[] = quasi
    .map((c) => {
      const without = quasi.filter((o) => o !== c).map((o) => o.cardinality);
      const uniquenessWithout =
        without.length === 0 ? 0 : uniquenessFromCardinalities(input.populationSize, without);
      return {
        name: c.name,
        cardinality: c.cardinality,
        uniquenessWithout,
        contribution: uniqueness - uniquenessWithout,
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  const caveats: string[] = [];
  const identifiers = input.columns.filter((c) => c.role === 'identifier');
  if (identifiers.length > 0) {
    caveats.push(
      `${identifiers.length} column${identifiers.length === 1 ? ' is' : 's are'} declared as an identifier. ` +
        'Identifiers are excluded from this estimate on the assumption they will be removed before release. If any is retained, uniqueness is 100% and nothing below applies.',
    );
  }
  if (quasi.length === 0) {
    caveats.push('No column is declared a quasi-identifier, so there is nothing to estimate. The commonest mistake in a declaration is marking too few columns as quasi-identifiers: any attribute an outsider could learn independently belongs in that set.');
  }
  if (input.columns.some((c) => c.role === 'sensitive') === false) {
    caveats.push('No column is declared sensitive, so l-diversity and t-closeness are not assessed here.');
  }
  if (quasi.some((c) => c.generalisationLevels.length === 0)) {
    caveats.push(
      'One or more quasi-identifiers declare no generalisation levels, so the only remedy available to the search for those columns is full suppression.',
    );
  }

  return {
    populationSize: input.populationSize,
    quasiColumns: quasi.map((c) => c.name),
    cells,
    uniqueness,
    expectedUniqueRecords: Math.round(uniqueness * input.populationSize),
    expectedClasses,
    expectedMeanClassSize: expectedClasses === 0 ? 0 : input.populationSize / expectedClasses,
    ranked,
    plan: planFor(input.columns, input.populationSize, targetK),
    targetK,
    assumption: INDEPENDENCE_ASSUMPTION,
    caveats,
  };
}

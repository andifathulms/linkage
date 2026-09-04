/**
 * The schema assessor's input surface. PRD §0.2 and §4.7, CLAUDE.md §7.
 *
 * This is the only mode intended for use against a real dataset, and that dataset is
 * never loaded. The guarantee is structural rather than promised: `AssessorInput`
 * describes a schema, and there is no field in it capable of holding a record.
 *
 * Cardinality is a number. There is no `values`, no `sample`, no `rows`, no `data`.
 *
 * `tests/assessor-purity.test.ts` asserts both halves of that: a type-level test that a
 * record-shaped object fails to type-check against `AssessorInput`, and a runtime test
 * that the validator rejects any property outside the declared set — so a plain JSON
 * object smuggled in at runtime, where types are gone, is refused too.
 */

export type AssessorRole = 'identifier' | 'quasi' | 'sensitive' | 'other';
export type AssessorType = 'categorical' | 'ordinal' | 'date' | 'numeric';

export interface GeneralisationLevelDescription {
  label: string;
  cardinality: number;
}

export interface ColumnDescription {
  name: string;
  role: AssessorRole;
  type: AssessorType;
  cardinality: number;
  generalisationLevels: GeneralisationLevelDescription[];
}

export interface AssessorInput {
  populationSize: number;
  columns: ColumnDescription[];
}

/**
 * Excess-property rejection at the type level.
 *
 * An interface alone does not do this. TypeScript's assignability is structural, so an
 * object that has `populationSize`, `columns` *and* `rows` is assignable to
 * `AssessorInput` — the excess-property check only fires on a fresh object literal, and
 * a value that arrives through a variable slips past it. Declaring the input type and
 * stopping there would therefore have made §0.2 a comment rather than a guarantee.
 *
 * `Only<T, Shape>` maps every property of T outside Shape to `never`, so a type carrying
 * anything extra has no inhabitant that satisfies the constraint. Applied through the
 * self-referential bound `T extends SchemaOnly<T>`, it rejects the extra property at the
 * call site, wherever the value came from.
 */
export type Only<T, Shape> = Shape & {
  [K in Exclude<keyof T, keyof Shape>]: never;
};

export type SchemaOnly<T> = Only<T, AssessorInput>;
export type ColumnOnly<T> = Only<T, ColumnDescription>;

/**
 * The assessor's typed entry point. Every function in the assessor that takes a schema
 * takes it through this bound, so there is one place where the guarantee lives.
 */
export function acceptSchema<T extends SchemaOnly<T>>(input: T): AssessorInput {
  // The runtime validator repeats the check where types no longer exist.
  return validateAssessorInput(input);
}

/** The exhaustive property lists the runtime validator enforces. */
export const ASSESSOR_INPUT_KEYS = ['populationSize', 'columns'] as const;
export const COLUMN_DESCRIPTION_KEYS = [
  'name',
  'role',
  'type',
  'cardinality',
  'generalisationLevels',
] as const;
export const LEVEL_KEYS = ['label', 'cardinality'] as const;

const ROLES: readonly string[] = ['identifier', 'quasi', 'sensitive', 'other'];
const TYPES: readonly string[] = ['categorical', 'ordinal', 'date', 'numeric'];

export class AssessorInputError extends Error {
  constructor(
    message: string,
    /** The offending property path, so the interface can point at it. */
    readonly path: string,
  ) {
    super(message);
    this.name = 'AssessorInputError';
  }
}

function assertOnlyKeys(
  value: object,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new AssessorInputError(
        `Unexpected property "${key}". The assessor accepts column metadata only, never record data.`,
        path === '' ? key : `${path}.${key}`,
      );
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runtime gate. Validates shape and rejects every property outside the declared set,
 * which is the runtime counterpart of the type-level guarantee: the type cannot express
 * a record, and this cannot be handed one.
 */
export function validateAssessorInput(value: unknown): AssessorInput {
  if (!isPlainObject(value)) {
    throw new AssessorInputError('Input must be an object describing a schema.', '');
  }
  assertOnlyKeys(value, ASSESSOR_INPUT_KEYS, '');

  const size = value.populationSize;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 1) {
    throw new AssessorInputError('populationSize must be a positive number.', 'populationSize');
  }

  const columns = value.columns;
  if (!Array.isArray(columns)) {
    throw new AssessorInputError('columns must be an array of column descriptions.', 'columns');
  }

  const validated: ColumnDescription[] = columns.map((column, i) => {
    const path = `columns[${i}]`;
    if (!isPlainObject(column)) {
      throw new AssessorInputError('Each column must be an object.', path);
    }
    assertOnlyKeys(column, COLUMN_DESCRIPTION_KEYS, path);

    if (typeof column.name !== 'string' || column.name.length === 0) {
      throw new AssessorInputError('name must be a non-empty string.', `${path}.name`);
    }
    if (typeof column.role !== 'string' || !ROLES.includes(column.role)) {
      throw new AssessorInputError(`role must be one of ${ROLES.join(', ')}.`, `${path}.role`);
    }
    if (typeof column.type !== 'string' || !TYPES.includes(column.type)) {
      throw new AssessorInputError(`type must be one of ${TYPES.join(', ')}.`, `${path}.type`);
    }
    if (
      typeof column.cardinality !== 'number' ||
      !Number.isFinite(column.cardinality) ||
      column.cardinality < 1
    ) {
      throw new AssessorInputError(
        'cardinality must be a number of at least 1. Declare how many distinct values the column has, not what they are.',
        `${path}.cardinality`,
      );
    }
    if (!Array.isArray(column.generalisationLevels)) {
      throw new AssessorInputError(
        'generalisationLevels must be an array.',
        `${path}.generalisationLevels`,
      );
    }

    const levels: GeneralisationLevelDescription[] = column.generalisationLevels.map((lvl, j) => {
      const lpath = `${path}.generalisationLevels[${j}]`;
      if (!isPlainObject(lvl)) {
        throw new AssessorInputError('Each generalisation level must be an object.', lpath);
      }
      assertOnlyKeys(lvl, LEVEL_KEYS, lpath);
      if (typeof lvl.label !== 'string' || lvl.label.length === 0) {
        throw new AssessorInputError('label must be a non-empty string.', `${lpath}.label`);
      }
      if (
        typeof lvl.cardinality !== 'number' ||
        !Number.isFinite(lvl.cardinality) ||
        lvl.cardinality < 1
      ) {
        throw new AssessorInputError(
          'cardinality must be a number of at least 1.',
          `${lpath}.cardinality`,
        );
      }
      return { label: lvl.label, cardinality: lvl.cardinality };
    });

    // A generalisation ladder that gets finer as it climbs is a declaration error, and
    // silently accepting it would make the minimum-generalisation search meaningless.
    for (let j = 1; j < levels.length; j++) {
      if (levels[j].cardinality > levels[j - 1].cardinality) {
        throw new AssessorInputError(
          'Generalisation levels must not increase in cardinality as they coarsen.',
          `${path}.generalisationLevels[${j}].cardinality`,
        );
      }
    }

    return {
      name: column.name,
      role: column.role as AssessorRole,
      type: column.type as AssessorType,
      cardinality: column.cardinality,
      generalisationLevels: levels,
    };
  });

  return { populationSize: size, columns: validated };
}

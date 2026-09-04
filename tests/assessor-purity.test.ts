/**
 * PRD §0.2 and §7.8. The assessor's input type admits no record-shaped value.
 *
 * Two halves:
 *   - a type-level test, asserting at compile time that record-shaped objects are not
 *     assignable to AssessorInput and that no record-carrying property name exists on it;
 *   - a runtime test, asserting the validator rejects additional properties, since types
 *     are gone at runtime and a plain JSON object could otherwise carry rows in.
 */
import { describe, expect, it } from 'vitest';
import {
  validateAssessorInput,
  AssessorInputError,
  ASSESSOR_INPUT_KEYS,
  COLUMN_DESCRIPTION_KEYS,
  acceptSchema,
  type AssessorInput,
  type ColumnDescription,
  type SchemaOnly,
  type ColumnOnly,
} from '../src/assessor/schema';

/* ------------------------------------------------------------------ type level */

type Extends<A, B> = A extends B ? true : false;
type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;

/** No property of AssessorInput or ColumnDescription may be named for record data. */
type RecordCarryingName =
  | 'values'
  | 'sample'
  | 'samples'
  | 'rows'
  | 'data'
  | 'records'
  | 'entries'
  | 'dataset'
  | 'file'
  | 'csv'
  | 'contents';

type _NoRecordFieldOnInput = Expect<
  Extends<Extract<keyof AssessorInput, RecordCarryingName>, never>
>;
type _NoRecordFieldOnColumn = Expect<
  Extends<Extract<keyof ColumnDescription, RecordCarryingName>, never>
>;

/** Cardinality is a number, not a collection. */
type _CardinalityIsNumber = Expect<Extends<ColumnDescription['cardinality'], number>>;
type _CardinalityIsNotArray = Expect<Not<Extends<ColumnDescription['cardinality'], unknown[]>>>;

/**
 * A record-shaped object does not satisfy the bound the assessor's entry point imposes.
 *
 * Note what is asserted and what is not. `RecordShaped extends AssessorInput` is *true*,
 * because TypeScript's assignability is structural and ignores extra properties on a
 * value that is not a fresh literal. That is precisely why the assessor takes its input
 * through `SchemaOnly<T>` rather than through `AssessorInput` — and why this test asserts
 * against the bound that is actually enforced.
 */
interface RecordShaped {
  populationSize: number;
  columns: ColumnDescription[];
  rows: Array<{ nik: string; name: string; diagnosis: string }>;
}
type _RecordShapedIsNotAccepted = Expect<Not<Extends<RecordShaped, SchemaOnly<RecordShaped>>>>;
type _SchemaIsAccepted = Expect<Extends<AssessorInput, SchemaOnly<AssessorInput>>>;

/** Nor is a column that carries its values rather than declaring how many it has. */
interface ColumnWithValues {
  name: string;
  role: 'quasi';
  type: 'categorical';
  cardinality: number;
  generalisationLevels: Array<{ label: string; cardinality: number }>;
  values: string[];
}
type _ColumnWithValuesIsNotAccepted = Expect<
  Not<Extends<ColumnWithValues, ColumnOnly<ColumnWithValues>>>
>;
type _ColumnIsAccepted = Expect<Extends<ColumnDescription, ColumnOnly<ColumnDescription>>>;

// Reference the type aliases so `noUnusedLocals` keeps them, and so a compile failure
// here fails the build rather than being dead code.
export type AssessorPurityProofs = [
  _NoRecordFieldOnInput,
  _NoRecordFieldOnColumn,
  _CardinalityIsNumber,
  _CardinalityIsNotArray,
  _RecordShapedIsNotAccepted,
  _SchemaIsAccepted,
  _ColumnWithValuesIsNotAccepted,
  _ColumnIsAccepted,
];

/* ---------------------------------------------------------------------- runtime */

const validColumn: ColumnDescription = {
  name: 'kelurahan',
  role: 'quasi',
  type: 'categorical',
  cardinality: 8400,
  generalisationLevels: [
    { label: 'Kelurahan', cardinality: 8400 },
    { label: 'Kecamatan', cardinality: 720 },
    { label: 'Kabupaten', cardinality: 96 },
  ],
};

const validInput: AssessorInput = { populationSize: 200000, columns: [validColumn] };

describe('assessor input type', () => {
  it('declares exactly two top-level properties', () => {
    expect([...ASSESSOR_INPUT_KEYS]).toEqual(['populationSize', 'columns']);
  });

  it('declares exactly five column properties, none of which can hold a record', () => {
    expect([...COLUMN_DESCRIPTION_KEYS]).toEqual([
      'name',
      'role',
      'type',
      'cardinality',
      'generalisationLevels',
    ]);
    for (const key of COLUMN_DESCRIPTION_KEYS) {
      expect(['values', 'sample', 'rows', 'data', 'records']).not.toContain(key);
    }
  });

  it('accepts a well-formed schema through the typed entry point', () => {
    const out = acceptSchema({
      populationSize: 1000,
      columns: [structuredClone(validColumn)],
    });
    expect(out.columns[0].name).toBe('kelurahan');
  });

  it('accepts a well-formed schema', () => {
    const out = validateAssessorInput(structuredClone(validInput));
    expect(out.populationSize).toBe(200000);
    expect(out.columns).toHaveLength(1);
    expect(out.columns[0].cardinality).toBe(8400);
  });
});

describe('assessor input validation rejects record data at runtime', () => {
  const rejects = (value: unknown, path: string) => {
    let error: unknown;
    try {
      validateAssessorInput(value);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AssessorInputError);
    expect((error as AssessorInputError).path).toBe(path);
  };

  it('rejects a rows property', () => {
    rejects({ ...structuredClone(validInput), rows: [{ nik: '3201...', name: 'X' }] }, 'rows');
  });

  it('rejects a data property', () => {
    rejects({ ...structuredClone(validInput), data: 'nik,name\n1,X' }, 'data');
  });

  it('rejects a records property', () => {
    rejects({ ...structuredClone(validInput), records: [] }, 'records');
  });

  it('rejects a values property on a column', () => {
    const input = structuredClone(validInput);
    (input.columns[0] as unknown as Record<string, unknown>).values = ['3201010001'];
    rejects(input, 'columns[0].values');
  });

  it('rejects a sample property on a column', () => {
    const input = structuredClone(validInput);
    (input.columns[0] as unknown as Record<string, unknown>).sample = ['a', 'b'];
    rejects(input, 'columns[0].sample');
  });

  it('rejects an array where cardinality belongs', () => {
    const input = structuredClone(validInput);
    (input.columns[0] as unknown as Record<string, unknown>).cardinality = ['a', 'b', 'c'];
    rejects(input, 'columns[0].cardinality');
  });

  it('rejects extra properties on a generalisation level', () => {
    const input = structuredClone(validInput);
    (input.columns[0].generalisationLevels[0] as unknown as Record<string, unknown>).members = [];
    rejects(input, 'columns[0].generalisationLevels[0].members');
  });

  it('rejects a whole CSV string handed in as the input', () => {
    rejects('nik,name,diagnosis\n3201...,X,Cardiac', '');
  });

  it('rejects an array of records handed in as the input', () => {
    rejects([{ nik: '3201...', diagnosis: 'Cardiac' }], '');
  });

  it('rejects a generalisation ladder that gets finer as it coarsens', () => {
    const input = structuredClone(validInput);
    input.columns[0].generalisationLevels = [
      { label: 'Kecamatan', cardinality: 720 },
      { label: 'Kelurahan', cardinality: 8400 },
    ];
    rejects(input, 'columns[0].generalisationLevels[1].cardinality');
  });

  it('rejects a non-positive population size', () => {
    rejects({ ...structuredClone(validInput), populationSize: 0 }, 'populationSize');
  });

  it('returns a copy carrying only the declared properties', () => {
    const out = validateAssessorInput(structuredClone(validInput));
    expect(Object.keys(out).sort()).toEqual(['columns', 'populationSize']);
    expect(Object.keys(out.columns[0]).sort()).toEqual([
      'cardinality',
      'generalisationLevels',
      'name',
      'role',
      'type',
    ]);
  });
});

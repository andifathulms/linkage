/**
 * The schema assessor. DESIGN.md §5.9, PRD §4.7.
 *
 * Deliberately plainer than everything else — a form and a table, no field, no
 * animation. It is a working tool rather than an explainer and should feel like one.
 *
 * Its output leads with the assumption it made.
 *
 * There is no file input here, and there could not be: the input type has no field
 * capable of holding a record (PRD §0.2), and the form collects cardinalities, which are
 * numbers.
 */
import { useMemo, useState } from 'react';
import type { AssessorRole, AssessorType, ColumnDescription } from '../../assessor/schema';
import { validateAssessorInput, AssessorInputError } from '../../assessor/schema';
import { assessValidated } from '../../assessor/estimate';
import { toCsv, downloadCsv } from '../../ui/csv';

const ROLES: AssessorRole[] = ['quasi', 'sensitive', 'identifier', 'other'];
const TYPES: AssessorType[] = ['categorical', 'ordinal', 'date', 'numeric'];

/** A plausible starting declaration, so the tool is legible before it is filled in. */
const INITIAL: ColumnDescription[] = [
  {
    name: 'nik',
    role: 'identifier',
    type: 'categorical',
    cardinality: 200000,
    generalisationLevels: [],
  },
  {
    name: 'kelurahan',
    role: 'quasi',
    type: 'categorical',
    cardinality: 8400,
    generalisationLevels: [
      { label: 'Kecamatan', cardinality: 7200 },
      { label: 'Kabupaten/kota', cardinality: 514 },
      { label: 'Provinsi', cardinality: 38 },
    ],
  },
  {
    name: 'birthdate',
    role: 'quasi',
    type: 'date',
    cardinality: 29200,
    generalisationLevels: [
      { label: 'Month and year', cardinality: 960 },
      { label: 'Year', cardinality: 80 },
      { label: 'Five-year band', cardinality: 16 },
    ],
  },
  {
    name: 'gender',
    role: 'quasi',
    type: 'categorical',
    cardinality: 2,
    generalisationLevels: [],
  },
  {
    name: 'diagnosis',
    role: 'sensitive',
    type: 'categorical',
    cardinality: 40,
    generalisationLevels: [{ label: 'Chapter', cardinality: 8 }],
  },
];

export function Assessor() {
  const [populationSize, setPopulationSize] = useState(200000);
  const [targetK, setTargetK] = useState(5);
  const [columns, setColumns] = useState<ColumnDescription[]>(INITIAL);

  const outcome = useMemo(() => {
    try {
      const validated = validateAssessorInput({ populationSize, columns });
      return { report: assessValidated(validated, targetK), error: null as string | null };
    } catch (e) {
      return {
        report: null,
        error: e instanceof AssessorInputError ? `${e.path ? `${e.path}: ` : ''}${e.message}` : String(e),
      };
    }
  }, [populationSize, columns, targetK]);

  const patch = (i: number, next: Partial<ColumnDescription>) =>
    setColumns((cs) => cs.map((c, j) => (j === i ? { ...c, ...next } : c)));

  const addColumn = () =>
    setColumns((cs) => [
      ...cs,
      { name: `column_${cs.length + 1}`, role: 'quasi', type: 'categorical', cardinality: 10, generalisationLevels: [] },
    ]);

  const exportReport = () => {
    const report = outcome.report;
    if (!report) return;
    const csv = toCsv(
      ['column', 'cardinality', 'uniqueness_without', 'contribution'],
      report.ranked.map((r) => [
        r.name,
        r.cardinality,
        r.uniquenessWithout.toFixed(6),
        r.contribution.toFixed(6),
      ]),
    );
    downloadCsv('linkage-assessor-report.csv', csv);
  };

  const report = outcome.report;

  return (
    <section className="panel assessor" aria-label="Schema assessor">
      <div className="panel__title">Schema assessor</div>

      <p className="note">
        Describe your columns. This tool takes a schema — a name, a role, a type, a cardinality and a
        generalisation ladder — and never a row of data. There is no way to give it one: the input
        type has no field capable of holding a record, and the validator rejects any property outside
        the five above.
      </p>

      <div className="assessor__head">
        <div className="control">
          <label className="control__label" htmlFor="assessor-size">
            Population size
          </label>
          <input
            id="assessor-size"
            className="input"
            type="number"
            min={1}
            value={populationSize}
            onChange={(e) => setPopulationSize(Number(e.target.value))}
          />
          <span className="control__value" />
        </div>
        <div className="control">
          <label className="control__label" htmlFor="assessor-k">
            Target k
          </label>
          <input
            id="assessor-k"
            className="input"
            type="number"
            min={1}
            value={targetK}
            onChange={(e) => setTargetK(Math.max(1, Number(e.target.value)))}
          />
          <span className="control__value" />
        </div>
      </div>

      <div className="table__scroll">
        <table className="table">
          <caption className="panel__title">Columns</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Type</th>
              <th className="num">Cardinality</th>
              <th>Generalisation levels, coarsening</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {columns.map((column, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="input"
                    aria-label={`Name of column ${i + 1}`}
                    value={column.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="select"
                    aria-label={`Role of ${column.name}`}
                    value={column.role}
                    onChange={(e) => patch(i, { role: e.target.value as AssessorRole })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="select"
                    aria-label={`Type of ${column.name}`}
                    value={column.type}
                    onChange={(e) => patch(i, { type: e.target.value as AssessorType })}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    className="input input--num"
                    type="number"
                    min={1}
                    aria-label={`Cardinality of ${column.name}`}
                    value={column.cardinality}
                    onChange={(e) => patch(i, { cardinality: Math.max(1, Number(e.target.value)) })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    aria-label={`Generalisation level cardinalities for ${column.name}, comma separated`}
                    value={column.generalisationLevels.map((l) => l.cardinality).join(', ')}
                    placeholder="e.g. 720, 96, 38"
                    onChange={(e) => {
                      const values = e.target.value
                        .split(',')
                        .map((v) => Number(v.trim()))
                        .filter((v) => Number.isFinite(v) && v >= 1);
                      patch(i, {
                        generalisationLevels: values.map((cardinality, j) => ({
                          label: `Level ${j + 1}`,
                          cardinality,
                        })),
                      });
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => setColumns((cs) => cs.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="button button--quiet" onClick={addColumn}>
          Add a column
        </button>
        <button type="button" className="button button--quiet" onClick={exportReport} disabled={!report}>
          Export the ranking as CSV
        </button>
      </div>

      {outcome.error && (
        <p className="note" style={{ marginTop: 'var(--s-3)', color: 'var(--exposed)' }}>
          {outcome.error}
        </p>
      )}

      {report && (
        <div style={{ marginTop: 'var(--s-4)' }}>
          {/* The output leads with the assumption it made (DESIGN §5.9). */}
          <p className="assumption" style={{ marginBottom: 'var(--s-3)' }}>
            {report.assumption} Treat every figure below as a lower bound on risk.
          </p>

          {report.caveats.map((caveat, i) => (
            <p key={i} className="note">
              {caveat}
            </p>
          ))}

          <div className="readout" style={{ marginTop: 'var(--s-3)' }}>
            <div className="readout__item">
              <span className="readout__label">Estimated uniqueness</span>
              <span
                className={`display${report.uniqueness > 0.2 ? ' readout__value--exposed' : ''}`}
              >
                {(report.uniqueness * 100).toFixed(1)}%
              </span>
            </div>
            <div className="readout__item">
              <span className="readout__label">Records expected to be unique</span>
              <span className="readout__value">
                {report.expectedUniqueRecords.toLocaleString('en')} of{' '}
                {report.populationSize.toLocaleString('en')}
              </span>
            </div>
            <div className="readout__item">
              <span className="readout__label">Quasi-identifier combinations declared</span>
              <span className="readout__value">{report.cells.toLocaleString('en')}</span>
            </div>
            <div className="readout__item">
              <span className="readout__label">Expected mean class size</span>
              <span className="readout__value">{report.expectedMeanClassSize.toFixed(1)}</span>
            </div>
          </div>

          <table className="table" style={{ marginTop: 'var(--s-3)' }}>
            <caption className="panel__title">
              Which columns contribute most risk, ranked by what each adds beyond the others
            </caption>
            <thead>
              <tr>
                <th>Column</th>
                <th className="num">Cardinality</th>
                <th className="num">Uniqueness without it</th>
                <th className="num">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {report.ranked.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r.cardinality.toLocaleString('en')}</td>
                  <td className="num">{(r.uniquenessWithout * 100).toFixed(1)}%</td>
                  <td className="num">{(r.contribution * 100).toFixed(1)}pp</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="table" style={{ marginTop: 'var(--s-3)' }}>
            <caption className="panel__title">
              Minimum generalisation estimated to reach k = {report.targetK}
            </caption>
            <thead>
              <tr>
                <th>Column</th>
                <th>Level</th>
                <th className="num">Cardinality at that level</th>
              </tr>
            </thead>
            <tbody>
              {report.plan ? (
                report.plan.levels.map((l) => (
                  <tr key={l.name}>
                    <td>{l.name}</td>
                    <td>{l.label}</td>
                    <td className="num">{l.cardinality.toLocaleString('en')}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>
                    No combination of the declared generalisation levels is estimated to reach k ={' '}
                    {report.targetK}, including full suppression of every quasi-identifier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {report.plan && (
            <p className="note">
              Information loss at that plan: {(report.plan.informationLoss * 100).toFixed(0)}% of the
              declared generalisation height, averaged across quasi-identifiers. That is the
              precision your data users would lose.
            </p>
          )}

          <p className="note">
            This estimate is not a clearance. It assumes your declared cardinalities are right, that
            your columns are independent, and that the quasi-identifier set you declared is the one
            an attacker would actually hold. Each of those has been wrong in a published
            re-identification incident.
          </p>
        </div>
      )}
    </section>
  );
}

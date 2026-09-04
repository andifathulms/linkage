/**
 * The sandbox. PRD §4.5.
 *
 * All generator parameters, all defenses, all attacks, free composition. Unlocked after
 * case 5, which is what keeps a five-defense sequence from being a wall of sliders on
 * first load (DESIGN §4.2).
 *
 * The privacy–utility frontier is its centre.
 */
import { useState } from 'react';
import type { CaseProps } from './shared';
import { FieldPanel } from '../views/Field/FieldPanel';
import { ClassInspector } from '../views/ClassInspector/ClassInspector';
import { Generalisation } from '../views/Generalisation';
import { Lattice } from '../views/Lattice/Lattice';
import { Nik } from '../views/Nik/Nik';
import { Frontier } from '../views/Frontier/Frontier';
import { Uniqueness } from '../views/Uniqueness/Uniqueness';
import { Assessor } from '../views/Assessor/Assessor';
import { Differencing } from '../views/Differencing/Differencing';
import { BudgetPanel } from '../views/Budget/Budget';
import { Slider } from '../ui/primitives';
import { QUASI } from '../state/store';
import { toCsv, downloadCsv } from '../ui/csv';

type Instrument =
  'lattice' | 'nik' | 'frontier' | 'uniqueness' | 'differencing' | 'budget' | 'assessor';

const INSTRUMENTS: Array<{ id: Instrument; label: string }> = [
  { id: 'frontier', label: 'Frontier' },
  { id: 'lattice', label: 'Lattice' },
  { id: 'nik', label: 'NIK' },
  { id: 'uniqueness', label: 'Uniqueness' },
  { id: 'differencing', label: 'Differencing' },
  { id: 'budget', label: 'Budget' },
  { id: 'assessor', label: 'Assessor' },
];

/**
 * The lattice is searched over three columns rather than four. The product of four full
 * taxonomies is 250 nodes, which is fine to search but illegible as a grid; three keeps
 * position encoding the vector directly, which is the point of drawing it (DESIGN §5.3).
 */
const LATTICE_COLUMNS = ['kelurahan', 'age', 'gender'];

export function Sandbox({ derived, config, setConfig }: CaseProps) {
  const { population, taxonomy, classes } = derived;
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [instrument, setInstrument] = useState<Instrument>('frontier');

  const exportPopulation = () => {
    // Ground truth included, because the population is generated and belongs to nobody —
    // and because a reader checking the app's arithmetic needs it.
    const csv = toCsv(
      [
        'id',
        'nik',
        'name',
        'kelurahan',
        'birthdate',
        'gender',
        'age',
        'diagnosis',
        'income',
        'generalised_key',
      ],
      population.records.map((r, i) => [
        r.id,
        r.nik,
        r.identity.name,
        String(r.quasi.kelurahan),
        String(r.quasi.birthdate),
        String(r.quasi.gender),
        String(r.quasi.age),
        String(r.sensitive.diagnosis),
        String(r.sensitive.income),
        derived.keys[i],
      ]),
    );
    downloadCsv(`linkage-population-seed-${config.seed}.csv`, csv);
  };

  return (
    <>
      <FieldPanel
        set={classes}
        recordCount={population.records.length}
        height={340}
        selectedClass={selectedClass}
        onSelectClass={setSelectedClass}
        seed={config.seed}
      />

      <div className="columns">
        <div className="stack">
          <section className="panel">
            <div className="panel__title">Generator</div>
            <Slider
              label="Population size"
              value={config.size}
              min={500}
              max={50000}
              step={500}
              onChange={(size) => setConfig({ size })}
              display={config.size.toLocaleString('en')}
            />
            <Slider
              label="Seed"
              value={config.seed}
              min={1}
              max={99999}
              onChange={(seed) => setConfig({ seed })}
            />
            <Slider
              label="Provinsi"
              value={config.provinsiCount}
              min={1}
              max={24}
              onChange={(provinsiCount) => setConfig({ provinsiCount })}
            />
            <Slider
              label="Mean age"
              value={config.meanAge}
              min={10}
              max={70}
              onChange={(meanAge) => setConfig({ meanAge })}
            />
            <Slider
              label="Age spread"
              value={config.ageSpread}
              min={2}
              max={35}
              onChange={(ageSpread) => setConfig({ ageSpread })}
            />
            <Slider
              label="Correlation"
              value={config.correlation}
              min={0}
              max={1}
              step={0.01}
              onChange={(correlation) => setConfig({ correlation })}
              display={config.correlation.toFixed(2)}
            />
            <p className="note" style={{ marginTop: 'var(--s-2)' }}>
              Correlation ties the sensitive value to region and age band. At 0 it is drawn from the
              population distribution; at 1 the stratum determines it, and homogeneous classes
              appear wherever the generalisation happens to align with a stratum.
            </p>
            <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
              <button type="button" className="button button--quiet" onClick={exportPopulation}>
                Export the population as CSV
              </button>
            </div>
          </section>

          <Generalisation
            taxonomy={taxonomy}
            vector={config.vector}
            columns={QUASI}
            onChange={(vector) => setConfig({ vector })}
            targetK={config.targetK}
            onTargetK={(targetK) => setConfig({ targetK })}
          />

          <section className="panel">
            <div className="panel__title">Sharing</div>
            <p className="note">
              The seed, generator parameters, generalisation vector, target k and epsilon are in the
              URL. They describe a population and a configuration, not anyone's data, so the link is
              safe to share by construction. Case progress and attack results are not in it.
            </p>
          </section>
        </div>

        {/* Keyed on the instrument, so switching replays the entrance rather than
            swapping content in place. Discrete control, timed transition. */}
        <div className="stack enter" key={instrument}>
          {instrument === 'frontier' && (
            <Frontier
              records={population.records}
              taxonomy={taxonomy}
              columns={LATTICE_COLUMNS}
              seed={config.seed}
              onSelect={(vector) => setConfig({ vector: { ...config.vector, ...vector } })}
            />
          )}
          {instrument === 'lattice' && (
            <Lattice
              records={population.records}
              taxonomy={taxonomy}
              columns={LATTICE_COLUMNS}
              targetK={config.targetK}
              selected={config.vector}
              onSelect={(vector) => setConfig({ vector: { ...config.vector, ...vector } })}
            />
          )}
          {instrument === 'nik' && <Nik records={population.records} />}
          {instrument === 'uniqueness' && (
            <Uniqueness records={population.records} seed={config.seed} />
          )}
          {instrument === 'differencing' && (
            <Differencing
              records={population.records}
              seed={config.seed}
              epsilon={config.epsilon}
            />
          )}
          {instrument === 'budget' && (
            <BudgetPanel
              records={population.records}
              seed={config.seed}
              epsilon={config.epsilon}
              onEpsilon={(epsilon) => setConfig({ epsilon })}
            />
          )}
          {instrument === 'assessor' && <Assessor />}
        </div>
      </div>

      {selectedClass !== null && (
        <ClassInspector
          set={classes}
          classIndex={selectedClass}
          onClose={() => setSelectedClass(null)}
        />
      )}

      <div className="tabs" role="tablist" aria-label="Instruments">
        {INSTRUMENTS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className="tabs__item"
            aria-selected={instrument === entry.id}
            onClick={() => setInstrument(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </>
  );
}

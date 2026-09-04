/**
 * Case 2. k-anonymity, and homogeneity.
 *
 * Generalise until k is satisfied. Then discover a class where every record shares one
 * diagnosis, and learn it without identifying anyone.
 *
 * PRD §6.3: the defense is introduced with the threat model it assumes and the attack
 * that defeats it, in that order.
 */
import { useMemo, useState } from 'react';
import type { CaseProps } from './shared';
import { FieldPanel } from '../views/Field/FieldPanel';
import { ClassInspector } from '../views/ClassInspector/ClassInspector';
import { Generalisation } from '../views/Generalisation';
import { Cite, Count, Readout, ThreatModel } from '../ui/primitives';
import { generalisePopulation } from '../engine/generalise';
import { buildClasses } from '../engine/classes';
import { runHomogeneity, homogeneousClasses, populationBaseline } from '../engine/attacks/homogeneity';
import { searchLattice, bestMinimal } from '../engine/lattice';

/** Region and age: the columns the sensitive attribute actually varies with. */
const COLUMNS = ['kelurahan', 'age', 'gender'];

export function CaseKAnonymity({ derived, config, setConfig, onComplete }: CaseProps) {
  const { population, taxonomy } = derived;
  const [vector, setVector] = useState<Record<string, number>>({ kelurahan: 0, age: 0, gender: 0 });
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [attacked, setAttacked] = useState(false);

  const keys = useMemo(
    () => generalisePopulation(population.records, taxonomy, vector, COLUMNS),
    [population, taxonomy, vector],
  );
  const set = useMemo(() => buildClasses(population.records, keys), [population, keys]);

  const satisfied = set.k >= config.targetK;

  const homogeneous = useMemo(() => homogeneousClasses(set, Math.max(2, config.targetK)), [set, config.targetK]);
  const targets = useMemo(
    () => homogeneous.flatMap((i) => set.classes[i].members),
    [homogeneous, set],
  );
  const attack = useMemo(
    () => (targets.length > 0 ? runHomogeneity(population.records, set, { targetIds: targets }) : null),
    [population, set, targets],
  );
  const baseline = useMemo(() => populationBaseline(set), [set]);

  const applyMinimal = () => {
    const search = searchLattice(population.records, taxonomy, config.targetK, { columns: COLUMNS });
    const best = bestMinimal(search, taxonomy);
    if (best) setVector({ ...best });
  };

  const run = () => {
    setAttacked(true);
    if (satisfied) onComplete('k-anonymity');
    if (homogeneous.length > 0) setSelectedClass(homogeneous[0]);
  };

  return (
    <>
      <FieldPanel
        set={set}
        recordCount={population.records.length}
        selectedClass={selectedClass}
        onSelectClass={setSelectedClass}
        seed={config.seed}
      />

      <div className="prose">
        <h2>k-anonymity</h2>
        <p>
          Every record indistinguishable from at least k−1 others on the quasi-identifiers. Raise the
          levels below and watch the field: marks travel from their old class into their new one, and
          the count of records standing alone falls. When no mark is left alone, k is at least 2.
        </p>
        <ThreatModel
          assumes={
            <>
              That the attacker knows quasi-identifiers and wants to put a name to a record. k is the
              size of the smallest group they can narrow to, so at k = 5 they are left choosing
              between five people.
            </>
          }
          defeatedBy={
            <>
              An attacker who does not need the name. If all five share one diagnosis, the attacker
              learns the diagnosis about all five and never identifies anyone —{' '}
              <Cite source="ldiversity" />.
            </>
          }
        />
      </div>

      <div className="columns">
        <div className="stack">
          <Generalisation
            taxonomy={taxonomy}
            vector={vector}
            columns={COLUMNS}
            onChange={setVector}
            targetK={config.targetK}
            onTargetK={(k) => setConfig({ targetK: k })}
          />

          <section className="panel">
            <div className="panel__title">Achieved</div>
            <div className="readout">
              <Readout label="k" value={set.k.toLocaleString('en')} exposed={set.k < config.targetK} />
              <Readout label="Target k" value={config.targetK} />
              <Readout
                label="Records standing alone"
                value={set.singletons.toLocaleString('en')}
                exposed={set.singletons > 0}
              />
              <Readout label="Classes" value={set.classes.length.toLocaleString('en')} />
            </div>
            <p className="note" style={{ marginTop: 'var(--s-2)' }}>
              {satisfied
                ? `The release is ${set.k}-anonymous. The smallest class is your actual guarantee, whatever the average looks like.`
                : `Not yet ${config.targetK}-anonymous. ${set.singletons.toLocaleString('en')} records are alone in their class, and a field that is otherwise well grouped with one lone mark is 1-anonymous.`}
            </p>
            <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
              <button type="button" className="button" onClick={applyMinimal}>
                Find the minimal generalisation for k = {config.targetK}
              </button>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel__title">Homogeneity</div>
            <p className="note">
              A class where every member holds the same sensitive value discloses that value about
              every member, without identifying any of them. k-anonymity does not see this coming,
              because nothing was identified.
            </p>
            <div className="readout" style={{ marginTop: 'var(--s-2)' }}>
              <Readout
                label="Homogeneous classes at this generalisation"
                value={homogeneous.length.toLocaleString('en')}
                exposed={homogeneous.length > 0}
              />
              <Readout label="Records in them" value={targets.length.toLocaleString('en')} />
            </div>
            <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
              <button
                type="button"
                className="button"
                onClick={run}
                disabled={!satisfied || homogeneous.length === 0}
              >
                Run the homogeneity attack
              </button>
            </div>
            {!satisfied && (
              <p className="note" style={{ marginTop: 'var(--s-2)' }}>
                Satisfy k = {config.targetK} first. The point of the attack is that it works on a
                release that is already k-anonymous.
              </p>
            )}

            {attacked && attack && (
              <div style={{ marginTop: 'var(--s-3)' }}>
                <p>
                  <Count of={attack.correct} total={attack.attempted} label="diagnoses recovered" />
                </p>
                <p className="note">
                  Nobody was identified. Every one of those records sits in a class of at least{' '}
                  {set.k}. An attacker guessing the commonest value in the population would have been
                  right {attack.baselineCorrect.toLocaleString('en')} of {attack.attempted.toLocaleString('en')}{' '}
                  times, or {(baseline.rate * 100).toFixed(1)}% — the gap between that number and the
                  one above is what the release disclosed.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {selectedClass !== null && (
        <ClassInspector set={set} classIndex={selectedClass} onClose={() => setSelectedClass(null)} />
      )}
    </>
  );
}

/**
 * Case 1. The linkage.
 *
 * You are given a target and two tables. Neither identifies anyone alone. You join them.
 * It works.
 *
 * PRD §8.4 and DESIGN §6.4: this must land within 60 seconds of first load. The attack
 * runs on mount with the default population, so the ignition is on screen immediately
 * and the reading afterwards is what takes the minute.
 */
import { useCallback, useMemo, useState } from 'react';
import type { CaseProps } from './shared';
import { Linkage } from '../views/Linkage/Linkage';
import { FieldPanel } from '../views/Field/FieldPanel';
import { ClassInspector } from '../views/ClassInspector/ClassInspector';
import { Cite, Count, Eyebrow, Readout } from '../ui/primitives';
import { generalisePopulation } from '../engine/generalise';
import { buildClasses } from '../engine/classes';
import { runLinkage } from '../engine/attacks/linkage';

/** The quasi-identifier triple Sweeney names: region, date of birth, gender. */
const TRIPLE = ['kelurahan', 'birthdate', 'gender'];

export function CaseLinkage({ derived, onComplete, config }: CaseProps) {
  const { population, taxonomy } = derived;
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);

  // The triple, raw. This is the release before any defense is applied.
  const keys = useMemo(
    () =>
      generalisePopulation(
        population.records,
        taxonomy,
        { kelurahan: 0, birthdate: 0, gender: 0 },
        TRIPLE,
      ),
    [population, taxonomy],
  );
  const set = useMemo(() => buildClasses(population.records, keys), [population, keys]);

  const targets = useMemo(
    () => population.records.slice(0, Math.min(500, population.records.length)).map((r) => r.id),
    [population],
  );

  const result = useMemo(
    () => runLinkage(population.records, keys, keys, { columns: TRIPLE, targetIds: targets }),
    [population, keys, targets],
  );

  const handleScored = useCallback(() => {
    setJoined(true);
    onComplete('linkage');
  }, [onComplete]);

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
        <Eyebrow>Case 1 · two tables, one join</Eyebrow>
        <h2>The linkage</h2>
        <p>
          A health authority publishes a table with the names removed. It keeps region, date of
          birth, gender and a diagnosis, because a table without those answers no questions. An
          electoral roll, sold for twenty dollars, carries names alongside region, date of birth and
          gender.
        </p>
        <p>
          Neither table identifies anyone. Joining them on the three attributes they share does.
          This is the founding result in the field: <Cite source="sweeney" /> did exactly this to
          Massachusetts hospital discharge data.
        </p>
        <p className="note">
          The join below is run against the generated population, and the count is measured, not
          claimed. The records it fails on are counted too, and can be inspected.
        </p>
      </div>

      <div className="readout" style={{ padding: '0 var(--s-3) var(--s-3)' }}>
        <Readout
          label="Uniquely identified"
          value={<Count of={result.correct} total={result.attempted} label="" />}
          exposed={result.correct > 0}
        />
        <Readout label="Not determined" value={result.failed.toLocaleString('en')} />
        <Readout
          label="Records standing alone in the population"
          value={set.singletons.toLocaleString('en')}
          exposed={set.singletons > 0}
        />
      </div>

      <Linkage
        records={population.records}
        releasedKeys={keys}
        auxiliaryKeys={keys}
        columns={TRIPLE}
        targetIds={targets}
        onScored={handleScored}
      />

      {selectedClass !== null && (
        <ClassInspector
          set={set}
          classIndex={selectedClass}
          onClose={() => setSelectedClass(null)}
        />
      )}

      {joined && (
        <div className="prose">
          <p>
            Nothing above was clever. The join is one operation over three ordinary attributes, none
            of which looks sensitive alone. The identifier was never the name.
          </p>
          <p className="note">
            Case 2 applies the standard defense — generalisation, until every record is
            indistinguishable from at least k−1 others — and then shows what that defense does not
            cover.
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Case 3. l-diversity, and skewness.
 *
 * Enforce diversity. Then find the class where diversity is technically satisfied and
 * the distribution still gives near-certainty.
 */
import { useMemo, useState } from 'react';
import type { CaseProps } from './shared';
import { FieldPanel } from '../views/Field/FieldPanel';
import { ClassInspector } from '../views/ClassInspector/ClassInspector';
import { Generalisation } from '../views/Generalisation';
import { Cite, Count, Readout, ThreatModel } from '../ui/primitives';
import { generalisePopulation } from '../engine/generalise';
import { buildClasses, entropyL } from '../engine/classes';
import { runSkewness, diverseButSkewed, mostSkewedClasses } from '../engine/attacks/skewness';
import { runBackground, factsRequired } from '../engine/attacks/background';

const COLUMNS = ['kelurahan', 'age', 'gender'];

export function CaseLDiversity({ derived, config, setConfig, onComplete }: CaseProps) {
  const { population, taxonomy } = derived;
  const [vector, setVector] = useState<Record<string, number>>({ kelurahan: 1, age: 2, gender: 1 });
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [targetL, setTargetL] = useState(2);
  const [attacked, setAttacked] = useState(false);

  const keys = useMemo(
    () => generalisePopulation(population.records, taxonomy, vector, COLUMNS),
    [population, taxonomy, vector],
  );
  const set = useMemo(() => buildClasses(population.records, keys), [population, keys]);

  /**
   * l-diversity is enforced by suppressing the classes that fail it — the standard
   * remedy, and the honest one to show, because it has a cost the interface can state:
   * those records leave the release entirely.
   */
  const failing = useMemo(() => set.classes.filter((c) => c.l < targetL), [set, targetL]);
  const suppressedRecords = useMemo(
    () => failing.reduce((n, c) => n + c.members.length, 0),
    [failing],
  );

  const skewed = useMemo(() => diverseButSkewed(set, targetL, 0.75, 5), [set, targetL]);
  const ranked = useMemo(() => mostSkewedClasses(set, 5, 12), [set]);

  const targets = useMemo(() => skewed.flatMap((i) => set.classes[i].members), [skewed, set]);
  const attack = useMemo(
    () =>
      targets.length > 0
        ? runSkewness(population.records, set, { targetIds: targets, confidenceThreshold: 0.75 })
        : null,
    [population, set, targets],
  );

  const background = useMemo(
    () =>
      targets.length > 0
        ? runBackground(population.records, set, { targetIds: targets, factCount: Math.max(0, targetL - 1) })
        : null,
    [population, set, targets, targetL],
  );
  const facts = useMemo(
    () => (targets.length > 0 ? factsRequired(population.records, set, targets) : new Map<number, number>()),
    [population, set, targets],
  );

  const run = () => {
    setAttacked(true);
    onComplete('l-diversity');
    if (skewed.length > 0) setSelectedClass(skewed[0]);
    else if (ranked.length > 0) setSelectedClass(ranked[0]);
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
        <h2>l-diversity</h2>
        <p>
          At least l well-represented sensitive values in every equivalence class, so that knowing
          which class someone is in does not tell you their value. Classes that fail are suppressed
          from the release.
        </p>
        <ThreatModel
          assumes={
            <>
              That l distinct values in a class means the attacker cannot choose between them, and
              that eliminating one value takes one item of background knowledge —{' '}
              <Cite source="ldiversity" />.
            </>
          }
          defeatedBy={
            <>
              Proportions. A class holding one value 98 times and two others once each is 3-diverse,
              and an attacker naming the common value is right 98 times in 100. Distinct l counts
              values and not their weights — <Cite source="tcloseness" />.
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
            <div className="panel__title">Diversity</div>
            <div className="control">
              <label className="control__label" htmlFor="target-l">
                Target l
              </label>
              <input
                id="target-l"
                type="range"
                min={1}
                max={5}
                value={targetL}
                onChange={(e) => setTargetL(Number(e.target.value))}
              />
              <span className="control__value">{targetL}</span>
            </div>
            <div className="readout" style={{ marginTop: 'var(--s-2)' }}>
              <Readout label="Achieved l, minimum" value={set.l} exposed={set.l < targetL} />
              <Readout label="Achieved k" value={set.k} />
              <Readout label="Maximum t" value={set.t.toFixed(3)} />
              <Readout
                label="Records suppressed to reach l"
                value={suppressedRecords.toLocaleString('en')}
              />
            </div>
            <p className="note" style={{ marginTop: 'var(--s-2)' }}>
              {failing.length.toLocaleString('en')} of {set.classes.length.toLocaleString('en')}{' '}
              classes fail l = {targetL} and would leave the release, taking{' '}
              {suppressedRecords.toLocaleString('en')} records with them. Suppression is a cost, not
              a free remedy.
            </p>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel__title">Skewness</div>
            <p className="note">
              Classes below satisfy l = {targetL} and still concede near-certainty. The class
              inspector draws the population distribution behind the class as a hairline; where the
              two shapes do not overlap, the class discloses something the population does not.
            </p>
            <div className="readout" style={{ marginTop: 'var(--s-2)' }}>
              <Readout
                label={`Classes at l ≥ ${targetL} with a value above 75%`}
                value={skewed.length.toLocaleString('en')}
                exposed={skewed.length > 0}
              />
              <Readout label="Records in them" value={targets.length.toLocaleString('en')} />
            </div>
            <div className="buttons" style={{ marginTop: 'var(--s-2)' }}>
              <button type="button" className="button" onClick={run} disabled={targets.length === 0}>
                Run the skewness attack
              </button>
            </div>

            {attacked && attack && (
              <div style={{ marginTop: 'var(--s-3)' }}>
                <p>
                  <Count
                    of={attack.correct}
                    total={attack.correct + attack.incorrect}
                    label="claims correct"
                  />
                </p>
                <p className="note">
                  Mean confidence at the moment of claiming: {(attack.meanConfidence * 100).toFixed(1)}%.
                  From the population distribution alone the same guess would be right{' '}
                  {(attack.baselineConfidence * 100).toFixed(1)}% of the time. {attack.incorrect.toLocaleString('en')}{' '}
                  claims were wrong, and they are counted here rather than dropped.
                </p>
                {background && (
                  <p className="note">
                    With {Math.max(0, targetL - 1)} eliminating facts — the number l = {targetL}{' '}
                    claims are needed —{' '}
                    <Count
                      of={background.correct}
                      total={background.attempted}
                      label="values are determined outright"
                    />
                    . {(facts.get(0) ?? 0) + (facts.get(1) ?? 0)} of {targets.length} needed one fact
                    or none.
                  </p>
                )}
              </div>
            )}
          </section>

          {ranked.length > 0 && (
            <section className="panel">
              <div className="panel__title">Classes furthest from the population distribution</div>
              <div className="table__scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th className="num">Size</th>
                      <th className="num">l</th>
                      <th className="num">entropy l</th>
                      <th className="num">t</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((i) => {
                      const c = set.classes[i];
                      return (
                        <tr key={c.key}>
                          <td>{c.key}</td>
                          <td className="num">{c.members.length}</td>
                          <td className="num">{c.l}</td>
                          <td className="num">{entropyL(c.sensitiveDistribution).toFixed(2)}</td>
                          <td className="num">{c.t.toFixed(3)}</td>
                          <td>
                            <button
                              type="button"
                              className="button button--quiet"
                              onClick={() => setSelectedClass(i)}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="note" style={{ marginTop: 'var(--s-2)' }}>
                t is the earth mover's distance from the population distribution. t-closeness bounds
                it; the cost is that bounding it usually forces further generalisation, and the
                frontier in the sandbox shows what that costs in accuracy.
              </p>
            </section>
          )}
        </div>
      </div>

      {selectedClass !== null && (
        <ClassInspector set={set} classIndex={selectedClass} onClose={() => setSelectedClass(null)} />
      )}
    </>
  );
}

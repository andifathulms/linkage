/**
 * Case 5. Differential privacy, and the budget.
 *
 * A guarantee that holds regardless of auxiliary knowledge — and its price, in noise and
 * in a budget that composes and cannot be refilled.
 *
 * PRD §6.3: differential privacy is presented with its guarantee stated precisely,
 * including what it does not promise.
 */
import { useCallback, useState } from 'react';
import type { CaseProps } from './shared';
import { BudgetPanel } from '../views/Budget/Budget';
import { Cite, ThreatModel } from '../ui/primitives';

export function CaseBudget({ derived, config, setConfig, onComplete }: CaseProps) {
  const { population } = derived;
  const [spent, setSpent] = useState(false);

  const handleExhausted = useCallback(() => {
    setSpent(true);
    onComplete('budget');
  }, [onComplete]);

  return (
    <>
      <div className="prose">
        <h2>Differential privacy</h2>
        <p>
          A mechanism is ε-differentially private if, for any two datasets differing in one person,
          the probability of any output changes by at most a factor of e^ε. The guarantee is about
          the mechanism, not about the data, and it therefore holds regardless of what the attacker
          already knows — <Cite source="dwork" />.
        </p>
        <ThreatModel
          assumes={
            <>
              Nothing about the attacker. That is the whole point: no assumption about auxiliary
              knowledge, so no auxiliary knowledge can invalidate it.
            </>
          }
          defeatedBy={
            <>
              Nothing, within its terms — but read the terms. It promises that your presence in the
              dataset barely changes the output. It does not promise that the output tells nobody
              anything about you: a study establishing that a habit causes a disease discloses
              something about every person with that habit, whether or not they took part.
            </>
          }
        />
        <p className="note">
          What it also does not promise: privacy across releases you did not account for, protection
          when ε is large, or anything at all once the budget is spent. Every query below is charged
          against a fixed budget. The meter only empties.
        </p>
      </div>

      <div className="columns">
        <BudgetPanel
          records={population.records}
          seed={config.seed}
          epsilon={config.epsilon}
          onEpsilon={(value) => setConfig({ epsilon: value })}
          allotted={1}
          onExhausted={handleExhausted}
        />

        <section className="panel">
          <div className="panel__title">What the budget is</div>
          <p className="note">
            Epsilon is not a setting with a right value. It is the total disclosure you are willing
            to permit, spread across every question anyone will ever ask of this data. Sequential
            composition means the costs add: ten questions at 0.1 is the same disclosure as one
            question at 1.
          </p>
          <p className="note">
            Lower epsilon means more noise, and the noise is the accuracy your data users lose. The
            frontier in the sandbox draws that trade-off as a curve you can move along, with both
            costs reading out, because the point at which you would stop is a decision nobody can
            make for you.
          </p>
          {spent && (
            <p className="note">
              The budget is spent. There is no refill, and that is not a limitation of this
              application — it is the property being taught. A real release that exhausts its budget
              stops answering questions, or stops being private.
            </p>
          )}
          <p className="note">
            The sandbox is now unlocked, with every control exposed: the generalisation lattice, the
            NIK dissector, the privacy–utility frontier, the uniqueness study, and the schema
            assessor.
          </p>
        </section>
      </div>
    </>
  );
}

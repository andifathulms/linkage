/**
 * Case 4. The aggregates.
 *
 * No record-level data at all. Two published averages. One subtraction. One person's
 * figure recovered.
 */
import { useCallback } from 'react';
import type { CaseProps } from './shared';
import { Differencing } from '../views/Differencing/Differencing';
import { ThreatModel, Cite } from '../ui/primitives';

export function CaseAggregates({ derived, config, onComplete }: CaseProps) {
  const { population } = derived;
  const handleIsolated = useCallback(() => onComplete('aggregates'), [onComplete]);

  return (
    <>
      <div className="prose">
        <h2>The aggregates</h2>
        <p>
          Suppose the release contains no records at all. A statistics portal publishes counts and
          averages over groups, and nothing else. Every defense so far — generalisation,
          k-anonymity, l-diversity, t-closeness — is a property of a released table, and there is no
          released table.
        </p>
        <p>
          Two ordinary breakdowns are enough. Ask for a figure over a group, then the same figure
          over the group with one date of birth excluded. Both are published routinely. Their
          difference is one person.
        </p>
        <ThreatModel
          assumes={
            <>
              That aggregation is protection: that a statistic over many people cannot say anything
              about one of them.
            </>
          }
          defeatedBy={
            <>
              Subtraction. And the same argument extends: enough individually harmless queries
              intersect down to one record. This is the problem differential privacy was defined to
              solve — <Cite source="dwork" />.
            </>
          }
        />
      </div>

      <div className="columns">
        <Differencing
          records={population.records}
          seed={config.seed}
          epsilon={config.epsilon}
          onIsolated={handleIsolated}
        />
        <section className="panel">
          <div className="panel__title">Why this one is different</div>
          <p className="note">
            The first three cases were defeated by an attacker who knew more than the defense
            assumed. Generalisation assumed the attacker had quasi-identifiers; l-diversity assumed
            eliminating a value took an item of knowledge; t-closeness assumed the population
            distribution was safe to reveal.
          </p>
          <p className="note">
            Every one of those is a claim about what the attacker knows, and every one of them can be
            wrong. Case 5 introduces the only guarantee in this application that does not make such a
            claim — and the price it charges for that.
          </p>
        </section>
      </div>
    </>
  );
}

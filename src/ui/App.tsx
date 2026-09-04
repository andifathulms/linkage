/**
 * The shell. DESIGN.md §4.1.
 *
 * The field is always the largest element and always at the top. Everything else is a
 * control on it or a reading of it.
 *
 * The case row is a rail rather than a tab bar: five defenses each defeated by the next
 * attack is a sequence with a dependency order (DESIGN §9), and the numbered discs on a
 * connecting line say so before the labels are read. A completed case keeps its disc in
 * the safe role; a locked one is ghosted and disabled.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig, useDerived, QUASI } from '../state/store';
import { CASES, loadProgress, saveProgress, isUnlocked, type CaseId } from '../cases/definitions';
import { SyntheticMarker, GroundToggle } from './primitives';
import { CaseLinkage } from '../cases/CaseLinkage';
import { CaseKAnonymity } from '../cases/CaseKAnonymity';
import { CaseLDiversity } from '../cases/CaseLDiversity';
import { CaseAggregates } from '../cases/CaseAggregates';
import { CaseBudget } from '../cases/CaseBudget';
import { Sandbox } from '../cases/Sandbox';

export function App() {
  const [config, setConfig] = useConfig();
  const derived = useDerived(config);
  const [current, setCurrent] = useState<CaseId>('linkage');
  const [completed, setCompleted] = useState<CaseId[]>(() => loadProgress());

  useEffect(() => {
    saveProgress(completed);
  }, [completed]);

  const complete = useCallback((id: CaseId) => {
    setCompleted((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const definition = useMemo(() => CASES.find((c) => c.id === current)!, [current]);

  const shared = {
    config,
    setConfig,
    derived,
    onComplete: complete,
    completed,
  };

  return (
    <div className="app">
      <header className="header">
        <span className="header__mark" aria-hidden="true" />
        <span className="header__name">Linkage</span>
        <span className="header__descriptor">Removing names does not anonymize anything</span>
        <span className="header__spacer" />
        <span className="header__case">
          Case {definition.index} · {definition.title}
        </span>
        <GroundToggle />
        {/* PRD §6.1: in the header of every case, not once at load. */}
        <SyntheticMarker />
      </header>

      <nav className="cases" aria-label="Cases">
        {CASES.map((c) => {
          const unlocked = isUnlocked(c.id, completed);
          const done = completed.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className="cases__item"
              aria-current={c.id === current}
              data-done={done}
              disabled={!unlocked}
              title={unlocked ? c.summary : 'Complete the previous case to unlock this one'}
              onClick={() => unlocked && setCurrent(c.id)}
            >
              <span className="cases__index" aria-hidden="true">
                {c.index === 6 ? '·' : done && c.id !== current ? '✓' : c.index}
              </span>
              <span className="cases__label">{c.title}</span>
            </button>
          );
        })}
      </nav>

      {/* The case body is keyed, so switching cases replays the staggered entrance
          rather than swapping content in place. Discrete control, timed transition
          (DESIGN §6.2). */}
      <main className="main" key={current}>
        {current === 'linkage' && <CaseLinkage {...shared} />}
        {current === 'k-anonymity' && <CaseKAnonymity {...shared} />}
        {current === 'l-diversity' && <CaseLDiversity {...shared} />}
        {current === 'aggregates' && <CaseAggregates {...shared} />}
        {current === 'budget' && <CaseBudget {...shared} />}
        {current === 'sandbox' && <Sandbox {...shared} />}
      </main>

      <footer className="footer">
        <span className="note">
          Population of {config.size.toLocaleString('en')} generated from seed {config.seed}.
          Nothing leaves this device: no network requests, no analytics, no storage of anything you
          do beyond your case progress.
        </span>
      </footer>
      <span className="visually-hidden" aria-live="polite">
        {QUASI.length} quasi-identifier columns. Smallest equivalence class {derived.classes.k}.
      </span>
    </div>
  );
}

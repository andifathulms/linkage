/**
 * Smoke test: every case and every instrument renders.
 *
 * Server rendering exercises the whole component tree without a DOM, which is enough to
 * catch the crash-on-first-render class of bug — a bad index, a missing guard, a hook
 * called on an empty population — across screens a human would otherwise have to click
 * through one at a time.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CaseLinkage } from '../src/cases/CaseLinkage';
import { CaseKAnonymity } from '../src/cases/CaseKAnonymity';
import { CaseLDiversity } from '../src/cases/CaseLDiversity';
import { CaseAggregates } from '../src/cases/CaseAggregates';
import { CaseBudget } from '../src/cases/CaseBudget';
import { Sandbox } from '../src/cases/Sandbox';
import { Assessor } from '../src/views/Assessor/Assessor';
import { Nik } from '../src/views/Nik/Nik';
import { Uniqueness } from '../src/views/Uniqueness/Uniqueness';
import { Lattice } from '../src/views/Lattice/Lattice';
import { Frontier } from '../src/views/Frontier/Frontier';
import { App } from '../src/ui/App';
import { ClassInspector } from '../src/views/ClassInspector/ClassInspector';
import { Composition } from '../src/views/Composition/Composition';
import { Roll } from '../src/views/Roll/Roll';
import { Release } from '../src/views/Release/Release';
import { Suppression } from '../src/views/Suppression/Suppression';
import { Attribution } from '../src/views/Attribution/Attribution';
import { generatePopulation, DEFAULT_PARAMS } from '../src/engine/generate/population';
import { buildTaxonomyFor, DEFAULT_CONFIG, QUASI } from '../src/state/store';
import { generalisePopulation } from '../src/engine/generalise';
import { buildClasses } from '../src/engine/classes';
import { SYNTHETIC_STATEMENT } from '../src/ui/primitives';

const population = generatePopulation({ ...DEFAULT_PARAMS, size: 1500, seed: 5 });
const taxonomy = buildTaxonomyFor(population);
const keys = generalisePopulation(population.records, taxonomy, DEFAULT_CONFIG.vector, QUASI);
const classes = buildClasses(population.records, keys);

const props = {
  config: { ...DEFAULT_CONFIG, size: 1500, seed: 5 },
  setConfig: () => {},
  derived: { population, taxonomy, keys, classes },
  onComplete: () => {},
  completed: [],
};

describe('every case renders', () => {
  const cases = [
    ['case 1, the linkage', <CaseLinkage key="1" {...props} />],
    ['case 2, k-anonymity', <CaseKAnonymity key="2" {...props} />],
    ['case 3, l-diversity', <CaseLDiversity key="3" {...props} />],
    ['case 4, the aggregates', <CaseAggregates key="4" {...props} />],
    ['case 5, the budget', <CaseBudget key="5" {...props} />],
    ['the sandbox', <Sandbox key="6" {...props} />],
  ] as const;

  for (const [label, element] of cases) {
    it(`renders ${label}`, () => {
      const html = renderToString(element);
      expect(html.length).toBeGreaterThan(100);
    });
  }
});

describe('every instrument renders', () => {
  const instruments = [
    ['the assessor', <Assessor key="a" />],
    ['the NIK dissector', <Nik key="n" records={population.records} />],
    ['the uniqueness study', <Uniqueness key="u" records={population.records} seed={5} />],
    [
      'the lattice',
      <Lattice
        key="l"
        records={population.records}
        taxonomy={taxonomy}
        columns={['kelurahan', 'age', 'gender']}
        targetK={5}
        selected={DEFAULT_CONFIG.vector}
        onSelect={() => {}}
      />,
    ],
    [
      'the frontier',
      <Frontier
        key="f"
        records={population.records}
        taxonomy={taxonomy}
        columns={['kelurahan', 'age', 'gender']}
        seed={5}
        onSelect={() => {}}
      />,
    ],
    [
      'two releases',
      <Composition
        key="c"
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        vectorB={DEFAULT_CONFIG.vectorB}
        onVectorB={() => {}}
        seed={5}
      />,
    ],
    [
      'the attacker roll',
      <Roll
        key="r"
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        seed={5}
        coverage={DEFAULT_CONFIG.rollCoverage}
        errorRate={DEFAULT_CONFIG.rollError}
        onCoverage={() => {}}
        onErrorRate={() => {}}
      />,
    ],
    [
      'the release against the population',
      <Release
        key="rel"
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        seed={5}
        fraction={DEFAULT_CONFIG.releaseFraction}
        onFraction={() => {}}
      />,
    ],
    [
      'who pays for k',
      <Suppression
        key="s"
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        targetK={5}
        seed={5}
      />,
    ],
    [
      'the estimate against the population',
      <Attribution
        key="at"
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        seed={5}
      />,
    ],
  ] as const;

  for (const [label, element] of instruments) {
    it(`renders ${label}`, () => {
      expect(renderToString(element).length).toBeGreaterThan(100);
    });
  }
});

/** Visible text only. React's SSR markers and attribute values are not copy. */
function textOf(html: string): string {
  return html
    .replace(/<!--.*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

describe('the inspector shows how a record joined its class', () => {
  it('traces one member from raw values to the key', () => {
    const html = renderToString(
      <ClassInspector
        set={classes}
        classIndex={0}
        onClose={() => {}}
        records={population.records}
        taxonomy={taxonomy}
        vector={DEFAULT_CONFIG.vector}
        columns={QUASI}
      />,
    );
    const text = textOf(html);
    expect(text).toContain('came to be in this class');
    expect(text).toContain('As recorded');
    expect(text).toContain('Generalised to');
    // The raw value of the first member has to actually appear, or the trace is a
    // template rather than a derivation.
    const first = population.records.find((r) => r.id === classes.classes[0].members[0])!;
    expect(text).toContain(String(first.quasi.kelurahan));
  });
});

describe('the lattice is one tab stop, not a hundred', () => {
  it('makes exactly one node tabbable', () => {
    // Every node used to carry tabIndex 0, which put the whole product of the taxonomy
    // between the lattice and the next control. WCAG 2.4.3.
    const html = renderToString(
      <Lattice
        records={population.records}
        taxonomy={taxonomy}
        columns={['kelurahan', 'age', 'gender']}
        targetK={5}
        selected={DEFAULT_CONFIG.vector}
        onSelect={() => {}}
      />,
    );
    const tabbable = html.match(/tabindex="0"/g) ?? [];
    const skipped = html.match(/tabindex="-1"/g) ?? [];
    expect(tabbable).toHaveLength(1);
    expect(skipped.length).toBeGreaterThan(10);
  });
});

describe('the mark', () => {
  it('draws the three records the brand mark is, in the interface tokens', () => {
    const html = renderToString(<App />);
    // The name column struck on every row, the crowd, and one row that is not in it.
    expect(html).toContain('class="header__mark"');
    expect((html.match(/var\(--ink\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((html.match(/var\(--ink-faint\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((html.match(/var\(--exposed\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('is hidden from assistive technology, because the wordmark names it', () => {
    const html = renderToString(<App />);
    expect(html).toMatch(/class="header__mark"[^>]*aria-hidden="true"/);
  });
});

describe('the copy holds to its register', () => {
  const rendered = textOf([
    renderToString(<CaseLinkage {...props} />),
    renderToString(<CaseKAnonymity {...props} />),
    renderToString(<CaseLDiversity {...props} />),
    renderToString(<CaseAggregates {...props} />),
    renderToString(<CaseBudget {...props} />),
    renderToString(<Sandbox {...props} />),
    renderToString(<Nik records={population.records} />),
    renderToString(<Assessor />),
    // The five instruments added for the qualifying readings. They carry the most
    // argumentative copy in the app, so they belong under the register check rather
    // than outside it.
    renderToString(
      <Composition
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        vectorB={DEFAULT_CONFIG.vectorB}
        onVectorB={() => {}}
        seed={5}
      />,
    ),
    renderToString(
      <Roll
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        seed={5}
        coverage={DEFAULT_CONFIG.rollCoverage}
        errorRate={DEFAULT_CONFIG.rollError}
        onCoverage={() => {}}
        onErrorRate={() => {}}
      />,
    ),
    renderToString(
      <Release
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        seed={5}
        fraction={DEFAULT_CONFIG.releaseFraction}
        onFraction={() => {}}
      />,
    ),
    renderToString(
      <Suppression
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        targetK={5}
        seed={5}
      />,
    ),
    renderToString(
      <Attribution
        records={population.records}
        taxonomy={taxonomy}
        columns={QUASI}
        vector={DEFAULT_CONFIG.vector}
        seed={5}
      />,
    ),
  ].join('\n'));

  it('uses no lurid vocabulary', () => {
    // DESIGN §7: clinical, never lurid. The findings are disturbing enough without help.
    for (const word of ['victim', 'steal', 'stolen', 'breach', 'hacker', 'dangerous', 'terrifying']) {
      expect(rendered.toLowerCase()).not.toContain(word);
    }
  });

  it('uses no exclamation marks', () => {
    expect(rendered).not.toContain('!');
  });

  it('does not congratulate a successful re-identification', () => {
    for (const word of ['congratulations', 'well done', 'success!', 'nice work']) {
      expect(rendered.toLowerCase()).not.toContain(word);
    }
  });

  it('carries denominators with its counts', () => {
    // "340 of 500", never "68% success".
    expect(rendered).toContain(' of ');
    expect(rendered.toLowerCase()).not.toContain('% success');
  });

  it('states the synthetic-data statement in the header', () => {
    expect(SYNTHETIC_STATEMENT).toBe(
      "All records are generated. No real person's data is used or accepted.",
    );
  });
});

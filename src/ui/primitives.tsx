/**
 * Small shared pieces. DESIGN.md §7 (copy), §4.1 (the synthetic-data statement),
 * CLAUDE.md §10 (citation popovers).
 */
import { useId, useState, type ReactNode } from 'react';

/**
 * The synthetic-data statement. PRD §6.1: at the top of every case, not once at load,
 * and a plain marker that opens a short explanation rather than a dismissible banner.
 */
export const SYNTHETIC_STATEMENT =
  "All records are generated. No real person's data is used or accepted.";

export function SyntheticMarker() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="synthetic">
      <button
        type="button"
        className="synthetic__marker"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {SYNTHETIC_STATEMENT}
      </button>
      {open && (
        <div className="synthetic__body" id={id}>
          <p>
            Every population in this application is generated in your browser from a seed. The
            names, dates and identity numbers are constructed from fragment tables and belong to
            nobody.
          </p>
          <p>
            There is no file input, no drag-and-drop and no paste. The application has no code path
            that accepts a record from outside, and a test greps the built bundle to keep it that
            way.
          </p>
          <p>
            Generated data is also what makes the measurements possible: the application knows who
            every record actually is, so an attack can be scored rather than asserted.
          </p>
        </div>
      )}
    </div>
  );
}

export interface Source {
  key: string;
  short: string;
  full: string;
}

export const SOURCES: Record<string, Source> = {
  sweeney: {
    key: 'sweeney',
    short: 'Sweeney 2000',
    full:
      'Sweeney, L. (2000). Simple demographics often identify people uniquely. Carnegie Mellon University, Data Privacy Working Paper 3. Reports that 87% of the 1990 US population had a combination of five-digit ZIP, gender and full date of birth likely to be unique.',
  },
  golle: {
    key: 'golle',
    short: 'Golle 2006',
    full:
      'Golle, P. (2006). Revisiting the uniqueness of simple demographics in the US population. WPES. Reports 63% on 2000 census data, and 61% on Sweeney’s own 1990 data, stating that the discrepancy could not be accounted for without detail on her collection and analysis methods.',
  },
  ldiversity: {
    key: 'ldiversity',
    short: 'Machanavajjhala et al. 2007',
    full:
      'Machanavajjhala, A., Kifer, D., Gehrke, J., Venkitasubramaniam, M. (2007). l-diversity: privacy beyond k-anonymity. ACM TKDD. Introduces l-diversity and the homogeneity and background-knowledge attacks on k-anonymity.',
  },
  tcloseness: {
    key: 'tcloseness',
    short: 'Li et al. 2007',
    full:
      't-closeness: privacy beyond k-anonymity and l-diversity. ICDE. Introduces the skewness and similarity attacks on l-diversity, and defines t-closeness by earth mover’s distance.',
  },
  dwork: {
    key: 'dwork',
    short: 'Dwork 2006',
    full:
      'Dwork, C. (2006). Differential privacy. ICALP. Later, Dwork and Roth (2014), The algorithmic foundations of differential privacy, for the Laplace and Gaussian mechanisms and the composition theorems used here.',
  },
};

/** Inline citation, opened as a popover. */
export function Cite({ source }: { source: keyof typeof SOURCES }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const s = SOURCES[source];
  return (
    <span className="citation">
      <button
        type="button"
        className="cite"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {s.short}
      </button>
      {open && (
        <span className="cite__popover" id={id} role="note">
          {s.full}
        </span>
      )}
    </span>
  );
}

/**
 * A defense is introduced with the threat model it assumes and the attack that defeats
 * it, in that order (PRD §6.3). Enforced by the component taking them in that order and
 * rendering them in it.
 */
export function ThreatModel({
  assumes,
  defeatedBy,
}: {
  assumes: ReactNode;
  defeatedBy: ReactNode;
}) {
  return (
    <dl className="assumption">
      <dt>What it assumes</dt>
      <dd>{assumes}</dd>
      <dt>What defeats it</dt>
      <dd>{defeatedBy}</dd>
    </dl>
  );
}

/** Numbers carry their denominators (DESIGN §7). This is the only way they are shown. */
export function Count({ of, total, label }: { of: number; total: number; label: string }) {
  return (
    <span>
      <span className="figure">{of.toLocaleString('en')}</span>
      <span className="readout__label"> of {total.toLocaleString('en')} </span>
      {label}
    </span>
  );
}

export function Readout({
  label,
  value,
  exposed = false,
}: {
  label: string;
  value: ReactNode;
  exposed?: boolean;
}) {
  return (
    <div className="readout__item">
      <span className="readout__label">{label}</span>
      <span className={`readout__value${exposed ? ' readout__value--exposed' : ''}`}>{value}</span>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  display?: string;
}) {
  const id = useId();
  return (
    <div className="control">
      <label className="control__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="control__value">{display ?? value}</span>
    </div>
  );
}

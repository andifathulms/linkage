/**
 * Population generation with retained ground truth (PRD §4.1).
 *
 * Identities are visibly synthetic (CLAUDE.md §2): names are assembled from a fragment
 * table, never sampled from a real roll or a real name-frequency list for a specific
 * place. The interface states that they are generated.
 *
 * Ground truth is retained so attacks can be scored. Every record knows who it is; the
 * attack modules are the only thing standing between a generalised table and that fact,
 * which is exactly the situation the app is about.
 */
import type {
  ColumnSpec,
  GeneratorParams,
  Identity,
  PersonRecord,
  Population,
} from '../types';
import { deriveRng, type Rng } from '../rng';
import { buildHierarchy } from './hierarchy';
import { buildNik } from './nik';

const NAME_HEAD = [
  'Adi', 'Bayu', 'Candra', 'Dian', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Indra', 'Joko',
  'Kartika', 'Lestari', 'Maya', 'Nur', 'Oka', 'Putri', 'Rahmat', 'Sari', 'Tari', 'Utami',
  'Wahyu', 'Yanti', 'Zainal', 'Arif', 'Budi', 'Citra', 'Dewi', 'Endah',
];

const NAME_TAIL = [
  'Pratama', 'Wijaya', 'Santoso', 'Halim', 'Nugroho', 'Setiawan', 'Kusuma', 'Permana',
  'Saputra', 'Anggraini', 'Rahayu', 'Maulana', 'Hartono', 'Firmansyah', 'Widodo',
  'Suryani', 'Ramadhan', 'Oktaviani',
];

export const DEFAULT_SENSITIVE_VALUES = [
  'Cardiac',
  'Respiratory',
  'Metabolic',
  'Musculoskeletal',
  'Neurological',
] as const;

export const DEFAULT_SENSITIVE_WEIGHTS = [22, 26, 24, 16, 12] as const;

export const DEFAULT_PARAMS: GeneratorParams = {
  seed: 20260101,
  size: 5000,
  provinsiCount: 8,
  meanAge: 38,
  ageSpread: 16,
  correlation: 0.35,
  sensitiveValues: DEFAULT_SENSITIVE_VALUES,
  sensitiveWeights: DEFAULT_SENSITIVE_WEIGHTS,
};

/** Reference date for age arithmetic. The engine imports no Date (CLAUDE.md §5). */
export const REFERENCE_YEAR = 2026;

export const COLUMNS: readonly ColumnSpec[] = [
  { id: 'kelurahan', label: 'Kelurahan', role: 'quasi', type: 'categorical', cardinality: 0 },
  { id: 'birthdate', label: 'Date of birth', role: 'quasi', type: 'date', cardinality: 0 },
  { id: 'gender', label: 'Gender', role: 'quasi', type: 'categorical', cardinality: 2 },
  { id: 'age', label: 'Age', role: 'quasi', type: 'ordinal', cardinality: 0 },
  { id: 'diagnosis', label: 'Diagnosis', role: 'sensitive', type: 'categorical', cardinality: 5 },
  { id: 'income', label: 'Monthly income', role: 'sensitive', type: 'numeric', cardinality: 0 },
];

function daysInMonth(month: number, year: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function makeName(rng: Rng): string {
  return `${NAME_HEAD[rng.int(NAME_HEAD.length)]} ${NAME_TAIL[rng.int(NAME_TAIL.length)]}`;
}

/**
 * Age from a truncated normal. Truncation, not clamping: clamping piles mass onto the
 * bounds and produces spurious equivalence classes at the extremes.
 */
function sampleAge(rng: Rng, mean: number, spread: number): number {
  for (let attempt = 0; attempt < 32; attempt++) {
    const a = Math.round(mean + rng.normal() * spread);
    // `a === 0` catches -0, which Math.round yields for small negative draws and which
    // would otherwise propagate into ages and dates as a distinct value.
    if (a >= 0 && a <= 99) return a === 0 ? 0 : a;
  }
  return Math.max(0, Math.min(99, Math.round(mean)));
}

/**
 * Sensitive value, tilted toward one value by `correlation` within each region-and-age
 * stratum. At correlation 0 the draw is the population distribution; at 1 the stratum
 * determines the value, which is what produces homogeneous classes for case 2.
 */
function sampleSensitive(
  rng: Rng,
  values: readonly string[],
  weights: readonly number[],
  stratum: number,
  correlation: number,
): string {
  const favoured = stratum % values.length;
  const tilted = weights.map((w, i) => {
    const base = w * (1 - correlation);
    return i === favoured ? base + correlation * 100 : base;
  });
  return values[rng.weighted(tilted)];
}

export function generatePopulation(params: GeneratorParams): Population {
  const hierarchy = buildHierarchy(params.seed, params.provinsiCount);
  const rng = deriveRng(params.seed, 'population');
  const nameRng = deriveRng(params.seed, 'identities');

  const kelWeights = hierarchy.kelurahan.map((k) => k.weight);
  const records: PersonRecord[] = new Array(params.size);
  // Sequence counter per (region, date), mirroring how the real number is issued.
  const sequences = new Map<string, number>();

  for (let i = 0; i < params.size; i++) {
    const kel = hierarchy.kelurahan[rng.weighted(kelWeights)];
    const gender: 'M' | 'F' = rng.next() < 0.5 ? 'M' : 'F';
    const age = sampleAge(rng, params.meanAge, params.ageSpread);
    const year = REFERENCE_YEAR - age;
    const month = 1 + rng.int(12);
    const day = 1 + rng.int(daysInMonth(month, year));
    const birthdate = `${year}-${pad2(month)}-${pad2(day)}`;

    const seqKey = `${kel.code.slice(0, 6)}|${birthdate}`;
    const seq = (sequences.get(seqKey) ?? 0) + 1;
    sequences.set(seqKey, seq);

    const identity: Identity = {
      name: makeName(nameRng),
      kelurahan: kel.code,
      birthdate,
      gender,
    };

    // Stratum for the correlation control: region and decade of age.
    const stratum = (Number(kel.code.slice(0, 6)) + Math.floor(age / 10)) >>> 0;
    const diagnosis = sampleSensitive(
      rng,
      params.sensitiveValues,
      params.sensitiveWeights,
      stratum,
      params.correlation,
    );
    // Income in whole thousands of rupiah per month, lognormal-ish and age-tilted.
    const income = Math.round(
      Math.exp(8.1 + rng.normal() * 0.45 + Math.min(age, 55) * 0.012) * 10,
    ) * 10;

    records[i] = {
      id: i,
      nik: buildNik(kel.code, birthdate, gender, seq),
      quasi: {
        kelurahan: kel.code,
        birthdate,
        gender,
        age,
      },
      sensitive: { diagnosis, income },
      identity,
    };
  }

  const columns = COLUMNS.map((c) => ({ ...c }));
  const distinct = (fn: (r: PersonRecord) => string | number): number => {
    const s = new Set<string | number>();
    for (const r of records) s.add(fn(r));
    return s.size;
  };
  for (const c of columns) {
    if (c.id === 'kelurahan') c.cardinality = hierarchy.kelurahan.length;
    else if (c.id === 'birthdate') c.cardinality = distinct((r) => r.quasi.birthdate);
    else if (c.id === 'age') c.cardinality = distinct((r) => r.quasi.age);
    else if (c.id === 'income') c.cardinality = distinct((r) => r.sensitive.income);
  }

  return { seed: params.seed, params, records, hierarchy, columns };
}

/**
 * Application state.
 *
 * Seed, generator parameters, generalisation vectors, target k, epsilon, the attacker's
 * roll quality and the release fraction serialise to the URL. Every one of them
 * describes a population, a configuration or an assumed adversary, not anyone's data, so
 * sharing stays safe by construction (CLAUDE.md §9).
 *
 * Case progress is local only. Attack results are not shared.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GeneralisationVector, Population } from '../engine/types';
import { generatePopulation, DEFAULT_PARAMS } from '../engine/generate/population';
import { buildTaxonomy, type Taxonomy } from '../engine/taxonomy';
import { hierarchyCardinalities } from '../engine/generate/hierarchy';
import { generalisePopulation } from '../engine/generalise';
import { buildClasses, type ClassSet } from '../engine/classes';

export const QUASI = ['kelurahan', 'birthdate', 'gender', 'age'] as const;

export interface AppConfig {
  seed: number;
  size: number;
  provinsiCount: number;
  meanAge: number;
  ageSpread: number;
  correlation: number;
  vector: GeneralisationVector;
  targetK: number;
  epsilon: number;
  /**
   * The second release, for the composition instrument. A generalisation vector like
   * `vector`, describing a hypothetical second publication of the same population.
   */
  vectorB: GeneralisationVector;
  /** Share of the population the attacker's roll lists, 0 to 1. */
  rollCoverage: number;
  /** Share of those listings carrying a wrong quasi-identifier, 0 to 1. */
  rollError: number;
  /** Share of the population a release contains, 0 to 1. */
  releaseFraction: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  seed: DEFAULT_PARAMS.seed,
  size: 5000,
  provinsiCount: 8,
  meanAge: DEFAULT_PARAMS.meanAge,
  ageSpread: DEFAULT_PARAMS.ageSpread,
  correlation: DEFAULT_PARAMS.correlation,
  vector: { kelurahan: 0, birthdate: 0, gender: 0, age: 0 },
  targetK: 5,
  epsilon: 1,
  // One step coarser on region than the first release and identical elsewhere, which is
  // the shape of the mistake the composition instrument is about: a second analyst asked
  // for a different cut and nobody compared the two.
  vectorB: { kelurahan: 1, birthdate: 0, gender: 0, age: 0 },
  rollCoverage: 0.7,
  rollError: 0.1,
  releaseFraction: 0.05,
};

/* ------------------------------------------------------------------------- URL */

const NUMBER_KEYS = [
  'seed',
  'size',
  'provinsiCount',
  'meanAge',
  'ageSpread',
  'correlation',
  'targetK',
  'epsilon',
  'rollCoverage',
  'rollError',
  'releaseFraction',
] as const;

export function serialiseConfig(config: AppConfig): string {
  const params = new URLSearchParams();
  for (const key of NUMBER_KEYS) params.set(key, String(config[key]));
  params.set('v', QUASI.map((c) => config.vector[c] ?? 0).join(','));
  params.set('v2', QUASI.map((c) => config.vectorB[c] ?? 0).join(','));
  return params.toString();
}

export function parseConfig(search: string, base: AppConfig = DEFAULT_CONFIG): AppConfig {
  const params = new URLSearchParams(search);
  const out: AppConfig = { ...base, vector: { ...base.vector }, vectorB: { ...base.vectorB } };
  for (const key of NUMBER_KEYS) {
    const raw = params.get(key);
    // An empty parameter is an absent one. Number('') is 0 and 0 is finite, so without
    // this a link ending in `&releaseFraction=` would silently publish nothing rather
    // than fall back to the default.
    if (raw === null || raw.trim() === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out[key] = value;
  }
  readVector(params.get('v'), out.vector);
  readVector(params.get('v2'), out.vectorB);
  // Clamp to sane ranges, so a hand-edited URL cannot hang the generator.
  out.size = Math.max(100, Math.min(200000, Math.round(out.size)));
  out.provinsiCount = Math.max(1, Math.min(24, Math.round(out.provinsiCount)));
  out.targetK = Math.max(1, Math.min(1000, Math.round(out.targetK)));
  out.epsilon = Math.max(0.01, Math.min(10, out.epsilon));
  out.correlation = Math.max(0, Math.min(1, out.correlation));
  out.meanAge = Math.max(5, Math.min(90, out.meanAge));
  out.ageSpread = Math.max(1, Math.min(40, out.ageSpread));
  out.rollCoverage = clampShare(out.rollCoverage);
  out.rollError = clampShare(out.rollError);
  out.releaseFraction = clampShare(out.releaseFraction);
  return out;
}

/** A hand-edited URL cannot put a share outside the unit interval. */
function clampShare(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function readVector(raw: string | null, into: GeneralisationVector): void {
  if (!raw) return;
  const parts = raw.split(',').map(Number);
  QUASI.forEach((c, i) => {
    if (Number.isFinite(parts[i])) into[c] = Math.max(0, Math.floor(parts[i]));
  });
}

/**
 * Apply a patch to a configuration.
 *
 * Pure and exported so the identity rule below can be asserted directly rather than
 * through a hook: a patch that carries no vector must return the *same* vector object,
 * because the generalisation memo is keyed on that identity. Rebuilding it on every
 * update meant that moving the epsilon slider re-keyed the whole population.
 */
export function mergeConfig(current: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    ...current,
    ...patch,
    vector: patch.vector ? { ...current.vector, ...patch.vector } : current.vector,
    vectorB: patch.vectorB ? { ...current.vectorB, ...patch.vectorB } : current.vectorB,
  };
}

/* ---------------------------------------------------------------------- derived */

export interface Derived {
  population: Population;
  taxonomy: Taxonomy;
  keys: string[];
  classes: ClassSet;
}

export function buildTaxonomyFor(population: Population): Taxonomy {
  const hc = hierarchyCardinalities(population.hierarchy);
  const dates = new Set<string>();
  const months = new Set<string>();
  const years = new Set<string>();
  const ages = new Set<number>();
  for (const r of population.records) {
    const d = String(r.quasi.birthdate);
    dates.add(d);
    months.add(d.slice(0, 7));
    years.add(d.slice(0, 4));
    ages.add(Number(r.quasi.age));
  }
  return buildTaxonomy({
    ...hc,
    birthdates: dates.size,
    months: months.size,
    years: years.size,
    ages: ages.size,
  });
}

export function useConfig(): [AppConfig, (patch: Partial<AppConfig>) => void] {
  const [config, setConfig] = useState<AppConfig>(() =>
    parseConfig(typeof window === 'undefined' ? '' : window.location.search),
  );

  const update = useCallback((patch: Partial<AppConfig>) => {
    setConfig((current) => mergeConfig(current, patch));
  }, []);

  // The URL follows the configuration. replaceState rather than pushState: a slider
  // drag should not fill the history stack.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = `${window.location.pathname}?${serialiseConfig(config)}`;
    window.history.replaceState(null, '', next);
  }, [config]);

  return [config, update];
}

export function useDerived(config: AppConfig): Derived {
  const population = useMemo(
    () =>
      generatePopulation({
        ...DEFAULT_PARAMS,
        seed: config.seed,
        size: config.size,
        provinsiCount: config.provinsiCount,
        meanAge: config.meanAge,
        ageSpread: config.ageSpread,
        correlation: config.correlation,
      }),
    [config.seed, config.size, config.provinsiCount, config.meanAge, config.ageSpread, config.correlation],
  );

  const taxonomy = useMemo(() => buildTaxonomyFor(population), [population]);

  const keys = useMemo(
    () => generalisePopulation(population.records, taxonomy, config.vector, QUASI),
    [population, taxonomy, config.vector],
  );

  const classes = useMemo(() => buildClasses(population.records, keys), [population, keys]);

  return { population, taxonomy, keys, classes };
}

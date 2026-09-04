/**
 * Application state.
 *
 * Seed, generator parameters, generalisation vector, target k and epsilon serialise to
 * the URL. These describe a population and a configuration, not anyone's data, so
 * sharing is safe by construction (CLAUDE.md §9).
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
] as const;

export function serialiseConfig(config: AppConfig): string {
  const params = new URLSearchParams();
  for (const key of NUMBER_KEYS) params.set(key, String(config[key]));
  params.set('v', QUASI.map((c) => config.vector[c] ?? 0).join(','));
  return params.toString();
}

export function parseConfig(search: string, base: AppConfig = DEFAULT_CONFIG): AppConfig {
  const params = new URLSearchParams(search);
  const out: AppConfig = { ...base, vector: { ...base.vector } };
  for (const key of NUMBER_KEYS) {
    const raw = params.get(key);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out[key] = value;
  }
  const v = params.get('v');
  if (v) {
    const parts = v.split(',').map(Number);
    QUASI.forEach((c, i) => {
      if (Number.isFinite(parts[i])) out.vector[c] = Math.max(0, Math.floor(parts[i]));
    });
  }
  // Clamp to sane ranges, so a hand-edited URL cannot hang the generator.
  out.size = Math.max(100, Math.min(200000, Math.round(out.size)));
  out.provinsiCount = Math.max(1, Math.min(24, Math.round(out.provinsiCount)));
  out.targetK = Math.max(1, Math.min(1000, Math.round(out.targetK)));
  out.epsilon = Math.max(0.01, Math.min(10, out.epsilon));
  out.correlation = Math.max(0, Math.min(1, out.correlation));
  out.meanAge = Math.max(5, Math.min(90, out.meanAge));
  out.ageSpread = Math.max(1, Math.min(40, out.ageSpread));
  return out;
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
    setConfig((current) => ({ ...current, ...patch, vector: { ...current.vector, ...patch.vector } }));
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

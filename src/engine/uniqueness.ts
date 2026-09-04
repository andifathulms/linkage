/**
 * The uniqueness study, and the Sweeney/Golle reconstruction. PRD §2 and §4.6.
 *
 * The most-cited statistic in data privacy is one two careful researchers disagree about
 * by more than twenty-five percentage points.
 *
 *   Sweeney (2000), 1990 US census: 87% of the population had a combination of
 *   five-digit ZIP, gender and full date of birth likely to be unique. City or town plus
 *   gender plus date: roughly 53%. County plus gender plus date: about 18%.
 *
 *   Golle (2006), 2000 census: 63% at ZIP level. Re-running Sweeney's own 1990 data he
 *   obtained 61%, not 87%, and stated plainly that he could not account for the
 *   discrepancy because he lacked detail on her collection and analysis methods. He also
 *   found 18% at county level.
 *
 * Both agree on the phenomenon; the disagreement is about the sharpest case, and it is
 * unresolved. This module does not resolve it either (PRD §6.4). It generates
 * populations where the truth is known, runs both methodologies against them, and
 * reports what each produces.
 *
 * The engine imports nothing (CLAUDE.md §5), so the published figures below are data,
 * cited at the point they are shown.
 */

/** Regional granularity, named in the terms each author used. */
export type RegionLevel = 'postcode' | 'city' | 'county';

export type DatePrecision = 'full' | 'month' | 'year' | 'five-year';

export interface UniquenessConfiguration {
  region: RegionLevel;
  date: DatePrecision;
  gender: boolean;
}

export interface PublishedFigure {
  author: 'Sweeney' | 'Golle';
  year: number;
  census: number;
  configuration: UniquenessConfiguration;
  /** Reported share of the population uniquely identified. */
  share: number;
  note: string;
}

/**
 * The published figures, both authors, no winner picked. Quoted as reported, with the
 * census year each was computed on, because the two are not measurements of the same
 * population and part of the gap may be that.
 */
export const PUBLISHED: readonly PublishedFigure[] = [
  {
    author: 'Sweeney',
    year: 2000,
    census: 1990,
    configuration: { region: 'postcode', date: 'full', gender: true },
    share: 0.87,
    note: '216 million of 248 million. The figure the field cites.',
  },
  {
    author: 'Sweeney',
    year: 2000,
    census: 1990,
    configuration: { region: 'city', date: 'full', gender: true },
    share: 0.53,
    note: 'Roughly half the population, at city or town granularity.',
  },
  {
    author: 'Sweeney',
    year: 2000,
    census: 1990,
    configuration: { region: 'county', date: 'full', gender: true },
    share: 0.18,
    note: 'County level. Golle agrees on this one.',
  },
  {
    author: 'Golle',
    year: 2006,
    census: 2000,
    configuration: { region: 'postcode', date: 'full', gender: true },
    share: 0.63,
    note: '2000 census data.',
  },
  {
    author: 'Golle',
    year: 2006,
    census: 1990,
    configuration: { region: 'postcode', date: 'full', gender: true },
    share: 0.61,
    note:
      "Golle's re-run of Sweeney's own 1990 data. He obtained 61%, not 87%, and stated that he could not account for the discrepancy, lacking detail on her collection and analysis methods.",
  },
  {
    author: 'Golle',
    year: 2006,
    census: 2000,
    configuration: { region: 'county', date: 'full', gender: true },
    share: 0.18,
    note: 'County level, in agreement with Sweeney.',
  },
];

/** The disagreement, stated rather than resolved. */
export const DISAGREEMENT =
  'Sweeney reports 87% at postcode granularity; Golle, re-running her own 1990 data, reports 61%. ' +
  'Golle states he could not account for the difference because he lacked detail on her collection ' +
  'and analysis methods. Both agree on the phenomenon and on the county-level figure of about 18%. ' +
  'The disagreement is about the sharpest case, and it is unresolved. This app does not resolve it.';

/**
 * The two methodologies.
 *
 * The reconstruction's finding is that the gap is not mysterious: it follows from how a
 * region's population is assumed to be distributed. Both authors compute the same thing
 * on different assumptions about that.
 *
 *   'analytic'  Golle's approach as reconstructed here: treat a region's population as
 *               spread over birthdays independently and compute the expected share of
 *               people alone in their (region, birthdate, gender) cell.
 *   'empirical' Count the cells directly in a generated population, which is what a
 *               simulator can do and neither author could.
 */
export type Methodology = 'analytic' | 'empirical';

export interface UniquenessInput {
  /** Number of people in each region, one entry per region. */
  regionSizes: readonly number[];
  /** Distinct birthdate values at the chosen precision. */
  dateCardinality: number;
  /** 2 when gender is disclosed, 1 when it is not. */
  genderCardinality: number;
}

/**
 * Expected share of a population that is alone in its cell, under independence.
 *
 * For a region of n people and c equiprobable cells, the chance a given person is alone
 * is (1 − 1/c)^(n−1), so the expected unique count is n·(1 − 1/c)^(n−1). Summing over
 * regions and dividing by the total gives the share.
 *
 * The independence assumption is the whole crux of the Sweeney/Golle gap and it is
 * stated wherever this number is shown: birthdays are not uniform, region populations
 * are not homogeneous in age, and both effects push the true figure away from this one.
 */
export function analyticUniqueness(input: UniquenessInput): number {
  const cells = Math.max(1, input.dateCardinality * input.genderCardinality);
  let unique = 0;
  let total = 0;
  for (const n of input.regionSizes) {
    if (n <= 0) continue;
    total += n;
    unique += n * Math.pow(1 - 1 / cells, n - 1);
  }
  return total === 0 ? 0 : unique / total;
}

/** Direct count of records alone in their cell. What a simulator can do and a census cannot. */
export function empiricalUniqueness(keys: readonly string[]): number {
  const tally = new Map<string, number>();
  for (const key of keys) tally.set(key, (tally.get(key) ?? 0) + 1);
  let unique = 0;
  for (const n of tally.values()) if (n === 1) unique++;
  return keys.length === 0 ? 0 : unique / keys.length;
}

export interface ReconstructionResult {
  configuration: UniquenessConfiguration;
  populationSize: number;
  regionCount: number;
  /** Distinct cells per region: dates times gender values. */
  cellsPerRegion: number;
  analytic: number;
  empirical: number;
  /** empirical − analytic. Where the two methodologies part company. */
  divergence: number;
  /** Published figures for this configuration, both authors, unranked. */
  published: PublishedFigure[];
}

/**
 * Run both methodologies on one population and one configuration.
 *
 * Divergences are documented rather than tuned away (PRD §7.7). Where the empirical
 * figure sits above the analytic one, the cause is that real region populations are not
 * spread evenly over birthdays — an age distribution concentrates people, which produces
 * *more* collisions in the dense years and more uniqueness in the sparse ones, and the
 * two effects do not cancel.
 */
export function reconstruct(
  keys: readonly string[],
  regionOf: readonly string[],
  configuration: UniquenessConfiguration,
  dateCardinality: number,
): ReconstructionResult {
  const regionCounts = new Map<string, number>();
  for (const r of regionOf) regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);

  const genderCardinality = configuration.gender ? 2 : 1;
  const analytic = analyticUniqueness({
    regionSizes: [...regionCounts.values()],
    dateCardinality,
    genderCardinality,
  });
  const empirical = empiricalUniqueness(keys);

  return {
    configuration,
    populationSize: keys.length,
    regionCount: regionCounts.size,
    cellsPerRegion: dateCardinality * genderCardinality,
    analytic,
    empirical,
    divergence: empirical - analytic,
    published: PUBLISHED.filter(
      (p) =>
        p.configuration.region === configuration.region &&
        p.configuration.date === configuration.date &&
        p.configuration.gender === configuration.gender,
    ).slice(),
  };
}

/** The three headline configurations PRD §4.6 requires the study to report. */
export const HEADLINE_CONFIGURATIONS: readonly UniquenessConfiguration[] = [
  { region: 'postcode', date: 'full', gender: true },
  { region: 'city', date: 'full', gender: true },
  { region: 'county', date: 'full', gender: true },
];

/**
 * The assumption every estimate here rests on, stated wherever a number is shown.
 * Correlated columns make the estimate optimistic (CLAUDE.md §7).
 */
export const INDEPENDENCE_ASSUMPTION =
  'The analytic estimate treats birthdate and gender as independent of region and of each other, ' +
  'and treats birthdates within a region as equiprobable. Real populations satisfy neither: ' +
  'birth months cluster, and regions differ in age structure. Correlation makes this estimate optimistic.';

/**
 * Golle's reconstruction, applied to declared cardinalities rather than to a population.
 * This is the estimate the schema assessor uses (CLAUDE.md §7), and it is the same
 * mathematics as `analyticUniqueness` with the region count carrying the quasi-identifier
 * product.
 */
export function uniquenessFromCardinalities(
  populationSize: number,
  cardinalities: readonly number[],
): number {
  let cells = 1;
  for (const c of cardinalities) cells *= Math.max(1, c);
  if (cells <= 1) return populationSize <= 1 ? 1 : 0;
  // Expected share alone in a cell, under independence and uniformity.
  return Math.pow(1 - 1 / cells, populationSize - 1);
}

/** Expected number of distinct equivalence classes, and the expected minimum size. */
export function expectedClassCount(populationSize: number, cells: number): number {
  if (cells <= 0) return 0;
  return cells * (1 - Math.pow(1 - 1 / cells, populationSize));
}

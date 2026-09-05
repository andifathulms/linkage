/**
 * The release, and the population it was drawn from.
 *
 * Everywhere else in this app the released table *is* the population: the generator
 * makes a population and the field draws every record of it. That is a simplification,
 * and it hides the distinction a steward most needs.
 *
 * A release is usually a sample. An extract, a year, a programme, a province. And k, as
 * a steward computes it, is a property of the extract in front of them. It answers one
 * question:
 *
 *   Forward, target to row. The attacker knows a person and looks their attributes up in
 *   the released table. How many rows match? This depends on counts *in the release*,
 *   and it is what k measures.
 *
 * It does not answer the other one:
 *
 *   Backward, row to person. The attacker reads a released row and asks who it is. How
 *   many people in the population share those attributes? This depends on counts *in the
 *   population*, and k says nothing about it.
 *
 * The two come apart as soon as the release is a sample, and they come apart in the
 * direction that matters. A row alone in a 2% extract, whose attributes forty unsampled
 * people also hold, is not nameable. Its k is 1 and it is safe to publish. A steward who
 * reads k=1 and withholds it has withheld a releasable dataset; a steward who publishes
 * a full census extract at k=1 has published forty people's names. Same number, opposite
 * decisions, and only the population tells you which case you are in.
 *
 * Sweeney's result is the backward question. "87% of the population had a combination
 * likely to be unique" is a statement about a population, not about anybody's extract,
 * which is one reason the figure travels badly into a steward's own arithmetic.
 *
 * Pure and seeded (CLAUDE.md §3, §5).
 */
import { makeRng } from './rng';
import type { PersonRecord } from './types';

export interface ReleaseSample {
  /** Indices into the population, ascending. The released rows. */
  indices: number[];
  /** Share requested. */
  fraction: number;
  released: number;
  population: number;
}

/**
 * Draw a release from a population.
 *
 * Independent Bernoulli inclusion per record rather than a fixed-size draw, because that
 * is what a real extract is: a filter applied per person, not a quota. The realised
 * count therefore varies slightly around the requested fraction, and the result carries
 * it so nothing downstream has to assume.
 */
export function sampleRelease(
  records: readonly PersonRecord[],
  fraction: number,
  seed: number,
): ReleaseSample {
  const f = !Number.isFinite(fraction) ? 0 : fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  const rng = makeRng(seed);
  const indices: number[] = [];
  for (let i = 0; i < records.length; i++) {
    if (rng.next() < f) indices.push(i);
  }
  return { indices, fraction: f, released: indices.length, population: records.length };
}

export interface ReleaseRisk {
  released: number;
  population: number;

  /**
   * Rows alone in the released table. This is what a steward computes, and the count
   * behind a reported k of 1.
   */
  aloneInRelease: number;
  /** Smallest class within the release. The release's k. */
  kRelease: number;

  /**
   * Released rows whose attributes are unique in the whole population. These are the
   * rows that can be named, and the number a steward almost never has.
   */
  nameableInPopulation: number;
  /** Smallest population class among released rows. */
  kPopulation: number;

  /**
   * Rows alone in the release yet sharing their attributes with somebody who was not
   * sampled. Not nameable, and counted against the release's k as though they were.
   * This is the gap, and at fraction 1 it is zero by construction.
   */
  aloneButNotNameable: number;

  /**
   * The largest number of people in the population sharing the attributes of a row that
   * stands alone in the release. The single most useful figure here: it says how badly
   * the release's own k can mislead.
   */
  widestHidingPlace: number;
}

/**
 * Measure both readings of the same release.
 *
 * `keys` is index-aligned with the whole population at whatever generalisation is in
 * force. `indices` is the release. Nothing is sampled here, so the same release measured
 * twice gives the same answer.
 */
export function measureRelease(
  keys: readonly string[],
  indices: readonly number[],
): ReleaseRisk {
  const populationCounts = new Map<string, number>();
  for (const key of keys) populationCounts.set(key, (populationCounts.get(key) ?? 0) + 1);

  const releaseCounts = new Map<string, number>();
  for (const i of indices) {
    const key = keys[i];
    releaseCounts.set(key, (releaseCounts.get(key) ?? 0) + 1);
  }

  let aloneInRelease = 0;
  let nameableInPopulation = 0;
  let aloneButNotNameable = 0;
  let kRelease = Infinity;
  let kPopulation = Infinity;
  let widestHidingPlace = 0;

  for (const i of indices) {
    const key = keys[i];
    const inRelease = releaseCounts.get(key) ?? 0;
    const inPopulation = populationCounts.get(key) ?? 0;

    if (inRelease < kRelease) kRelease = inRelease;
    if (inPopulation < kPopulation) kPopulation = inPopulation;

    if (inRelease === 1) {
      aloneInRelease += 1;
      if (inPopulation > 1) {
        aloneButNotNameable += 1;
        if (inPopulation > widestHidingPlace) widestHidingPlace = inPopulation;
      }
    }
    if (inPopulation === 1) nameableInPopulation += 1;
  }

  return {
    released: indices.length,
    population: keys.length,
    aloneInRelease,
    kRelease: indices.length === 0 ? 0 : kRelease,
    nameableInPopulation,
    kPopulation: indices.length === 0 ? 0 : kPopulation,
    aloneButNotNameable,
    widestHidingPlace,
  };
}

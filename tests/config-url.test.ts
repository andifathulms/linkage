/**
 * The configuration, and the URL it lives in. CLAUDE.md §9.
 *
 * The rule is that anything a reader can change survives a refresh and can be sent to
 * somebody else. That holds only if every control's value round-trips through the query
 * string exactly, so this asserts the round-trip rather than the presence of parameters.
 *
 * It also asserts what must not round-trip. The URL describes a population, a
 * configuration and an assumed adversary. It carries no record, no identity and no
 * attack result, and nothing here should ever make it do so.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  QUASI,
  serialiseConfig,
  parseConfig,
  mergeConfig,
  type AppConfig,
} from '../src/state/store';

/** A configuration with every field moved off its default. */
const MOVED: AppConfig = {
  seed: 4242,
  size: 12500,
  provinsiCount: 11,
  meanAge: 44,
  ageSpread: 21,
  correlation: 0.62,
  vector: { kelurahan: 2, birthdate: 3, gender: 1, age: 2 },
  targetK: 12,
  epsilon: 0.35,
  vectorB: { kelurahan: 4, birthdate: 1, gender: 0, age: 3 },
  rollCoverage: 0.42,
  rollError: 0.17,
  releaseFraction: 0.08,
  sensitiveSkew: 0.23,
};

describe('the configuration round-trips through the URL', () => {
  it('restores every field it was given', () => {
    const restored = parseConfig(serialiseConfig(MOVED));
    expect(restored).toEqual(MOVED);
  });

  it('restores the defaults too, so a fresh link is not a special case', () => {
    expect(parseConfig(serialiseConfig(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
  });

  it('carries the controls added for the five instruments', () => {
    // Named individually rather than by iterating the config, so that adding a control
    // and forgetting to serialise it fails here instead of passing quietly.
    const params = new URLSearchParams(serialiseConfig(MOVED));
    expect(params.get('rollCoverage')).toBe('0.42');
    expect(params.get('rollError')).toBe('0.17');
    expect(params.get('releaseFraction')).toBe('0.08');
    expect(params.get('sensitiveSkew')).toBe('0.23');
    expect(params.get('v2')).toBe('4,1,0,3');
  });

  it('keeps the two generalisation vectors apart', () => {
    const params = new URLSearchParams(serialiseConfig(MOVED));
    expect(params.get('v')).toBe('2,3,1,2');
    expect(params.get('v2')).toBe('4,1,0,3');
    const restored = parseConfig(serialiseConfig(MOVED));
    expect(restored.vector).toEqual(MOVED.vector);
    expect(restored.vectorB).toEqual(MOVED.vectorB);
  });

  it('falls back to the defaults for anything the URL omits', () => {
    const restored = parseConfig('seed=99');
    expect(restored.seed).toBe(99);
    expect(restored.rollCoverage).toBe(DEFAULT_CONFIG.rollCoverage);
    expect(restored.releaseFraction).toBe(DEFAULT_CONFIG.releaseFraction);
    expect(restored.vectorB).toEqual(DEFAULT_CONFIG.vectorB);
  });

  it('does not let a parsed configuration alias the defaults', () => {
    // Both vectors are copied out of the base, so editing one parsed configuration
    // cannot reach back and change DEFAULT_CONFIG for everything else.
    const restored = parseConfig('');
    restored.vector.kelurahan = 3;
    restored.vectorB.kelurahan = 3;
    expect(DEFAULT_CONFIG.vector.kelurahan).toBe(0);
    expect(DEFAULT_CONFIG.vectorB.kelurahan).toBe(1);
  });
});

describe('a hand-edited URL cannot put the app in a bad state', () => {
  it('clamps the shares to the unit interval', () => {
    const high = parseConfig('rollCoverage=9&rollError=4.5&releaseFraction=100');
    expect(high.rollCoverage).toBe(1);
    expect(high.rollError).toBe(1);
    expect(high.releaseFraction).toBe(1);

    const low = parseConfig('rollCoverage=-3&rollError=-0.5&releaseFraction=-1');
    expect(low.rollCoverage).toBe(0);
    expect(low.rollError).toBe(0);
    expect(low.releaseFraction).toBe(0);
  });

  it('ignores values that are not numbers', () => {
    const restored = parseConfig('rollCoverage=abc&releaseFraction=&seed=NaN');
    expect(restored.rollCoverage).toBe(DEFAULT_CONFIG.rollCoverage);
    expect(restored.releaseFraction).toBe(DEFAULT_CONFIG.releaseFraction);
    expect(restored.seed).toBe(DEFAULT_CONFIG.seed);
  });

  it('holds both vectors to non-negative whole levels', () => {
    const restored = parseConfig('v=-1,2.7,0,0&v2=-4,1,0,0');
    expect(restored.vector.kelurahan).toBe(0);
    expect(restored.vector.birthdate).toBe(2);
    expect(restored.vectorB.kelurahan).toBe(0);
  });

  it('keeps the generator inside a range it can actually run', () => {
    const huge = parseConfig('size=99999999&provinsiCount=400&targetK=100000&epsilon=500');
    expect(huge.size).toBeLessThanOrEqual(200000);
    expect(huge.provinsiCount).toBeLessThanOrEqual(24);
    expect(huge.targetK).toBeLessThanOrEqual(1000);
    expect(huge.epsilon).toBeLessThanOrEqual(10);
  });
});

describe('the URL carries a configuration and nothing else', () => {
  it('names only configuration parameters', () => {
    const allowed = new Set([
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
      'sensitiveSkew',
      'v',
      'v2',
    ]);
    for (const [key] of new URLSearchParams(serialiseConfig(MOVED))) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it('carries no record, identity or result', () => {
    const serialised = serialiseConfig(MOVED).toLowerCase();
    for (const forbidden of ['nik', 'name', 'diagnosis', 'income', 'progress', 'correct', 'identified']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe('merging a patch', () => {
  it('keeps the vector identity when the patch does not carry one', () => {
    // The generalisation memo is keyed on this identity. Rebuilding the object on every
    // update meant moving the epsilon slider re-keyed the whole population.
    const next = mergeConfig(DEFAULT_CONFIG, { epsilon: 2 });
    expect(next.vector).toBe(DEFAULT_CONFIG.vector);
    expect(next.vectorB).toBe(DEFAULT_CONFIG.vectorB);
    expect(next.epsilon).toBe(2);
  });

  it('merges a vector patch into a new object, leaving the other alone', () => {
    const next = mergeConfig(DEFAULT_CONFIG, { vector: { kelurahan: 2 } });
    expect(next.vector).not.toBe(DEFAULT_CONFIG.vector);
    expect(next.vector.kelurahan).toBe(2);
    expect(next.vector.birthdate).toBe(DEFAULT_CONFIG.vector.birthdate);
    expect(next.vectorB).toBe(DEFAULT_CONFIG.vectorB);
  });

  it('merges the second vector independently of the first', () => {
    const next = mergeConfig(DEFAULT_CONFIG, { vectorB: { age: 3 } });
    expect(next.vectorB.age).toBe(3);
    expect(next.vectorB.kelurahan).toBe(DEFAULT_CONFIG.vectorB.kelurahan);
    expect(next.vector).toBe(DEFAULT_CONFIG.vector);
  });

  it('does not mutate the configuration it was given', () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    mergeConfig(DEFAULT_CONFIG, { vector: { kelurahan: 4 }, vectorB: { age: 2 }, seed: 7 });
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });
});

describe('the quasi-identifier order the URL depends on', () => {
  it('is the order both vectors are written in', () => {
    // v and v2 are positional. If QUASI ever reorders, every link ever shared silently
    // means something else, so the order is pinned here.
    expect([...QUASI]).toEqual(['kelurahan', 'birthdate', 'gender', 'age']);
  });
});

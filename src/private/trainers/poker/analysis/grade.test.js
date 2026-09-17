import { describe, it, expect } from 'vitest';
import { ANALYSIS_VERSION } from './version.js';
import {
  GRADES, GOOD_BELOW, INACCURACY_BELOW, MISTAKE_UP_TO, gradeFor, roundEv, roundProb, hashString, seedFor, mixSeed,
} from './grade.js';

describe('grade bands (spec §7.1)', () => {
  it('uses the documented constants', () => {
    expect(ANALYSIS_VERSION).toBe(1);
    expect(GRADES).toEqual(['good', 'inaccuracy', 'mistake', 'blunder']);
    expect([GOOD_BELOW, INACCURACY_BELOW, MISTAKE_UP_TO]).toEqual([0.03, 0.1, 0.25]);
  });

  it('grades EV loss as a share of the pot before the decision', () => {
    expect(gradeFor(0, 100)).toBe('good');
    expect(gradeFor(2.99, 100)).toBe('good');
    expect(gradeFor(3, 100)).toBe('inaccuracy');
    expect(gradeFor(9.99, 100)).toBe('inaccuracy');
    expect(gradeFor(10, 100)).toBe('mistake');
    expect(gradeFor(25, 100)).toBe('mistake');
    expect(gradeFor(25.01, 100)).toBe('blunder');
    expect(gradeFor(1, 0)).toBe('blunder');
    expect(gradeFor(-1, 10)).toBe('good');
  });
});

describe('rounding', () => {
  it('rounds EVs to 2 decimals without negative zero, probabilities to 4', () => {
    expect(roundEv(2.345678)).toBe(2.35);
    expect(roundEv(-7.891)).toBe(-7.89);
    expect(Object.is(roundEv(-0.001), 0)).toBe(true);
    expect(roundProb(0.123456)).toBe(0.1235);
  });
});

describe('seeds', () => {
  it('hashes with FNV-1a', () => {
    expect(hashString('')).toBe(2166136261);
    expect(hashString('a')).toBe(3826002220);
  });

  it('derives stable, distinct uint32 seeds', () => {
    expect(seedFor('h1', 4)).toBe(seedFor('h1', 4));
    expect(seedFor('h1', 4)).not.toBe(seedFor('h1', 5));
    expect(seedFor('h1', 4)).not.toBe(seedFor('h2', 4));
    const mixed = new Set([0, 1, 2, 3, 4].map((n) => mixSeed(seedFor('h1', 4), n)));
    expect(mixed.size).toBe(5);
    for (const s of mixed) expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
    expect(mixSeed(7, 3)).toBe(mixSeed(7, 3));
  });
});

import { describe, it, expect } from 'vitest';
import { ROLLING_WINDOW, READINESS_WINDOW, QTYPE_LABEL, progressSummary, readiness, configLabel, formatTrend } from './derive.js';

const DAY = 86400000;
const game = (i, score, extra = {}) => ({
  id: `g${i}`, startedAt: new Date(Date.UTC(2026, 8, 1) + i * DAY).toISOString(),
  score, correct: score, wrong: 0, unanswered: 0, durationMs: 120000, ...extra,
});

describe('progressSummary', () => {
  it('handles no games', () => {
    expect(progressSummary([])).toEqual({ games: 0, best: null, latest: null, rolling: [], trendPerWeek: null, bestPerDay: [] });
  });
  it('summarizes a series', () => {
    const series = [30, 34, 33, 38, 40].map((s, i) => game(i, s));
    const p = progressSummary(series);
    expect(p.games).toBe(5);
    expect(p.best).toBe(40);
    expect(p.latest).toBe(40);
    expect(p.rolling).toEqual([30, 32, 32.333333333333336, 33.75, 35]);
    expect(p.trendPerWeek).toBeCloseTo(16.8, 6);
    expect(p.bestPerDay).toHaveLength(5);
    expect(ROLLING_WINDOW).toBe(10);
  });
});

describe('readiness', () => {
  it('returns null with no games', () => {
    expect(readiness([], 55)).toBeNull();
  });
  it('uses only the last 10 games', () => {
    const series = [10, 10, 60, 50, 55, 70, 40, 56, 54, 61, 58, 49].map((s, i) => game(i, s, { correct: s, wrong: 5 }));
    const r = readiness(series, 55);
    expect(READINESS_WINDOW).toBe(10);
    expect(r.n).toBe(10);
    expect(r.atOrAbove).toBe(6);
    expect(r.share).toBeCloseTo(0.6, 9);
    expect(r.mean).toBeCloseTo(55.3, 9);
    expect(r.avgReached).toBeCloseTo(60.3, 9);
    expect(r.sd).toBeGreaterThan(0);
  });
});

describe('configLabel', () => {
  const defaults = {
    add: true, sub: true, mul: true, div: true,
    add_left_min: 2, add_left_max: 100, add_right_min: 2, add_right_max: 100,
    mul_left_min: 2, mul_left_max: 12, mul_right_min: 2, mul_right_max: 100, duration: 120,
  };
  it('labels zetamac modes', () => {
    expect(configLabel({ trainer: 'zetamac', mode: 'standard', config: defaults })).toBe('Standard · 120 s');
    expect(configLabel({ trainer: 'zetamac', mode: 'drill', config: defaults })).toBe('Drill · 120 s');
    expect(configLabel({ trainer: 'zetamac', mode: 'custom', config: { ...defaults, add: false, sub: false, duration: 60 } }))
      .toBe('Custom · × ÷ · 60 s · 2–12 × 2–100');
    expect(configLabel({ trainer: 'zetamac', mode: 'custom', config: { ...defaults, mul: false, div: false, add_left_max: 50 } }))
      .toBe('Custom · + − · 120 s · 2–50 + 2–100');
  });
  it('labels optiver', () => {
    expect(configLabel({ trainer: 'optiver', mode: 'standard', config: {} })).toBe('80 in 8 · +1 / −1');
  });
});

describe('formatTrend', () => {
  it('formats a signed weekly change', () => {
    expect(formatTrend(1.84)).toBe('+1.8 / week');
    expect(formatTrend(-0.25)).toBe('−0.3 / week');
    expect(formatTrend(0)).toBe('±0.0 / week');
    expect(formatTrend(null)).toBe('Needs 5 games over 3 days');
  });
});

describe('QTYPE_LABEL', () => {
  it('labels all 14 qtypes', () => {
    expect(Object.keys(QTYPE_LABEL)).toHaveLength(14);
    expect(QTYPE_LABEL['z.mul']).toBe('Multiplication');
    expect(QTYPE_LABEL['o.frac.of']).toBe('Fraction of');
  });
});

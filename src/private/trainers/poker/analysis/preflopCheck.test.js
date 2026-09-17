// src/private/trainers/poker/analysis/preflopCheck.test.js
import { describe, it, expect } from 'vitest';
import { buildLog } from '../bots/testHands.js';
import { classOf } from '../bots/handClass.js';
import { chartFreqs } from '../bots/charts.js';
import { parseCards } from '../engine/cards.js';
import { decisionPoints } from './spots.js';
import { CHART_GOOD_FREQ, chartCheck, standardRaiseTo } from './preflopCheck.js';

const lastPoint = (steps, hero, options) => decisionPoints(buildLog(steps, options), hero).at(-1);
// Seat 2 (UTG) holds 7c2d instead of AhAs.
const SEVEN_DEUCE = { holes: ['2c3d', '7h2s', '7c2d', 'KdQd', 'JcTc', '9s9h'] };
// Seat 4 (CO) holds AhAs instead of JcTc, cold facing an open and a 3-bet.
const COLD_ACES = { holes: ['2c3d', '7h2s', '6c5d', '8h4s', 'AhAs', '9s9h'] };
const cls = (text) => {
  const [a, b] = parseCards(text);
  return classOf(a, b);
};

describe('chartCheck', () => {
  it('passes a raise the chart makes with AA under the gun', () => {
    expect(CHART_GOOD_FREQ).toBe(0.2);
    const check = chartCheck(lastPoint(['r 2 5'], 2));
    expect(check.key).toBe('open.UTG');
    expect(check.freqs.raise).toBeGreaterThanOrEqual(0.9);
    expect(check.chosenFreq).toBe(check.freqs.raise);
    expect(check.ok).toBe(true);
    expect(check.recommended).toEqual({ action: 'raise', size: 5 });
  });

  it('passes folding 72o under the gun and fails raising it', () => {
    const base = chartFreqs('open.UTG', cls('7c2d'));
    expect(base.raise).toBeLessThan(CHART_GOOD_FREQ);
    const fold = chartCheck(lastPoint(['f 2'], 2, SEVEN_DEUCE));
    expect(fold.chosenFreq).toBeCloseTo(1 - base.raise - base.call, 10);
    expect(fold.ok).toBe(true);
    expect(fold.recommended).toEqual({ action: 'fold', size: null });
    const raise = chartCheck(lastPoint(['r 2 5'], 2, SEVEN_DEUCE));
    expect(raise.chosenFreq).toBe(base.raise);
    expect(raise.ok).toBe(false);
  });

  it('scores a big blind check as not raising and recommends check over fold', () => {
    const point = lastPoint(['c 2', 'f 3', 'f 4', 'f 5', 'f 0', 'k 1'], 1); // BB holds 7h2s
    const check = chartCheck(point);
    expect(check.key).toBe('vsLimp.BB');
    expect(check.chosenFreq).toBeCloseTo(1 - check.freqs.raise, 10);
    expect(check.recommended.action).toBe(check.freqs.raise >= Math.max(check.freqs.call, check.freqs.fold) ? 'raise' : 'check');
  });

  it('is null postflop', () => {
    const point = lastPoint(['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1'], 1);
    expect(chartCheck(point)).toBeNull();
  });

  it('handles a cold caller facing a 3-bet via the vs4bet chart (coldVs3bet)', () => {
    const point = lastPoint(['r 2 5', 'r 3 15', 'r 4 35'], 4, COLD_ACES);
    expect(point.preflop.kind).toBe('coldVs3bet');
    const check = chartCheck(point);
    expect(check.key).toBe('vs4bet.ip');
    expect(check.freqs.raise).toBe(1);
    expect(check.chosenFreq).toBe(1);
    expect(check.ok).toBe(true);
    expect(check.recommended).toEqual({ action: 'raise', size: 35 });
    expect(standardRaiseTo(point)).toBe(35);
  });
});

describe('standardRaiseTo', () => {
  it('uses the default open size, 3x in position against an open, and all-in for a 5-bet', () => {
    expect(standardRaiseTo(lastPoint(['r 2 5'], 2))).toBe(5);
    expect(standardRaiseTo(lastPoint(['r 2 5', 'f 3', 'f 4', 'c 5'], 5))).toBe(15);
    expect(standardRaiseTo(lastPoint(['r 2 5', 'f 3', 'f 4', 'r 5 16', 'f 0', 'f 1', 'r 2 40', 'c 5'], 5))).toBe(200);
  });
});

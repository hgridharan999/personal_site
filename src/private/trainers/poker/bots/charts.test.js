import { describe, it, expect } from 'vitest';
import { CLASS_COUNT, combosIn, parseClass } from './handClass.js';
import { CHART_SPECS } from '../../../../../scripts/poker/lib/chartGen.js';
import { chartKeys, chartFreqs, scaledFreqs, hasChart, STRENGTH_ORDER, RANK_PCT, topShareWeights } from './charts.js';

const c = parseClass;
// Share of all 1,326 combos that take an action, weighted by frequency.
const share = (key, action) => {
  let sum = 0;
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) sum += chartFreqs(key, cls)[action] * combosIn(cls);
  return sum / 1326;
};

describe('preflop charts', () => {
  it('ships one chart per spec with 169 valid frequencies', () => {
    expect(chartKeys().sort()).toEqual(Object.keys(CHART_SPECS).sort());
    for (const key of chartKeys()) {
      for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
        const { raise, call } = chartFreqs(key, cls);
        expect(raise + call).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(STRENGTH_ORDER.length).toBe(169);
    expect(new Set(STRENGTH_ORDER).size).toBe(169);
    expect(STRENGTH_ORDER[0]).toBe(c('AA'));
    expect(() => chartFreqs('open.BB', 0)).toThrow('Unknown chart: open.BB');
    expect(hasChart('open.UTG')).toBe(true);
  });

  it('opening ranges have the specified widths within 2 points and widen by position', () => {
    for (const key of ['open.UTG', 'open.HJ', 'open.CO', 'open.BTN', 'open.SB']) {
      expect(Math.abs(share(key, 'raise') - CHART_SPECS[key].value)).toBeLessThan(0.02);
    }
    expect(share('open.UTG', 'raise')).toBeLessThan(share('open.CO', 'raise'));
    expect(share('open.CO', 'raise')).toBeLessThan(share('open.BTN', 'raise'));
  });

  it('makes sensible calls on landmark hands', () => {
    expect(chartFreqs('open.UTG', c('AA')).raise).toBe(1);
    expect(chartFreqs('open.UTG', c('72o')).raise).toBe(0);
    expect(chartFreqs('open.BTN', c('K9o')).raise).toBe(1);
    expect(chartFreqs('vsOpen.BB.BTN', c('KK')).raise).toBe(1);
    expect(chartFreqs('vsOpen.BB.BTN', c('T9s')).call).toBe(1);
    expect(chartFreqs('vsOpen.HJ.UTG', c('K4o'))).toEqual({ raise: 0, call: 0 });
    expect(chartFreqs('vs4bet.oop', c('AA')).raise).toBe(1);
  });

  it('orders strength sensibly', () => {
    expect(RANK_PCT[c('AKs')]).toBeLessThan(RANK_PCT[c('AKo')]);
    expect(RANK_PCT[c('JTs')]).toBeLessThan(RANK_PCT[c('JTo')]);
    expect(RANK_PCT[c('KQs')]).toBeLessThan(RANK_PCT[c('72o')]);
  });

  it('scales ranges: a wider multiplier plays weaker hands, a tighter one folds marginal ones', () => {
    expect(chartFreqs('open.UTG', c('K9s')).raise).toBe(0);
    expect(scaledFreqs('open.UTG', c('K9s'), 1.6).raise).toBe(1);
    expect(scaledFreqs('open.UTG', c('KJo'), 0.6).raise).toBe(0);
    expect(scaledFreqs('open.UTG', c('AA'), 0.5).raise).toBe(1);
    expect(scaledFreqs('open.UTG', c('K9s'), 1, 1)).toEqual(chartFreqs('open.UTG', c('K9s')));
  });

  it('topShareWeights keeps the strongest share of combos', () => {
    const w = topShareWeights(0.1);
    let combos = 0;
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) combos += w[cls] * combosIn(cls);
    expect(combos / 1326).toBeGreaterThan(0.08);
    expect(combos / 1326).toBeLessThan(0.12);
    expect(w[c('AA')]).toBe(1);
    expect(w[c('72o')]).toBe(0);
  });
});

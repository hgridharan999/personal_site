// src/private/trainers/poker/analysis/explain.test.js
import { describe, it, expect } from 'vitest';
import { formatBb } from '../lib/format.js';
import { SPOT_FAMILIES, ERROR_TYPES, spotFamily, errorType, optionLabel, formatEv, explainDecision } from './explain.js';

const PREFLOP = ['open', 'vs_limp', 'vs_open', 'squeeze', 'vs_3bet', 'vs_4bet'];
const POSTFLOP = ['cbet', 'no_bet', 'facing_bet', 'facing_raise'];

/** A coherent decision for one spot family and error type. */
function fixture(family, type) {
  const preflop = PREFLOP.includes(family);
  const base = {
    idx: 9, street: preflop ? 'preflop' : 'flop', position: 'BTN',
    spot: preflop ? `pf.${family}` : family === 'other' ? 'weird' : `flop.${family}.ip`,
    pot: 12, toCall: 0, equity: preflop ? null : 0.42, neededEquity: null, confident: true, analysisVersion: 1,
  };
  const rec = (action, size, evByOption) => ({ action, size, evByOption });
  switch (type) {
    case 'chart':
      return { ...base, action: 'raise', size: 5, recommended: rec('raise', 5, {}), evLoss: 0, grade: 'good' };
    case 'best':
      return { ...base, action: 'check', size: null, recommended: rec('check', null, { check: 3, 'bet:6': 1 }), evLoss: 0, grade: 'good' };
    case 'overfold':
      return { ...base, toCall: 6, neededEquity: 0.3333, action: 'fold', size: null, recommended: rec('call', null, { fold: 0, call: 4.5 }), evLoss: 4.5, grade: 'mistake' };
    case 'loose_call':
      return { ...base, toCall: 6, neededEquity: 0.3333, action: 'call', size: null, recommended: rec('fold', null, { fold: 0, call: -3 }), evLoss: 3, grade: 'mistake' };
    case 'too_passive':
      return { ...base, action: 'check', size: null, recommended: rec('bet', 8, { check: 1, 'bet:8': 5 }), evLoss: 4, grade: 'blunder' };
    case 'too_aggressive':
      return { ...base, action: 'bet', size: 8, recommended: rec('check', null, { check: 5, 'bet:8': 1 }), evLoss: 4, grade: 'blunder' };
    default:
      return { ...base, action: 'bet', size: 8, recommended: rec('bet', 16, { 'bet:8': 2, 'bet:16': 6 }), evLoss: 4, grade: 'blunder' };
  }
}

describe('labels', () => {
  it('names families, options and EVs', () => {
    expect(SPOT_FAMILIES).toEqual([...PREFLOP, ...POSTFLOP, 'other']);
    expect(spotFamily('river.facing_bet.oop')).toBe('facing_bet');
    expect(spotFamily('pf.vs_3bet')).toBe('vs_3bet');
    expect(spotFamily('turn.overbet_probe')).toBe('other');
    expect(spotFamily('weird')).toBe('other');
    expect(optionLabel('fold')).toBe('Fold');
    expect(optionLabel('bet:4')).toBe('Bet 2.0 BB');
    expect(optionLabel('raise:25')).toBe('Raise to 12.5 BB');
    expect(formatEv(9)).toBe('4.5 BB');
    expect(formatEv(-2)).toBe('−1.0 BB');
    expect(formatEv(-0.04)).toBe('0.0 BB');
  });
});

describe('errorType', () => {
  it.each(ERROR_TYPES)('classifies %s', (type) => {
    const family = type === 'chart' ? 'open' : 'no_bet';
    expect(errorType(fixture(family, type))).toBe(type);
  });
});

describe('explainDecision', () => {
  it('renders the spec example with real numbers', () => {
    const d = {
      street: 'river', spot: 'river.facing_bet.oop', action: 'call', size: null, pot: 60, toCall: 48,
      equity: 0.21, neededEquity: 0.34, recommended: { action: 'fold', size: null, evByOption: { fold: 0, call: -10.2 } },
      evLoss: 10.2, grade: 'blunder', confident: true,
    };
    expect(explainDecision(d)).toBe(
      'You faced a bet. You called 24.0 BB into 30.0 BB. You needed 34% equity and had about 21% against their likely range. Folding loses nothing; calling cost about 5.1 BB.',
    );
  });

  it('renders every spot family with every error type that can occur there', () => {
    for (const family of [...PREFLOP, ...POSTFLOP, 'other']) {
      for (const type of ERROR_TYPES) {
        if (type === 'chart' && !PREFLOP.includes(family)) continue;
        const d = fixture(family, type);
        const text = explainDecision(d, type === 'chart' ? { chart: { chosenFreq: 0.85 } } : {});
        expect(text, `${family}.${type}`).not.toMatch(/undefined|NaN|null|\[object/);
        expect(text.length, `${family}.${type}`).toBeGreaterThan(30);
        if (d.evLoss > 0) expect(text, `${family}.${type}`).toContain(`${formatBb(d.evLoss)} BB`);
      }
    }
  });

  it('cites the chart frequency and marks debatable grades', () => {
    expect(explainDecision(fixture('open', 'chart'), { chart: { chosenFreq: 0.85 } })).toContain('85% of the time');
    expect(explainDecision(fixture('open', 'chart'))).toContain('matches the preflop chart');
    expect(explainDecision({ ...fixture('no_bet', 'too_passive'), confident: false })).toMatch(/debatable\.$/);
  });
});

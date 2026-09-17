import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { CLASS_COUNT, parseClass } from './handClass.js';
import { classVsClassEquity, encodeEquityTable } from '../../../../../scripts/poker/lib/equityTable.js';
import { classEquity, equityVsClassWeights, EQUITY_VS_ANY, decodeEquityTable } from './preflopEquity.js';

const c = parseClass;

describe('preflop equity table', () => {
  it('matches known heads-up class equities within 2 points', () => {
    expect(classEquity(c('AA'), c('KK'))).toBeGreaterThan(0.80);
    expect(classEquity(c('AA'), c('KK'))).toBeLessThan(0.84);
    expect(classEquity(c('AKo'), c('22'))).toBeGreaterThan(0.45);
    expect(classEquity(c('AKo'), c('22'))).toBeLessThan(0.49);
    expect(classEquity(c('KK'), c('AA'))).toBeCloseTo(1 - classEquity(c('AA'), c('KK')), 4);
    expect(classEquity(c('T9s'), c('T9s'))).toBeCloseTo(0.5, 4);
  });

  it('AA is about 85% and 72o about 35% against a random hand', () => {
    expect(EQUITY_VS_ANY[c('AA')]).toBeGreaterThan(0.84);
    expect(EQUITY_VS_ANY[c('AA')]).toBeLessThan(0.86);
    expect(EQUITY_VS_ANY[c('72o')]).toBeGreaterThan(0.33);
    expect(EQUITY_VS_ANY[c('72o')]).toBeLessThan(0.37);
  });

  it('weights ranges by class and combo count', () => {
    const onlyKK = new Float32Array(CLASS_COUNT);
    onlyKK[c('KK')] = 1;
    expect(equityVsClassWeights(c('AA'), onlyKK)).toBeCloseTo(classEquity(c('AA'), c('KK')), 6);
    expect(equityVsClassWeights(c('AA'), new Float32Array(CLASS_COUNT))).toBe(0.5);
  });

  it('the generator agrees with the shipped table and round-trips the encoding', () => {
    const fresh = classVsClassEquity(c('QQ'), c('AKs'), 20000, mulberry32(11));
    expect(Math.abs(fresh - classEquity(c('QQ'), c('AKs')))).toBeLessThan(0.02);
    const table = Float32Array.from([0, 0.25, 0.5, 1]);
    const decoded = decodeEquityTable(encodeEquityTable(table));
    decoded.forEach((x, i) => expect(x).toBeCloseTo(table[i], 4));
  });
});

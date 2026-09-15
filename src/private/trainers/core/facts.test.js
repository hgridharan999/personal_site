import { describe, it, expect } from 'vitest';
import { parseFactKey, countCarries, rankWeakFacts, DRILL_UNLOCK_GAMES, DRILL_RECENT_GAMES, DRILL_POOL_SIZE, factPrompt } from './facts.js';

describe('parseFactKey', () => {
  it.each([
    ['add:37+58', { op: 'add', a: 37, b: 58 }],
    ['sub:95-37', { op: 'sub', a: 37, b: 58 }],
    ['mul:7x83', { op: 'mul', a: 7, b: 83 }],
    ['div:581/7', { op: 'div', a: 7, b: 83 }],
  ])('%s', (key, expected) => {
    expect(parseFactKey(key)).toEqual(expected);
  });
  it.each(['add:3x4', 'mul:3+4', 'div:10/3', 'div:10/0', 'sub:5-9', 'pow:2^3', '', null])('rejects %j', (key) => {
    expect(parseFactKey(key)).toBeNull();
  });
});

describe('countCarries', () => {
  it.each([[12, 34, 0], [58, 67, 2], [95, 5, 2], [99, 1, 2], [500, 500, 1], [0, 0, 0]])('%i + %i → %i', (a, b, c) => {
    expect(countCarries(a, b)).toBe(c);
  });
});

describe('rankWeakFacts', () => {
  const rows = [
    { factKey: 'mul:7x83', qtype: 'z.mul', n: 3, medianMs: 4000, correctionsRate: 0 },
    { factKey: 'mul:3x10', qtype: 'z.mul', n: 3, medianMs: 1000, correctionsRate: 0 },
    { factKey: 'mul:9x99', qtype: 'z.mul', n: 3, medianMs: 2500, correctionsRate: 1 },
    { factKey: 'add:2+2', qtype: 'z.add', n: 2, medianMs: 9000, correctionsRate: 0 },
  ];
  it('scores z within qtype plus 1.5 × corrections, sorted desc', () => {
    const ranked = rankWeakFacts(rows);
    expect(ranked.map((r) => r.factKey)).toEqual(['mul:9x99', 'mul:7x83', 'add:2+2', 'mul:3x10']);
    expect(ranked.find((r) => r.factKey === 'add:2+2').weakness).toBe(0);
    expect(ranked[0].weakness).toBeCloseTo(1.5, 6);
    expect(ranked[1].weakness).toBeCloseTo(1, 6);
  });
  it('applies the limit and exposes constants', () => {
    expect(rankWeakFacts(rows, 2)).toHaveLength(2);
    expect([DRILL_UNLOCK_GAMES, DRILL_RECENT_GAMES, DRILL_POOL_SIZE]).toEqual([3, 20, 40]);
  });
});

describe('factPrompt', () => {
  it.each([
    ['add:37+58', '37 + 58'],
    ['sub:95-37', '95 – 37'],
    ['mul:7x83', '7 × 83'],
    ['div:581/7', '581 ÷ 7'],
    ['bogus', 'bogus'],
  ])('%s → %s', (key, prompt) => {
    expect(factPrompt(key)).toBe(prompt);
  });
});

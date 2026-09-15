import { describe, it, expect } from 'vitest';
import { timesGrid, carriesBreakdown, factModesFor } from './statsShape.js';

describe('statsShape', () => {
  it('timesGrid keeps mul facts with b ≤ 20', () => {
    expect(timesGrid([
      { factKey: 'mul:7x13', n: 2, medianMs: 1800 },
      { factKey: 'mul:7x83', n: 1, medianMs: 3000 },
      { factKey: 'add:1+2', n: 1, medianMs: 500 },
    ])).toEqual([{ a: 7, b: 13, n: 2, medianMs: 1800 }]);
  });
  it('carriesBreakdown groups add/sub facts by carry count', () => {
    expect(carriesBreakdown([
      { factKey: 'add:12+34', qtype: 'z.add', n: 2, totalMs: 2000 },
      { factKey: 'add:58+67', qtype: 'z.add', n: 1, totalMs: 3000 },
      { factKey: 'add:21+43', qtype: 'z.add', n: 2, totalMs: 1000 },
      { factKey: 'sub:125-58', qtype: 'z.sub', n: 1, totalMs: 4000 },
    ])).toEqual([
      { qtype: 'z.add', carries: 0, n: 4, meanMs: 750 },
      { qtype: 'z.add', carries: 2, n: 1, meanMs: 3000 },
      { qtype: 'z.sub', carries: 2, n: 1, meanMs: 4000 },
    ]);
  });
  it('factModesFor', () => {
    expect(factModesFor('standard')).toEqual(['standard', 'drill']);
    expect(factModesFor('custom')).toEqual(['custom']);
    expect(factModesFor('drill')).toEqual(['drill']);
  });
});

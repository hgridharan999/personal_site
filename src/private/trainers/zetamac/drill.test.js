import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../core/rng.js';
import { ZETAMAC_DEFAULTS } from './generator.js';
import { DRILL_WEAK_SHARE, problemFromFact, makeDrillSource } from './drill.js';

describe('problemFromFact', () => {
  it.each([
    ['add:37+58', { qtype: 'z.add', prompt: '37 + 58', answer: 95, factKey: 'add:37+58', a: 37, b: 58 }],
    ['sub:95-37', { qtype: 'z.sub', prompt: '95 – 37', answer: 58, factKey: 'sub:95-37', a: 37, b: 58 }],
    ['mul:7x83', { qtype: 'z.mul', prompt: '7 × 83', answer: 581, factKey: 'mul:7x83', a: 7, b: 83 }],
    ['div:581/7', { qtype: 'z.div', prompt: '581 ÷ 7', answer: 83, factKey: 'div:581/7', a: 7, b: 83 }],
  ])('%s', (key, expected) => {
    expect(problemFromFact(key)).toEqual(expected);
  });
  it('returns null for invalid keys', () => {
    expect(problemFromFact('div:10/3')).toBeNull();
  });
});

describe('makeDrillSource', () => {
  const facts = [
    { factKey: 'mul:7x83', weakness: 2.5 },
    { factKey: 'mul:12x97', weakness: 0.2 },
    { factKey: 'sub:150-68', weakness: -0.4 },
  ];
  const weakPrompts = new Set(facts.map((f) => problemFromFact(f.factKey).prompt));

  it('draws ~70% weak facts, weighted toward the weakest', () => {
    const next = makeDrillSource(facts, mulberry32(11))({ ...ZETAMAC_DEFAULTS });
    const counts = new Map();
    let weak = 0;
    const N = 10000;
    for (let i = 0; i < N; i += 1) {
      const p = next();
      if (weakPrompts.has(p.prompt)) {
        weak += 1;
        counts.set(p.prompt, (counts.get(p.prompt) || 0) + 1);
      }
    }
    expect(DRILL_WEAK_SHARE).toBe(0.7);
    expect(weak / N).toBeGreaterThan(0.55);
    expect(weak / N).toBeLessThan(0.72);
    expect(counts.get('7 × 83')).toBeGreaterThan(counts.get('12 × 97'));
    expect(counts.get('12 × 97')).toBeGreaterThan(counts.get('150 – 68'));
  });

  it('never repeats a prompt back-to-back from the weak pool', () => {
    const next = makeDrillSource([{ factKey: 'mul:7x83', weakness: 1 }], mulberry32(3))({ ...ZETAMAC_DEFAULTS });
    let prev = null;
    for (let i = 0; i < 2000; i += 1) {
      const p = next();
      if (prev === '7 × 83') expect(p.prompt).not.toBe('7 × 83');
      prev = p.prompt;
    }
  });

  it('falls back to normal problems with an empty pool', () => {
    const next = makeDrillSource([], mulberry32(1))({ ...ZETAMAC_DEFAULTS });
    for (let i = 0; i < 100; i += 1) expect(next().qtype).toMatch(/^z\./);
  });
});

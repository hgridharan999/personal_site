import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../core/rng.js';
import {
  ZETAMAC_DEFAULTS, ZETAMAC_DURATIONS, isDefaultConfig, validateZetamacOptions, makeZetamacGenerator,
} from './generator.js';

const N = 20000;
const draw = (options, seed = 1, n = N) => {
  const next = makeZetamacGenerator(options, mulberry32(seed));
  return Array.from({ length: n }, () => next());
};

describe('defaults', () => {
  it('match arithmetic.zetamac.com', () => {
    expect(ZETAMAC_DEFAULTS).toEqual({
      add: true, sub: true, mul: true, div: true,
      add_left_min: 2, add_left_max: 100, add_right_min: 2, add_right_max: 100,
      mul_left_min: 2, mul_left_max: 12, mul_right_min: 2, mul_right_max: 100,
      duration: 120,
    });
    expect(ZETAMAC_DURATIONS).toEqual([30, 60, 120, 300, 600]);
    expect(Object.isFrozen(ZETAMAC_DEFAULTS)).toBe(true);
  });
  it('isDefaultConfig', () => {
    expect(isDefaultConfig({ ...ZETAMAC_DEFAULTS })).toBe(true);
    expect(isDefaultConfig({ ...ZETAMAC_DEFAULTS, duration: 60 })).toBe(false);
  });
});

describe('generator', () => {
  const problems = draw(ZETAMAC_DEFAULTS);

  it('picks each enabled operation uniformly', () => {
    const counts = {};
    for (const p of problems) counts[p.qtype] = (counts[p.qtype] || 0) + 1;
    expect(Object.keys(counts).sort()).toEqual(['z.add', 'z.div', 'z.mul', 'z.sub']);
    for (const c of Object.values(counts)) expect(c / N).toBeGreaterThan(0.23), expect(c / N).toBeLessThan(0.27);
  });

  it('addition respects both ranges', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.add')) {
      expect(p.a).toBeGreaterThanOrEqual(2); expect(p.a).toBeLessThanOrEqual(100);
      expect(p.b).toBeGreaterThanOrEqual(2); expect(p.b).toBeLessThanOrEqual(100);
      expect(p.answer).toBe(p.a + p.b);
      expect(p.prompt).toBe(`${p.a} + ${p.b}`);
      expect(p.factKey).toBe(`add:${Math.min(p.a, p.b)}+${Math.max(p.a, p.b)}`);
    }
  });

  it('subtraction is addition in reverse with an en dash', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.sub')) {
      expect(p.prompt).toBe(`${p.a + p.b} – ${p.a}`);
      expect(p.answer).toBe(p.b);
      expect(p.answer).toBeGreaterThanOrEqual(2);
      expect(p.factKey).toBe(`sub:${p.a + p.b}-${p.a}`);
    }
  });

  it('multiplication uses 2–12 × 2–100', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.mul')) {
      expect(p.a).toBeGreaterThanOrEqual(2); expect(p.a).toBeLessThanOrEqual(12);
      expect(p.b).toBeGreaterThanOrEqual(2); expect(p.b).toBeLessThanOrEqual(100);
      expect(p.prompt).toBe(`${p.a} × ${p.b}`);
      expect(p.answer).toBe(p.a * p.b);
      expect(p.factKey).toBe(`mul:${p.a}x${p.b}`);
    }
  });

  it('division is multiplication in reverse with integer answers', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.div')) {
      expect(p.prompt).toBe(`${p.a * p.b} ÷ ${p.a}`);
      expect(p.answer).toBe(p.b);
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.factKey).toBe(`div:${p.a * p.b}/${p.a}`);
    }
  });

  it('only generates enabled operations', () => {
    const onlyMul = draw({ ...ZETAMAC_DEFAULTS, add: false, sub: false, div: false }, 3, 500);
    expect(new Set(onlyMul.map((p) => p.qtype))).toEqual(new Set(['z.mul']));
  });

  it('re-rolls division when the left operand is 0', () => {
    const opts = { ...ZETAMAC_DEFAULTS, add: false, sub: false, mul: false, mul_left_min: 0, mul_left_max: 1 };
    for (const p of draw(opts, 5, 2000)) expect(p.a).toBe(1);
  });

  it('is deterministic for a seed', () => {
    expect(draw(ZETAMAC_DEFAULTS, 9, 50)).toEqual(draw(ZETAMAC_DEFAULTS, 9, 50));
  });
});

describe('validateZetamacOptions', () => {
  it('accepts defaults', () => {
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS })).toEqual([]);
  });
  it('rejects bad settings', () => {
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, add: false, sub: false, mul: false, div: false }))
      .toContain('Enable at least one operation.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, add_left_min: 50, add_left_max: 10 }))
      .toContain('Addition left range: min must be ≤ max.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, mul_right_max: 2.5 }))
      .toContain('Multiplication right max must be a whole number from 0 to 10000.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, duration: 90 }))
      .toContain('Duration must be one of 30, 60, 120, 300, 600 seconds.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, add: false, sub: false, mul: false, mul_left_min: 0, mul_left_max: 0 }))
      .toContain('Division needs a multiplication left range that includes a non-zero number.');
  });
});

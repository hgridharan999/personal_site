import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../core/rng.js';
import { decimalPlaces, isInteger, fromString, toCanonical } from '../core/rational.js';
import { PROFILE_V1 } from './profile-v1.js';
import { drawQuestion, generateOptiverTest } from './generator.js';

const N = 20000;
const rng = mulberry32(2026);
const draws = Array.from({ length: N }, () => drawQuestion(PROFILE_V1, rng));
const byType = (t) => draws.filter((q) => q.qtype === t);
const nums = (prompt) => prompt.match(/\d+(\.\d+)?(\/\d+)?/g);

describe('PROFILE_V1', () => {
  it('has version 1 and weights summing to 100', () => {
    expect(PROFILE_V1.version).toBe(1);
    expect(PROFILE_V1.templates.reduce((s, t) => s + t.weight, 0)).toBe(100);
  });

  it('draws each template at its weight (±1.5 points)', () => {
    for (const t of PROFILE_V1.templates) {
      const share = (byType(t.qtype).length / N) * 100;
      expect(Math.abs(share - t.weight)).toBeLessThan(1.5);
    }
  });

  it('integer questions respect their ranges', () => {
    for (const q of byType('o.int.add')) {
      const [a, b] = nums(q.prompt).map(Number);
      expect(a).toBeGreaterThanOrEqual(100); expect(b).toBeLessThanOrEqual(999);
      expect(q.prompt).toBe(`${a} + ${b}`);
      expect(q.answer).toEqual(fromString(String(a + b)));
    }
    for (const q of byType('o.int.sub')) {
      const [a, b] = nums(q.prompt).map(Number);
      expect(a).toBeGreaterThanOrEqual(b);
      expect(q.prompt).toBe(`${a} − ${b}`);
    }
    for (const q of byType('o.int.div')) {
      const [dividend, d] = nums(q.prompt).map(Number);
      expect(dividend % d).toBe(0);
      const quotient = dividend / d;
      expect(quotient).toBeGreaterThanOrEqual(11); expect(quotient).toBeLessThanOrEqual(99);
      expect(d).toBeGreaterThanOrEqual(3); expect(d).toBeLessThanOrEqual(25);
    }
  });

  it('decimal questions have decimal operands and terminating answers', () => {
    for (const t of ['o.dec.addsub', 'o.dec.mul', 'o.dec.div']) {
      for (const q of byType(t)) {
        const places = decimalPlaces(q.answer);
        expect(places).not.toBeNull();
        expect(places).toBeLessThanOrEqual(4);
        expect(q.prompt).toMatch(/\d\.\d/);
      }
    }
    for (const q of byType('o.dec.div')) {
      const [dividend] = nums(q.prompt);
      expect(decimalPlaces(fromString(dividend))).toBeLessThanOrEqual(2);
    }
  });

  it('fraction-of results terminate within 2 dp; fraction prompts are lowest terms', () => {
    for (const q of byType('o.frac.of')) {
      expect(q.prompt).toMatch(/^\d+\/\d+ of \d+$/);
      expect(decimalPlaces(q.answer)).toBeLessThanOrEqual(2);
    }
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    for (const t of ['o.frac.of', 'o.frac.addsub', 'o.frac.muldiv']) {
      for (const q of byType(t)) {
        for (const f of q.prompt.match(/\d+\/\d+/g)) {
          const [n, d] = f.split('/').map(Number);
          expect(n).toBeLessThan(d);
          expect(gcd(n, d)).toBe(1);
        }
      }
    }
    for (const q of byType('o.frac.addsub')) expect(q.answer.n > 0n).toBe(true);
  });

  it('answers are never negative', () => {
    for (const q of draws) expect(q.answer.n >= 0n).toBe(true);
  });
});

describe('generateOptiverTest', () => {
  it('returns 80 unique, indexed questions with canonical answer text', () => {
    const test = generateOptiverTest(PROFILE_V1, mulberry32(1));
    expect(test).toHaveLength(80);
    expect(new Set(test.map((q) => q.prompt)).size).toBe(80);
    test.forEach((q, i) => {
      expect(q.idx).toBe(i);
      expect(q.answerText).toBe(toCanonical(q.answer));
    });
  });
  it('is deterministic for a seed', () => {
    const a = generateOptiverTest(PROFILE_V1, mulberry32(5)).map((q) => q.prompt);
    const b = generateOptiverTest(PROFILE_V1, mulberry32(5)).map((q) => q.prompt);
    expect(a).toEqual(b);
  });
  it('integer answers are integers for integer templates', () => {
    for (const q of generateOptiverTest(PROFILE_V1, mulberry32(9), 400)) {
      if (q.qtype.startsWith('o.int.')) expect(isInteger(q.answer)).toBe(true);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { mulberry32, randInt, pick, weightedPick } from './rng.js';

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('randInt covers the inclusive range uniformly', () => {
    const rng = mulberry32(7);
    const counts = new Map();
    for (let i = 0; i < 20000; i += 1) {
      const v = randInt(rng, 2, 5);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([2, 3, 4, 5]);
    for (const c of counts.values()) expect(c).toBeGreaterThan(4500);
  });
  it('randInt uses Zetamac arithmetic', () => {
    expect(randInt(() => 0, 2, 100)).toBe(2);
    expect(randInt(() => 0.999999, 2, 100)).toBe(100);
  });
  it('pick and weightedPick', () => {
    expect(pick(() => 0.5, ['a', 'b', 'c'])).toBe('b');
    const items = [{ id: 'x', weight: 1 }, { id: 'y', weight: 3 }];
    expect(weightedPick(() => 0.2, items).id).toBe('x');
    expect(weightedPick(() => 0.3, items).id).toBe('y');
  });
});

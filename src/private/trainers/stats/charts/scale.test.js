import { describe, it, expect } from 'vitest';
import { extent, linearScale, niceStep, niceTicks } from './scale.js';

describe('scale', () => {
  it('extent', () => {
    expect(extent([])).toBeNull();
    expect(extent([3, -1, 7])).toEqual([-1, 7]);
  });
  it('linearScale maps and handles a zero-span domain', () => {
    const s = linearScale([0, 10], [100, 200]);
    expect(s(0)).toBe(100);
    expect(s(5)).toBe(150);
    expect(linearScale([4, 4], [0, 50])(4)).toBe(25);
  });
  it('niceStep picks 1/2/5 × 10^k', () => {
    expect(niceStep(11.75)).toBe(20);
    expect(niceStep(0.25)).toBe(0.5);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(1000)).toBe(1000);
  });
  it('niceTicks', () => {
    expect(niceTicks(0, 47)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(12, 58)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(0, 1)).toEqual([0, 0.5, 1]);
    expect(niceTicks(40, 40)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(-12, 9)).toEqual([-20, -10, 0, 10]);
  });
});

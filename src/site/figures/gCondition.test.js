import { describe, expect, it } from 'vitest';
import { N, BINS, g, f, beforeDays, afterDays, histogram, figureData } from './gCondition.js';

const grid = Array.from({ length: 101 }, (_, i) => i / 100);

describe('g-condition', () => {
  it('adds the most on the worst day and nothing on the best', () => {
    expect(g(0)).toBeCloseTo(0.53, 2);
    expect(g(1)).toBeCloseTo(0, 12);
  });
  it('is decreasing', () => {
    grid.slice(1).forEach((x, i) => expect(g(x)).toBeLessThan(g(grid[i])));
  });
  it('keeps days in order and puts every day past halfway', () => {
    grid.slice(1).forEach((x, i) => expect(f(x)).toBeGreaterThan(f(grid[i])));
    expect(Math.min(...grid.map(f))).toBeGreaterThan(0.5);
    expect(f(1)).toBeCloseTo(1, 12);
  });
});

describe('histograms', () => {
  it('count every day once', () => {
    const { before, after } = figureData();
    expect(before).toHaveLength(BINS);
    expect(before.reduce((a, b) => a + b, 0)).toBe(N);
    expect(after.reduce((a, b) => a + b, 0)).toBe(N);
  });
  it('are deterministic', () => {
    expect(histogram(beforeDays())).toEqual(histogram(beforeDays()));
    expect(histogram(afterDays())).toEqual(histogram(afterDays()));
  });
  it('centre the before days on the middle and leave nothing below halfway after', () => {
    const days = beforeDays();
    expect(days.reduce((a, b) => a + b, 0) / N).toBeCloseTo(0.5, 2);
    const { after } = figureData();
    expect(after.slice(0, BINS / 2 - 1).every((c) => c === 0)).toBe(true);
  });
});

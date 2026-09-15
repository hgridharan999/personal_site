import { describe, it, expect } from 'vitest';
import { mean, percentile, median, stdDev, rollingAverage, trendPerWeek, bestPerDay } from './stats.js';

const DAY = 86400000;
const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

describe('stats', () => {
  it('mean / median / percentile', () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3, 6])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
    expect(percentile([], 50)).toBeNull();
  });
  it('stdDev is the sample standard deviation', () => {
    expect(stdDev([4])).toBeNull();
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
  it('rollingAverage', () => {
    expect(rollingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
    expect(rollingAverage([], 10)).toEqual([]);
  });
  it('trendPerWeek needs ≥5 points over ≥3 days', () => {
    const pts = [0, 1, 2, 3, 4].map((i) => ({ t: i * DAY, y: 40 + i }));
    expect(trendPerWeek(pts)).toBeCloseTo(7, 6);
    expect(trendPerWeek(pts.slice(0, 4))).toBeNull();
    const sameDay = [0, 1, 2, 3, 4].map((i) => ({ t: i * 1000, y: i }));
    expect(trendPerWeek(sameDay)).toBeNull();
  });
  it('bestPerDay', () => {
    const pts = [
      { t: 0, y: 30 }, { t: 1000, y: 35 }, { t: DAY, y: 20 },
    ];
    expect(bestPerDay(pts, utcDay)).toEqual([
      { day: '1970-01-01', y: 35 }, { day: '1970-01-02', y: 20 },
    ]);
  });
});

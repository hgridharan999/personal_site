// scripts/poker/lib/fitnessStats.test.js
import { describe, it, expect } from 'vitest';
import { meanSd, standardize, mixStandardized, scaleOrOne, tCritical95 } from './fitnessStats.js';

describe('fitness statistics', () => {
  it('meanSd uses the sample standard deviation', () => {
    expect(meanSd([1, 2, 3, 4])).toEqual({ mean: 2.5, sd: Math.sqrt(5 / 3) });
    expect(meanSd([7])).toEqual({ mean: 7, sd: 0 });
    expect(meanSd([])).toEqual({ mean: 0, sd: 0 });
  });

  it('standardize gives mean 0 and SD 1, and zeros for a constant input', () => {
    const z = standardize([3, 9, -4, 12, 0]);
    const { mean, sd } = meanSd(z);
    expect(mean).toBeCloseTo(0, 12);
    expect(sd).toBeCloseTo(1, 12);
    expect(standardize([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('mixStandardized weights the standardized components, whatever their raw scales', () => {
    const selfPlay = [30, -10, 5, -25];
    const probes = [1, 4, -2, 0.5];
    const mixed = mixStandardized(selfPlay, probes, 0.3);
    const zs = standardize(selfPlay);
    const zp = standardize(probes);
    mixed.forEach((m, i) => expect(m).toBeCloseTo(0.7 * zs[i] + 0.3 * zp[i], 12));
    const rescaled = mixStandardized(selfPlay.map((x) => x * 100 + 7), probes.map((x) => x / 50), 0.3);
    rescaled.forEach((m, i) => expect(m).toBeCloseTo(mixed[i], 12));
    // With a weight of 0.3 on uncorrelated components the probe share of the fitness variance is 0.09 / (0.49 + 0.09).
    const a = [1, -1, 1, -1];
    const b = [1, 1, -1, -1];
    const { sd } = meanSd(mixStandardized(a, b, 0.3));
    expect(sd ** 2).toBeCloseTo(0.49 + 0.09, 12);
  });

  it('scaleOrOne falls back to 1 for a zero or non-finite scale', () => {
    expect(scaleOrOne(4)).toBe(4);
    expect(scaleOrOne(0)).toBe(1);
    expect(scaleOrOne(Number.NaN)).toBe(1);
  });

  it('tCritical95 approximates the two-sided 95% Student t quantile', () => {
    expect(tCritical95(1)).toBeCloseTo(12.706, 3);
    expect(tCritical95(5)).toBeCloseTo(2.571, 3);
    expect(tCritical95(11)).toBeCloseTo(2.201, 2);
    expect(tCritical95(30)).toBeCloseTo(2.042, 2);
    expect(tCritical95(100_000)).toBeCloseTo(1.96, 3);
    expect(tCritical95(0)).toBe(Infinity);
  });
});

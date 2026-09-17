// scripts/poker/lib/fitnessStats.js
// Statistics for training fitness: within-generation standardization, weighted mixing of standardized
// components, and the Student t quantile used for re-evaluation confidence bounds.
import { Z95 } from './ciStats.js';

/** @returns {{ mean:number, sd:number }} sample mean and sample SD (n - 1); sd is 0 below two values */
export function meanSd(xs) {
  if (xs.length === 0) return { mean: 0, sd: 0 };
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  if (xs.length < 2) return { mean, sd: 0 };
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
  return { mean, sd: Math.sqrt(variance) };
}

/** A usable divisor: the scale itself, or 1 when it is zero or not finite. */
export const scaleOrOne = (scale) => (Number.isFinite(scale) && scale > 0 ? scale : 1);

/** z-scores (mean 0, SD 1); all zeros when the values do not vary. */
export function standardize(xs) {
  const { mean, sd } = meanSd(xs);
  return xs.map((x) => (sd > 0 ? (x - mean) / sd : 0));
}

/**
 * `(1 - probeWeight) * z(selfPlay) + probeWeight * z(probes)`, element by element. Standardizing first makes the
 * weight independent of each component's raw spread, so 0.3 really is a 30% weight.
 * @param {number[]} selfPlay
 * @param {number[]} probes
 * @param {number} probeWeight
 * @returns {number[]}
 */
export function mixStandardized(selfPlay, probes, probeWeight) {
  const zs = standardize(selfPlay);
  const zp = standardize(probes);
  return zs.map((z, i) => (1 - probeWeight) * z + probeWeight * zp[i]);
}

// Exact two-sided 95% quantiles for 1-5 degrees of freedom; beyond that the Cornish-Fisher expansion is within 0.02.
const T95_SMALL = [Infinity, 12.706, 4.303, 3.182, 2.776, 2.571];

/** Two-sided 95% Student t critical value for `df` degrees of freedom (Infinity below 1). */
export function tCritical95(df) {
  if (!(df >= 1)) return Infinity;
  if (df < T95_SMALL.length) return T95_SMALL[Math.floor(df)];
  const z = Z95;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}

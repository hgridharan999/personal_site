// scripts/poker/lib/ciStats.js
// Streaming mean and 95% confidence interval over per-deal samples, mergeable across worker jobs.

export const Z95 = 1.96;

/** @typedef {{ n:number, sum:number, sumSq:number }} Acc */

/** @returns {Acc} */
export const emptyAcc = () => ({ n: 0, sum: 0, sumSq: 0 });

/** @returns {Acc} a new accumulator including x */
export const addSample = (acc, x) => ({ n: acc.n + 1, sum: acc.sum + x, sumSq: acc.sumSq + x * x });

/** @returns {Acc} */
export const mergeAcc = (a, b) => ({ n: a.n + b.n, sum: a.sum + b.sum, sumSq: a.sumSq + b.sumSq });

/**
 * @param {Acc} acc
 * @param {number} [scale] multiplies every sample (e.g. units per deal -> BB per 100 hands)
 * @returns {{ n:number, mean:number, sd:number, lower:number, upper:number }} sd of one sample; bounds of the 95% CI of the mean
 */
export function summarize(acc, scale = 1) {
  if (acc.n === 0) return { n: 0, mean: 0, sd: 0, lower: -Infinity, upper: Infinity };
  const mean = acc.sum / acc.n;
  const variance = acc.n > 1 ? Math.max(0, (acc.sumSq - acc.n * mean * mean) / (acc.n - 1)) : Infinity;
  const half = (Z95 * Math.sqrt(variance)) / Math.sqrt(acc.n);
  const s = Math.abs(scale);
  const lo = (mean - half) * scale;
  const hi = (mean + half) * scale;
  return { n: acc.n, mean: mean * scale, sd: Math.sqrt(variance) * s, lower: Math.min(lo, hi), upper: Math.max(lo, hi) };
}

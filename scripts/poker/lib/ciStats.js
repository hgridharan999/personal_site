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
 * The interval is a Wald-style 95% CI of the mean (`mean ± z·sd/√n`) using the fixed critical value
 * `z = Z95 = 1.96`, which is only a good approximation once `n` is reasonably large. Below that, the normal
 * approximation is unreliable and a tiny, noisy sample must never be able to produce a narrow, confident-looking
 * interval, so for `n < 30` this returns `lower: -Infinity, upper: Infinity` (an interval that can never clear a
 * "bound is above 0" gate) while still reporting the real `mean`/`sd` computed from whatever samples exist.
 * @param {Acc} acc
 * @param {number} [scale] multiplies every sample (e.g. units per deal -> BB per 100 hands)
 * @returns {{ n:number, mean:number, sd:number, lower:number, upper:number }} sd of one sample; bounds of the 95% CI of the mean
 */
export function summarize(acc, scale = 1) {
  if (acc.n === 0) return { n: 0, mean: 0, sd: 0, lower: -Infinity, upper: Infinity };
  const mean = acc.sum / acc.n;
  const variance = acc.n > 1 ? Math.max(0, (acc.sumSq - acc.n * mean * mean) / (acc.n - 1)) : Infinity;
  const s = Math.abs(scale);
  const sd = Math.sqrt(variance) * s;
  const scaledMean = mean * scale;
  if (acc.n < 30) return { n: acc.n, mean: scaledMean, sd, lower: -Infinity, upper: Infinity };
  const half = (Z95 * Math.sqrt(variance)) / Math.sqrt(acc.n);
  const lo = (mean - half) * scale;
  const hi = (mean + half) * scale;
  return { n: acc.n, mean: scaledMean, sd, lower: Math.min(lo, hi), upper: Math.max(lo, hi) };
}

/**
 * Scale factor from units won per deal (1 unit = 0.5 BB) to BB per 100 hands, given how many hands one deal
 * produces (e.g. one hand per seat, `players.length`). Pass to {@link summarize} as its `scale` argument.
 * @param {number} handsPerDeal
 * @returns {number}
 */
export const bbPer100Scale = (handsPerDeal) => 100 / (2 * handsPerDeal);

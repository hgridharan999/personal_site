/**
 * The math behind the g-condition figure. Day quality x runs from 0 (worst day possible) to 1
 * (best day possible). Everything here is deterministic: the days are quantiles, not random draws.
 */
export const N = 4000;
export const BINS = 24;
export const MEAN = 0.5;
export const SD = 0.16;
export const A = 1.4;
export const B = 1.2;

/** The gratitude added to a day of quality x. Largest on the worst day, zero on the best. */
export function g(x) {
  return A * (1 / (x + B) - 1 / (1 + B));
}

/** Where a day lands once its gratitude is added. Strictly increasing because A < B squared. */
export function f(x) {
  return x + g(x);
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26 for erf, good to about 1e-7). */
function phi(z) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z < 0 ? -erf : erf));
}

function inversePhi(p) {
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (phi(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** N days before the g-condition: a normal curve cut off at 0 and 1, as evenly spaced quantiles. */
export function beforeDays(n = N) {
  const pLo = phi((0 - MEAN) / SD);
  const pHi = phi((1 - MEAN) / SD);
  const days = [];
  for (let i = 0; i < n; i += 1) {
    const p = pLo + ((i + 0.5) / n) * (pHi - pLo);
    days.push(Math.min(1, Math.max(0, MEAN + SD * inversePhi(p))));
  }
  return days;
}

export function afterDays(n = N) {
  return beforeDays(n).map(f);
}

/** Counts per equal-width bin across [0, 1]. A value of exactly 1 goes in the last bin. */
export function histogram(values, bins = BINS) {
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(v * bins))] += 1;
  return counts;
}

export function figureData() {
  const before = histogram(beforeDays());
  const after = histogram(afterDays());
  return { before, after, max: Math.max(...before, ...after) };
}

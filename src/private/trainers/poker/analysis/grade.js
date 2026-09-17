// Grade bands (spec §7.1), rounding for stored values, and deterministic seeds for rollouts.

export const GRADES = Object.freeze(['good', 'inaccuracy', 'mistake', 'blunder']);
export const GOOD_BELOW = 0.03;
export const INACCURACY_BELOW = 0.1;
export const MISTAKE_UP_TO = 0.25;

/**
 * Grade from EV loss as a share of the pot before the decision (both in units):
 * good < 3%, inaccuracy 3–10%, mistake 10–25% (inclusive), blunder > 25%.
 * @returns {'good'|'inaccuracy'|'mistake'|'blunder'}
 */
export function gradeFor(evLoss, pot) {
  if (!(evLoss > 0)) return 'good';
  const share = pot > 0 ? evLoss / pot : Infinity;
  if (share < GOOD_BELOW) return 'good';
  if (share < INACCURACY_BELOW) return 'inaccuracy';
  if (share <= MISTAKE_UP_TO) return 'mistake';
  return 'blunder';
}

/** EVs are stored as fractional units with 2 decimals. Adding 0 turns -0 into 0. */
export const roundEv = (x) => Math.round(x * 100) / 100 + 0;

/** Equities are stored with 4 decimals. */
export const roundProb = (x) => Math.round(x * 10000) / 10000 + 0;

/** FNV-1a 32-bit hash. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed for decision `idx` of a hand (idx -1 seeds the hand's all-in EV). */
export const seedFor = (handId, idx) => hashString(`${handId}:${idx}`);

/** Seed for sample `n` of a base seed (murmur3 finalizer), independent of evaluation order. */
export function mixSeed(seed, n) {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

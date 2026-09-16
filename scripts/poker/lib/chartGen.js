// Builds our own 6-max preflop charts from the class-vs-class equity table.
// Hands are ordered by a blend of equity against any hand and against a strong range, plus a
// playability term for what all-in equity misses. Each chart is then a set of bands over that order
// (continue, value raise, suited bluff raise) whose widths are our own approximations of common
// 100 BB 6-max play. No third-party chart data is used.
import { CLASS_COUNT, combosIn, kindOf } from '../../../src/private/trainers/poker/bots/handClass.js';

const MAX_FADE = 0.02; // band edges mix linearly over up to 2% of combos
const TOP_SHARE = 0.25; // "strong range" used for the second ordering term
const W_ANY = 0.4;

// Playability terms (in equity points). Rank indices: 0 = 2 ... 8 = T ... 12 = A.
const PAIR_SET_VALUE = 0.065; // set-mining value, full for 22 and fading to 0 for AA
const SUITED = 0.025; // flushes and backdoor equity
const SUITED_LINK = [0.065, 0.038, 0.016]; // straight potential by gap (connector, one-gapper, two-gapper)
const LINK_HIGH = 0.003; // extra per rank of the lower card up to a 9: higher straights win more often
const KING_LINK_SHARE = 0.75; // K-high suited broadways already score well on high-card equity
const OFFSUIT_LINK = [0.03, 0.016, 0.005];
const OFFSUIT_KING_LINK_SHARE = 0.25; // K-high offsuit broadways already score well on high-card equity
const OFFSUIT_NINE = 0.01; // offsuit hands with both cards 9 or higher make top pairs with decent kickers
const WHEEL_ACE = 0.02; // A5s-A2s make wheels and block strong aces
const SUITED_GAPPED_LOW = 0.012; // Q/J/T-high suited with a 6 or lower and no straight potential
const SUITED_KING = 0.022; // K8s-K2s make the second-nut flush
const BROADWAY = 0.01; // both cards T or higher
// Offsuit A-x and K-x with a 9 kicker / a lower kicker: dominated, and rarely make a strong second hand.
// K-x also gets the offsuit nine term and a share of the link term, so its penalty stays small.
const DOMINATED = { 12: [0.012, 0.028], 11: [0.008, 0.024] };
const DOMINANCE_STEP = 1e-6; // score margin that keeps a dominating offsuit hand strictly ahead

/** Postflop playability that all-in equity misses (equity points added to the ordering score). */
export function playability(cls) {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  if (row === col) return (PAIR_SET_VALUE * (12 - row)) / 12;
  const hi = Math.max(row, col);
  const lo = Math.min(row, col);
  const gap = hi - lo - 1;
  let bonus = lo >= 8 ? BROADWAY : 0;
  if (row > col) {
    bonus += SUITED;
    if (gap < SUITED_LINK.length && hi < 12) bonus += (SUITED_LINK[gap] + LINK_HIGH * Math.min(lo, 7)) * (hi === 11 ? KING_LINK_SHARE : 1);
    if (hi <= 10 && gap >= 3 && lo <= 4) bonus -= SUITED_GAPPED_LOW;
    if (hi === 12 && lo <= 3) bonus += WHEEL_ACE;
    if (hi === 11 && lo <= 6) bonus += SUITED_KING;
  } else {
    if (hi < 12) bonus += (OFFSUIT_LINK[gap] ?? 0) * (hi === 11 ? OFFSUIT_KING_LINK_SHARE : 1);
    if (lo >= 7 && hi < 12) bonus += OFFSUIT_NINE;
    if (hi >= 11 && lo <= 7) bonus -= DOMINATED[hi][lo === 7 ? 0 : 1];
  }
  return bonus;
}

// Re-raise preference facing aggression: medium pairs prefer to flat (set value, poor when called),
// while AK and AQ prefer to raise (blockers, dominate calling ranges, happy to get it in).
const PAIR_RAISE_BIAS = { 10: -0.02, 9: -0.13, 8: -0.15 }; // QQ, JJ, TT; lower pairs use PAIR_RAISE_LOW
const PAIR_RAISE_LOW = -0.17;
const AK_RAISE_BIAS = 0.045;
const AQ_RAISE_BIAS = 0.015;

/**
 * Offsuit hands with a T or higher top card score at least as high as the hand one rank lower with the
 * same kicker (A-x >= K-x >= Q-x >= J-x >= T-x), even where the lower hand's straight potential scores more.
 */
function enforceOffsuitDominance(score) {
  for (let kicker = 0; kicker < 12; kicker += 1) {
    for (let hi = Math.max(8, kicker + 1) + 1; hi <= 12; hi += 1) {
      const cls = kicker * 13 + hi; // offsuit: row = low rank, col = high rank
      score[cls] = Math.max(score[cls], score[cls - 1] + DOMINANCE_STEP);
    }
  }
}

/** Added to the ordering score to get the raise order used for re-raises facing aggression. */
export function raiseBias(cls) {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  if (row === col) return row >= 11 ? 0 : (PAIR_RAISE_BIAS[row] ?? PAIR_RAISE_LOW);
  const hi = Math.max(row, col);
  const lo = Math.min(row, col);
  if (hi === 12 && lo === 11) return AK_RAISE_BIAS;
  if (hi === 12 && lo === 10) return AQ_RAISE_BIAS;
  return 0;
}

const equityVs = (table, a, weights) => {
  let num = 0;
  let den = 0;
  for (let b = 0; b < CLASS_COUNT; b += 1) {
    const w = weights[b] * combosIn(b);
    num += w * table[a * CLASS_COUNT + b];
    den += w;
  }
  return num / den;
};

/** Cumulative combo share at the middle of each class, walking `order` strongest first. */
function centers(order) {
  const pct = new Float64Array(CLASS_COUNT);
  let before = 0;
  for (const cls of order) {
    pct[cls] = (before + combosIn(cls) / 2) / 1326;
    before += combosIn(cls);
  }
  return pct;
}

const sortedBy = (score) => [...Array(CLASS_COUNT).keys()].sort((a, b) => score[b] - score[a] || a - b);

/**
 * @returns {{ order:number[], raiserOrder:number[], rankPct:Float64Array, raisePct:Float64Array, raiserPct:Float64Array }}
 *   strongest class first; raisePct is the combo-share position in the re-raise order (score plus raiseBias).
 *   The raiser order adds only the positive part of raiseBias (AK and AQ like to get it in) and leaves out the
 *   pairs' flat preference: it ranks what a player continues with facing a 4-bet, and a raiser's range.
 */
export function strengthOrder(table) {
  const any = Float64Array.from({ length: CLASS_COUNT }, (_, a) => equityVs(table, a, new Float64Array(CLASS_COUNT).fill(1)));
  const pctAny = centers(sortedBy(any));
  const top = Float64Array.from({ length: CLASS_COUNT }, (_, cls) => (pctAny[cls] < TOP_SHARE ? 1 : 0));
  const score = Float64Array.from({ length: CLASS_COUNT }, (_, a) => W_ANY * any[a] + (1 - W_ANY) * equityVs(table, a, top) + playability(a));
  enforceOffsuitDominance(score);
  const order = sortedBy(score);
  const raiseScore = score.map((s, cls) => s + raiseBias(cls));
  const raiserOrder = sortedBy(score.map((s, cls) => s + Math.max(0, raiseBias(cls))));
  return { order, raiserOrder, rankPct: centers(order), raisePct: centers(sortedBy(raiseScore)), raiserPct: centers(raiserOrder) };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const fadeFor = (edge) => Math.min(MAX_FADE, edge * 0.3);
const below = (p, hi, fade = fadeFor(hi)) => clamp01((hi + fade / 2 - p) / fade);
const quantize = (x) => Math.round(x * 10);
const DIGITS = '0123456789X';

/**
 * @param {{ value:number, call?:number, continueBy?:'raiser', valueFade?:number, bluff?:{ from:number, to:number, freq:number } }} spec
 *   Raise-or-fold charts (no `call`): the top `value` share by strength raises.
 *   Charts with `call`: the top `value + call` share by strength continues (by the raiser order when
 *   continueBy is 'raiser'), and within it the top `value` share by the re-raise order raises while the
 *   rest calls; valueFade widens the mixed band at the raise edge. bluff: suited hands in [from, to] (strength combo share) raise with probability freq.
 * @param {Float64Array} rankPct strength-order position of each class
 * @param {Float64Array} [raisePct] re-raise-order position of each class (defaults to rankPct)
 * @param {Float64Array} [raiserPct] raiser-order position of each class (defaults to rankPct)
 * @returns {{ raise:string, call:string }} one digit per class (0-9, X = 10 tenths)
 */
export function buildChart(spec, rankPct, raisePct = rankPct, raiserPct = rankPct) {
  let raise = '';
  let call = '';
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
    const p = rankPct[cls];
    let r;
    let cont;
    if (spec.call) {
      cont = below(spec.continueBy === 'raiser' ? raiserPct[cls] : p, spec.value + spec.call);
      r = Math.min(cont, below(raisePct[cls], spec.value, spec.valueFade));
    } else {
      r = below(p, spec.value);
      cont = r;
    }
    if (spec.bluff && kindOf(cls) === 'suited' && p >= spec.bluff.from && p <= spec.bluff.to && cont < 0.05) {
      r = Math.max(r, spec.bluff.freq);
      cont = Math.max(cont, r);
    }
    const rq = quantize(r);
    raise += DIGITS[rq];
    call += DIGITS[Math.max(0, Math.min(quantize(cont) - rq, 10 - rq))];
  }
  return { raise, call };
}

const bluffAfter = (value, call, freq = 0.35, width = 0.08) => ({ from: value + call, to: value + call + width, freq });

/** Chart widths as combo shares. Keys: situation.position[.detail]. */
export const CHART_SPECS = {
  'open.UTG': { value: 0.168 },
  'open.HJ': { value: 0.19 },
  'open.CO': { value: 0.26 },
  'open.BTN': { value: 0.43 },
  'open.SB': { value: 0.36 },

  'vsOpen.HJ.UTG': { value: 0.03, call: 0.06, bluff: bluffAfter(0.03, 0.06) },
  'vsOpen.CO.UTG': { value: 0.035, call: 0.07, bluff: bluffAfter(0.035, 0.07) },
  'vsOpen.CO.HJ': { value: 0.04, call: 0.08, bluff: bluffAfter(0.04, 0.08) },
  'vsOpen.BTN.UTG': { value: 0.035, call: 0.09, bluff: bluffAfter(0.035, 0.09) },
  'vsOpen.BTN.HJ': { value: 0.04, call: 0.1, bluff: bluffAfter(0.04, 0.1) },
  'vsOpen.BTN.CO': { value: 0.055, call: 0.12, bluff: bluffAfter(0.055, 0.12) },
  'vsOpen.SB.UTG': { value: 0.035, call: 0.03, bluff: bluffAfter(0.035, 0.03) },
  'vsOpen.SB.HJ': { value: 0.04, call: 0.035, bluff: bluffAfter(0.04, 0.035) },
  'vsOpen.SB.CO': { value: 0.05, call: 0.04, bluff: bluffAfter(0.05, 0.04) },
  'vsOpen.SB.BTN': { value: 0.07, call: 0.05, bluff: bluffAfter(0.07, 0.05) },
  'vsOpen.BB.UTG': { value: 0.04, call: 0.35, bluff: bluffAfter(0.04, 0.35, 0.25) },
  'vsOpen.BB.HJ': { value: 0.045, call: 0.4, bluff: bluffAfter(0.045, 0.4, 0.25) },
  'vsOpen.BB.CO': { value: 0.055, call: 0.44, bluff: bluffAfter(0.055, 0.44, 0.25) },
  'vsOpen.BB.BTN': { value: 0.075, call: 0.52, bluff: bluffAfter(0.075, 0.52, 0.25) },
  'vsOpen.BB.SB': { value: 0.09, call: 0.53, bluff: bluffAfter(0.09, 0.53, 0.25) },

  'squeeze.CO': { value: 0.03, call: 0.03, bluff: bluffAfter(0.03, 0.03, 0.2) },
  'squeeze.BTN': { value: 0.035, call: 0.05, bluff: bluffAfter(0.035, 0.05, 0.2) },
  'squeeze.SB': { value: 0.04, call: 0.02, bluff: bluffAfter(0.04, 0.02, 0.2) },
  'squeeze.BB': { value: 0.04, call: 0.15, bluff: bluffAfter(0.04, 0.15, 0.2) },

  'vs3bet.UTG.ip': { value: 0.025, call: 0.045, bluff: bluffAfter(0.025, 0.045, 0.2, 0.04) },
  'vs3bet.UTG.oop': { value: 0.025, call: 0.035, bluff: bluffAfter(0.025, 0.035, 0.2, 0.04) },
  'vs3bet.HJ.ip': { value: 0.025, call: 0.05, bluff: bluffAfter(0.025, 0.05, 0.2, 0.04) },
  'vs3bet.HJ.oop': { value: 0.025, call: 0.04, bluff: bluffAfter(0.025, 0.04, 0.2, 0.04) },
  'vs3bet.CO.ip': { value: 0.03, call: 0.06, bluff: bluffAfter(0.03, 0.06, 0.2, 0.05) },
  'vs3bet.CO.oop': { value: 0.03, call: 0.045, bluff: bluffAfter(0.03, 0.045, 0.2, 0.05) },
  'vs3bet.BTN.ip': { value: 0.035, call: 0.08, bluff: bluffAfter(0.035, 0.08, 0.2, 0.06) },
  'vs3bet.SB.oop': { value: 0.035, call: 0.06, bluff: bluffAfter(0.035, 0.06, 0.2, 0.05) },

  'vs4bet.ip': { value: 0.0135, call: 0.0185, continueBy: 'raiser', valueFade: 0.01 },
  'vs4bet.oop': { value: 0.0135, call: 0.0165, continueBy: 'raiser', valueFade: 0.01 },

  'vsLimp.HJ': { value: 0.1, call: 0.02 },
  'vsLimp.CO': { value: 0.14, call: 0.03 },
  'vsLimp.BTN': { value: 0.2, call: 0.05 },
  'vsLimp.SB': { value: 0.16, call: 0.1 },
  'vsLimp.BB': { value: 0.12 },
};

/** @returns {{ version:string, order:number[], raiserOrder:number[], charts:Record<string,{raise:string, call:string}> }} */
export function buildCharts(table) {
  const { order, raiserOrder, rankPct, raisePct, raiserPct } = strengthOrder(table);
  const charts = {};
  for (const [key, spec] of Object.entries(CHART_SPECS)) charts[key] = buildChart(spec, rankPct, raisePct, raiserPct);
  return { version: 'charts-v1', order, raiserOrder, charts };
}

// Builds our own 6-max preflop charts from the class-vs-class equity table.
// Hands are ordered by a blend of equity against any hand and against a strong range; each chart
// is then a set of bands over that order (value raise, flat call, suited bluff raise) whose widths
// are our own approximations of common 100 BB 6-max play. No third-party chart data is used.
import { CLASS_COUNT, combosIn, kindOf } from '../../../src/private/trainers/poker/bots/handClass.js';

const MAX_FADE = 0.02; // band edges mix linearly over up to 2% of combos
const TOP_SHARE = 0.25; // "strong range" used for the second ordering term
const W_ANY = 0.4;

// Postflop playability that all-in equity misses: suited, connected and broadway hands realize more equity.
export function playability(cls) {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  if (row === col) return 0;
  const hi = Math.max(row, col);
  const lo = Math.min(row, col);
  const gap = hi - lo - 1;
  let bonus = row > col ? 0.02 : 0;
  bonus += [0.012, 0.007, 0.003][gap] ?? 0;
  if (lo >= 8) bonus += 0.01;
  return bonus;
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

/** @returns {{ order:number[], rankPct:Float64Array }} strongest class first */
export function strengthOrder(table) {
  const any = Float64Array.from({ length: CLASS_COUNT }, (_, a) => equityVs(table, a, new Float64Array(CLASS_COUNT).fill(1)));
  const byAny = [...Array(CLASS_COUNT).keys()].sort((a, b) => any[b] - any[a]);
  const pctAny = centers(byAny);
  const top = Float64Array.from({ length: CLASS_COUNT }, (_, cls) => (pctAny[cls] < TOP_SHARE ? 1 : 0));
  const score = Float64Array.from({ length: CLASS_COUNT }, (_, a) => W_ANY * any[a] + (1 - W_ANY) * equityVs(table, a, top) + playability(a));
  const order = [...Array(CLASS_COUNT).keys()].sort((a, b) => score[b] - score[a] || a - b);
  return { order, rankPct: centers(order) };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const fadeFor = (edge) => Math.min(MAX_FADE, edge * 0.3);
const below = (p, hi) => clamp01((hi + fadeFor(hi) / 2 - p) / fadeFor(hi));
const above = (p, lo) => (lo <= 0 ? 1 : clamp01((p - (lo - fadeFor(lo) / 2)) / fadeFor(lo)));
const quantize = (x) => Math.round(x * 10);
const DIGITS = '0123456789X';

/**
 * @param {{ value:number, call?:number, bluff?:{ from:number, to:number, freq:number } }} spec
 *   value: top share of combos that raises; call: the next share that calls; bluff: suited hands in
 *   [from, to] (combo share) raise with probability freq.
 * @returns {{ raise:string, call:string }} one digit per class (0-9, X = 10 tenths)
 */
export function buildChart(spec, rankPct) {
  let raise = '';
  let call = '';
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
    const p = rankPct[cls];
    let r = below(p, spec.value);
    if (spec.bluff && kindOf(cls) === 'suited' && p >= spec.bluff.from && p <= spec.bluff.to) r = Math.max(r, spec.bluff.freq);
    const c = spec.call ? Math.min(1 - r, Math.min(above(p, spec.value), below(p, spec.value + spec.call))) : 0;
    const rq = quantize(r);
    raise += DIGITS[rq];
    call += DIGITS[Math.min(quantize(c), 10 - rq)];
  }
  return { raise, call };
}

const bluffAfter = (value, call, freq = 0.35, width = 0.08) => ({ from: value + call, to: value + call + width, freq });

/** Chart widths as combo shares. Keys: situation.position[.detail]. */
export const CHART_SPECS = {
  'open.UTG': { value: 0.15 },
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
  'vsOpen.BB.UTG': { value: 0.035, call: 0.22, bluff: bluffAfter(0.035, 0.22, 0.25) },
  'vsOpen.BB.HJ': { value: 0.04, call: 0.25, bluff: bluffAfter(0.04, 0.25, 0.25) },
  'vsOpen.BB.CO': { value: 0.05, call: 0.3, bluff: bluffAfter(0.05, 0.3, 0.25) },
  'vsOpen.BB.BTN': { value: 0.07, call: 0.36, bluff: bluffAfter(0.07, 0.36, 0.25) },
  'vsOpen.BB.SB': { value: 0.09, call: 0.4, bluff: bluffAfter(0.09, 0.4, 0.25) },

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

  'vs4bet.ip': { value: 0.015, call: 0.02 },
  'vs4bet.oop': { value: 0.015, call: 0.012 },

  'vsLimp.HJ': { value: 0.1, call: 0.02 },
  'vsLimp.CO': { value: 0.14, call: 0.03 },
  'vsLimp.BTN': { value: 0.2, call: 0.05 },
  'vsLimp.SB': { value: 0.16, call: 0.1 },
  'vsLimp.BB': { value: 0.12 },
};

/** @returns {{ version:string, order:number[], charts:Record<string,{raise:string, call:string}> }} */
export function buildCharts(table) {
  const { order, rankPct } = strengthOrder(table);
  const charts = {};
  for (const [key, spec] of Object.entries(CHART_SPECS)) charts[key] = buildChart(spec, rankPct);
  return { version: 'charts-v1', order, charts };
}

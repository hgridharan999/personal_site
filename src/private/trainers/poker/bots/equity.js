// Monte Carlo equity of one hand against the weighted ranges of live opponents.
// Deterministic for a given rng when `budgetMs` is Infinity (tests pass `iterations`).
import { evaluate } from '../engine/evaluator.js';
import { COMBO_COUNT, COMBO_CARDS } from './handClass.js';

const MIN_ITERATIONS = 32; // the clock is first read here, then every CLOCK_EVERY iterations
const CLOCK_EVERY = 64;
const DEAL_ATTEMPTS = 64; // whole-set rejection attempts before the per-opponent fallback
const defaultNow = () => performance.now();

// Keeps the combos of one range that do not touch dead cards, with a cumulative weight table.
// NaN and negative weights count as 0.
function prepareRange(weights, dead) {
  const combos = new Int16Array(COMBO_COUNT);
  const cumulative = new Float64Array(COMBO_COUNT);
  const comboWeights = new Float64Array(COMBO_COUNT);
  let count = 0;
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    const w = weights ? weights[i] : 1;
    if (!(w > 0) || dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    total += w;
    combos[count] = i;
    comboWeights[count] = w;
    cumulative[count] = total;
    count += 1;
  }
  if (count === 0 && weights) return prepareRange(null, dead); // empty range: fall back to any live combo
  return { combos, cumulative, weights: comboWeights, count, total };
}

function pickCombo(range, rng) {
  const target = rng() * range.total;
  let lo = 0;
  let hi = range.count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (range.cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  return range.combos[lo];
}

const comboIsLive = (combo, used) => !used[COMBO_CARDS[2 * combo]] && !used[COMBO_CARDS[2 * combo + 1]];

// Weighted pick among the range's combos that avoid `used`, or -1 when none is live.
function pickLiveCombo(range, used, rng) {
  let total = 0;
  for (let k = 0; k < range.count; k += 1) if (comboIsLive(range.combos[k], used)) total += range.weights[k];
  if (!(total > 0)) return -1;
  let target = rng() * total;
  let last = -1;
  for (let k = 0; k < range.count; k += 1) {
    const combo = range.combos[k];
    if (!comboIsLive(combo, used)) continue;
    target -= range.weights[k];
    last = combo;
    if (target < 0) break;
  }
  return last;
}

function randomLiveCard(used, rng) {
  for (;;) {
    const card = Math.floor(rng() * 52);
    if (!used[card]) return card;
  }
}

function seatCards(oppCards, used, o, a, b) {
  used[a] = 1;
  used[b] = 1;
  oppCards[o][0] = a;
  oppCards[o][1] = b;
}

// Deals every opponent a combo from its range, conditioned on no shared cards.
// Whole-set rejection keeps the joint distribution exact; only after DEAL_ATTEMPTS failures does
// it deal opponents one by one from their live in-range combos, and only then from random cards.
function dealOpponents(prepared, dead, used, oppCards, rng) {
  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt += 1) {
    used.set(dead);
    let o = 0;
    for (; o < prepared.length; o += 1) {
      const combo = pickCombo(prepared[o], rng);
      if (!comboIsLive(combo, used)) break;
      seatCards(oppCards, used, o, COMBO_CARDS[2 * combo], COMBO_CARDS[2 * combo + 1]);
    }
    if (o === prepared.length) return;
  }
  used.set(dead);
  for (let o = 0; o < prepared.length; o += 1) {
    const combo = pickLiveCombo(prepared[o], used, rng);
    if (combo >= 0) {
      seatCards(oppCards, used, o, COMBO_CARDS[2 * combo], COMBO_CARDS[2 * combo + 1]);
    } else {
      const a = randomLiveCard(used, rng);
      used[a] = 1;
      seatCards(oppCards, used, o, a, randomLiveCard(used, rng));
    }
  }
}

/**
 * @param {{ hole:number[], board:number[], ranges:Float32Array[], rng:() => number,
 *   iterations?:number, budgetMs?:number, now?:() => number }} input
 *   ranges: one 1,326-entry combo weight array per live opponent (NaN or negative weights count as 0).
 *   With a finite budget at least MIN_ITERATIONS (32) iterations run before the clock is read.
 * @returns {{ equity:number, iterations:number, stderr:number }} equity = expected share of the pot (ties split).
 *   No opponents gives equity 1; zero iterations gives { equity: 0.5, iterations: 0, stderr: 1 }.
 */
export function equityVsRanges({ hole, board, ranges, rng, iterations = 1000, budgetMs = Infinity, now = defaultNow }) {
  if (ranges.length === 0) return { equity: 1, iterations: 0, stderr: 0 };
  const dead = new Uint8Array(52);
  for (const c of hole) dead[c] = 1;
  for (const c of board) dead[c] = 1;
  const prepared = ranges.map((r) => prepareRange(r, dead));
  const used = new Uint8Array(52);
  const need = 5 - board.length;
  const heroCards = [hole[0], hole[1], ...board, 0, 0, 0, 0, 0].slice(0, 7);
  const oppCards = prepared.map(() => [0, 0, ...board, 0, 0, 0, 0, 0].slice(0, 7));
  const timed = budgetMs !== Infinity;
  const started = timed ? now() : 0;
  let share = 0;
  let sumSq = 0;
  let n = 0;

  while (n < iterations) {
    if (timed && n >= MIN_ITERATIONS && (n - MIN_ITERATIONS) % CLOCK_EVERY === 0 && now() - started >= budgetMs) break;
    dealOpponents(prepared, dead, used, oppCards, rng);
    for (let k = 2 + board.length; k < 7; k += 1) {
      const card = randomLiveCard(used, rng);
      used[card] = 1;
      heroCards[k] = card;
      for (let o = 0; o < prepared.length; o += 1) oppCards[o][k] = card;
    }
    const heroScore = evaluate(heroCards);
    let ties = 0;
    let lost = false;
    for (let o = 0; o < prepared.length; o += 1) {
      const score = evaluate(oppCards[o]);
      if (score > heroScore) {
        lost = true;
        break;
      }
      if (score === heroScore) ties += 1;
    }
    const x = lost ? 0 : 1 / (ties + 1);
    share += x;
    sumSq += x * x;
    n += 1;
  }
  if (n === 0) return { equity: 0.5, iterations: 0, stderr: 1 };
  const equity = share / n;
  const variance = Math.max(0, sumSq / n - equity * equity);
  return { equity, iterations: n, stderr: Math.sqrt(variance / n) };
}

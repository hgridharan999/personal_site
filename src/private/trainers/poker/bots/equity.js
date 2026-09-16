// Monte Carlo equity of one hand against the weighted ranges of live opponents.
// Deterministic for a given rng when `budgetMs` is Infinity (tests pass `iterations`).
import { evaluate } from '../engine/evaluator.js';
import { COMBO_COUNT, COMBO_CARDS } from './handClass.js';

const MIN_ITERATIONS = 32;
const CLOCK_EVERY = 64;
const PICK_TRIES = 24;
const defaultNow = () => performance.now();

// Keeps the combos of one range that do not touch dead cards, with a cumulative weight table.
function prepareRange(weights, dead) {
  const combos = new Int16Array(COMBO_COUNT);
  const cumulative = new Float64Array(COMBO_COUNT);
  let count = 0;
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    const w = weights ? weights[i] : 1;
    if (w <= 0 || dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    total += w;
    combos[count] = i;
    cumulative[count] = total;
    count += 1;
  }
  if (count === 0 && weights) return prepareRange(null, dead); // empty range: fall back to any live combo
  return { combos, cumulative, count, total };
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

function randomLiveCard(used, rng) {
  for (;;) {
    const card = Math.floor(rng() * 52);
    if (!used[card]) return card;
  }
}

/**
 * @param {{ hole:number[], board:number[], ranges:Float32Array[], rng:() => number,
 *   iterations?:number, budgetMs?:number, now?:() => number }} input
 *   ranges: one 1,326-entry combo weight array per live opponent.
 * @returns {{ equity:number, iterations:number, stderr:number }} equity = expected share of the pot (ties split)
 */
export function equityVsRanges({ hole, board, ranges, rng, iterations = 1000, budgetMs = Infinity, now = defaultNow }) {
  if (ranges.length === 0) return { equity: 1, iterations: 0, stderr: 0 };
  const dead = new Uint8Array(52);
  for (const c of hole) dead[c] = 1;
  for (const c of board) dead[c] = 1;
  const prepared = ranges.map((r) => prepareRange(r, dead));
  const used = new Uint8Array(52);
  const touched = new Int8Array(2 * ranges.length + 5);
  const need = 5 - board.length;
  const heroCards = [hole[0], hole[1], ...board, 0, 0, 0, 0, 0].slice(0, 7);
  const oppCards = prepared.map(() => [0, 0, ...board, 0, 0, 0, 0, 0].slice(0, 7));
  const runout = new Int8Array(5);
  const started = budgetMs === Infinity ? 0 : now();
  let share = 0;
  let sumSq = 0;
  let n = 0;

  while (n < iterations) {
    if (budgetMs !== Infinity && n >= MIN_ITERATIONS && n % CLOCK_EVERY === 0 && now() - started >= budgetMs) break;
    used.set(dead);
    let t = 0;
    for (let o = 0; o < prepared.length; o += 1) {
      let a = -1;
      let b = -1;
      for (let tries = 0; tries < PICK_TRIES; tries += 1) {
        const combo = pickCombo(prepared[o], rng);
        const x = COMBO_CARDS[2 * combo];
        const y = COMBO_CARDS[2 * combo + 1];
        if (!used[x] && !used[y]) {
          a = x;
          b = y;
          break;
        }
      }
      if (a < 0) {
        a = randomLiveCard(used, rng);
        used[a] = 1;
        b = randomLiveCard(used, rng);
        used[a] = 0;
      }
      used[a] = 1;
      used[b] = 1;
      touched[t++] = a;
      touched[t++] = b;
      oppCards[o][0] = a;
      oppCards[o][1] = b;
    }
    for (let k = 0; k < need; k += 1) {
      const card = randomLiveCard(used, rng);
      used[card] = 1;
      runout[k] = card;
    }
    for (let k = 0; k < need; k += 1) {
      heroCards[2 + board.length + k] = runout[k];
      for (let o = 0; o < prepared.length; o += 1) oppCards[o][2 + board.length + k] = runout[k];
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
  const equity = share / n;
  const variance = Math.max(0, sumSq / n - equity * equity);
  return { equity, iterations: n, stderr: Math.sqrt(variance / n) };
}

// Opponent range model. Each opponent starts from the chart range for the preflop actions they took
// (widened or tightened by their observed type), then every postflop action multiplies each combo's
// weight by the likelihood that a player of that type takes that action with that combo's strength.
import { evaluate } from '../engine/evaluator.js';
import { CLASS_COUNT, COMBO_COUNT, COMBO_CARDS, COMBO_CLASS } from './handClass.js';
import { hasChart, scaledFreqs, RANK_PCT } from './charts.js';
import { preflopSpot, chartKeyFor } from './situation.js';
import { comboDraws } from './texture.js';
import { ADAPT_MIN_OBS } from './adapt.js';

/** @typedef {{ looseness:number, aggression:number }} PlayerType looseness: range width multiplier; aggression in [0, 1] */

/** @type {PlayerType} */
export const DEFAULT_TYPE = Object.freeze({ looseness: 1, aggression: 0.35 });

const FLOOR = 0.03; // no action ever rules a hand out completely
const sig = (x) => 1 / (1 + Math.exp(-x));

/** @returns {PlayerType} */
export function typeFromProfile(profile) {
  if (!profile) return DEFAULT_TYPE;
  const { vpip, aggFreq } = profile.stats;
  return {
    looseness: vpip && vpip.n >= ADAPT_MIN_OBS ? Math.min(2.5, Math.max(0.5, vpip.value / 0.25)) : 1,
    aggression: aggFreq && aggFreq.n >= ADAPT_MIN_OBS ? aggFreq.value : DEFAULT_TYPE.aggression,
  };
}

/** 169 class likelihoods of taking `action` in a preflop spot. */
export function preflopLikelihoods(spot, action, type) {
  const key = chartKeyFor(spot, hasChart);
  const out = new Float32Array(CLASS_COUNT);
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
    const f = scaledFreqs(key, cls, type.looseness, type.looseness);
    let w = 1;
    if (action === 'raise') w = f.raise;
    else if (action === 'check') w = 1 - f.raise;
    // Open limp: premiums (top ~4%) almost always raise instead, so they limp far less than
    // middling suited hands, which limp the most; weak hands mostly just fold.
    else if (action === 'call' && spot.kind === 'open') w = RANK_PCT[cls] < 0.04 ? 0.05 : RANK_PCT[cls] < 0.6 ? 0.8 : 0.15;
    else if (action === 'call') w = f.call;
    out[cls] = FLOOR + (1 - FLOOR) * w;
  }
  return out;
}

/**
 * Likelihood of a postflop action for a combo at weighted-percentile strength p (0 = weakest in the range).
 * @param {'bet'|'raise'|'call'|'check'} action
 */
export function actionLikelihood(action, p, draw, facingBet, aggression, river) {
  if (action === 'bet' || action === 'raise') {
    const t = (facingBet ? 0.8 : 0.7) - 0.25 * aggression;
    let l = 0.06 + 0.94 * sig((p - t) / 0.06);
    if (draw && !river) l = Math.max(l, 0.2 + 0.5 * aggression);
    if (p < 0.2) l = Math.max(l, 0.35 * aggression);
    return l;
  }
  if (action === 'call') {
    if (!facingBet) return 1;
    let l = 0.12 + 0.88 * sig((p - 0.35) / 0.08);
    if (p > 0.92) l *= 0.6;
    if (draw && !river) l = Math.max(l, 0.8);
    return l;
  }
  if (action === 'check') return 1 - 0.6 * sig((p - (0.8 - 0.1 * aggression)) / 0.06);
  return 1;
}

// Combos sorted weakest first by their hand value on a board, shared across seats (small FIFO by board).
const strengthCache = new Map();
function boardStrength(board) {
  const key = board.join(',');
  const hit = strengthCache.get(key);
  if (hit) return hit;
  const onBoard = new Uint8Array(52);
  for (const c of board) onBoard[c] = 1;
  const scores = new Int32Array(COMBO_COUNT).fill(-1);
  const live = [];
  const cards = [0, 0, ...board];
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    const a = COMBO_CARDS[2 * i];
    const b = COMBO_CARDS[2 * i + 1];
    if (onBoard[a] || onBoard[b]) continue;
    cards[0] = a;
    cards[1] = b;
    scores[i] = evaluate(cards);
    live.push(i);
  }
  live.sort((x, y) => scores[x] - scores[y]);
  const entry = { order: Int16Array.from(live), scores, draws: comboDraws(board) };
  strengthCache.set(key, entry);
  if (strengthCache.size > 32) strengthCache.delete(strengthCache.keys().next().value);
  return entry;
}

/**
 * Multiplies `range` (1,326 combo weights, mutated) by the likelihood of `action` on `board`.
 * Combos that tie in hand value (e.g. every combo on a board that plays the board itself, or suit
 * variants of one class that make the same hand) walk the sorted order as one group and share the
 * group's midpoint percentile, so tied combos always come out with equal weight.
 */
export function reweightPostflop(range, board, action, facingBet, type) {
  const { order, scores, draws } = boardStrength(board);
  let total = 0;
  for (let k = 0; k < order.length; k += 1) total += range[order[k]];
  if (total <= 0) return;
  const river = board.length === 5;
  let before = 0;
  let k = 0;
  while (k < order.length) {
    let j = k;
    let groupMass = 0;
    while (j < order.length && scores[order[j]] === scores[order[k]]) {
      groupMass += range[order[j]];
      j += 1;
    }
    if (groupMass > 0) {
      const p = (before + groupMass / 2) / total;
      for (let m = k; m < j; m += 1) {
        const i = order[m];
        const w = range[i];
        if (w > 0) range[i] = w * actionLikelihood(action, p, draws[i] === 1, facingBet, type.aggression, river);
      }
    }
    before += groupMass;
    k = j;
  }
}

function comboRangeFrom(classWeights, dead) {
  const range = new Float32Array(COMBO_COUNT);
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    if (dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    range[i] = classWeights[COMBO_CLASS[i]];
  }
  return range;
}

// `eventsFor` returns a fresh copy of every event on each call, so caching on object identity
// (`events[0] === entry.start`) never hits in production: every decision hands the tracker a new
// array of new objects, even for the same hand. Key the cache on content instead: a hand is fully
// identified by its start event (button + starting seats) and the hero seat we're tracking for, so
// two `events` arrays with the same signature and a length no shorter than what we've already
// processed are treated as the same, growing log, and only the new suffix is processed.
const startSignature = (events, seat) => {
  const start = events[0];
  return `${start.button}|${JSON.stringify(start.seats)}|${seat}`;
};

/**
 * Tracks opponents' ranges for one seat through a hand, processing only new events when the log grows.
 * @returns {{ track:(view:object, events:object[], seat:number, typeOf:(seat:number) => PlayerType) =>
 *   { classWeights:Map<number, Float32Array>, comboRanges:Map<number, Float32Array>, rebuilt:boolean } }}
 *   classWeights: preflop range per live opponent; comboRanges: postflop combo weights per live opponent
 *   (empty preflop). Both maps hold copies the caller may freely mutate. `rebuilt` is true when this call
 *   started a fresh entry (first call, or a log whose signature didn't match what was cached) and false
 *   when it reused and incrementally extended the previous entry.
 */
export function createRangeTracker() {
  const bySeat = new Map();

  const fresh = (events, sig) => ({
    sig, processed: 0, preflopActs: [], boards: [],
    classWeights: new Map(), comboRanges: new Map(), folded: new Set(), facingBet: false,
  });

  function step(entry, event, view, seat, typeOf) {
    if (event.type === 'board') {
      const first = entry.boards.length === 0;
      entry.boards.push(...event.cards);
      entry.facingBet = false;
      if (first) {
        const dead = new Uint8Array(52);
        for (const c of view.players.find((p) => p.seat === seat).hole) dead[c] = 1;
        for (const c of entry.boards) dead[c] = 1;
        const any = new Float32Array(CLASS_COUNT).fill(1);
        for (const p of view.players) {
          if (p.seat === seat || entry.folded.has(p.seat)) continue;
          entry.comboRanges.set(p.seat, comboRangeFrom(entry.classWeights.get(p.seat) ?? any, dead));
        }
      } else {
        for (const range of entry.comboRanges.values()) {
          for (let i = 0; i < COMBO_COUNT; i += 1) {
            if (event.cards.includes(COMBO_CARDS[2 * i]) || event.cards.includes(COMBO_CARDS[2 * i + 1])) range[i] = 0;
          }
        }
      }
      return;
    }
    if (event.type !== 'act') return;
    const actor = event.seat;
    if (entry.boards.length === 0) {
      if (actor !== seat) {
        if (!entry.classWeights.has(actor)) entry.classWeights.set(actor, new Float32Array(CLASS_COUNT).fill(1));
        if (event.action !== 'fold') {
          const spot = preflopSpot(view, entry.preflopActs, actor);
          const like = preflopLikelihoods(spot, event.action, typeOf(actor));
          const w = entry.classWeights.get(actor);
          for (let cls = 0; cls < CLASS_COUNT; cls += 1) w[cls] *= like[cls];
        }
      }
      entry.preflopActs.push(event);
    } else if (actor !== seat && event.action !== 'fold' && entry.comboRanges.has(actor)) {
      reweightPostflop(entry.comboRanges.get(actor), entry.boards, event.action, entry.facingBet, typeOf(actor));
    }
    if (event.action === 'fold') {
      entry.folded.add(actor);
      entry.comboRanges.delete(actor);
    }
    if (event.action === 'bet' || event.action === 'raise') entry.facingBet = true;
  }

  function track(view, events, seat, typeOf) {
    const sig = startSignature(events, seat);
    let entry = bySeat.get(seat);
    const valid = entry && entry.sig === sig && entry.processed <= events.length;
    const rebuilt = !valid;
    if (!valid) {
      entry = fresh(events, sig);
      bySeat.set(seat, entry);
    }
    for (let k = entry.processed; k < events.length; k += 1) step(entry, events[k], view, seat, typeOf);
    entry.processed = events.length;
    const live = new Set(view.players.filter((p) => !p.folded && p.seat !== seat).map((p) => p.seat));
    // Copy every array out: callers must not be able to corrupt tracker state by mutating what they got back.
    const pick = (map) => new Map([...map].filter(([s]) => live.has(s)).map(([s, arr]) => [s, Float32Array.from(arr)]));
    // Opponents who have not acted preflop yet (e.g. the blinds before their turn) hold any hand.
    const classWeights = pick(entry.classWeights);
    for (const s of live) if (!classWeights.has(s)) classWeights.set(s, new Float32Array(CLASS_COUNT).fill(1));
    return { classWeights, comboRanges: pick(entry.comboRanges), rebuilt };
  }

  return { track };
}

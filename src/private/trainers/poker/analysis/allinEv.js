// All-in EV (spec §7.1): when the betting is over before the river and the hero is still in, the hero's
// expected share of the pots with the actual cards of the live players, minus what the hero put in.
// Stored as hero_allin_ev and used for the all-in adjusted net.
import { applyEvent } from '../engine/handState.js';
import { evaluate } from '../engine/evaluator.js';
import { buildPots } from '../engine/pots.js';
import { roundEv } from './grade.js';

export const ALLIN_SAMPLES = 20000;

/** The first state where no more betting is possible before the river and the hero is live, or null. */
export function allInPoint(events, heroSeat) {
  let state = null;
  for (const event of events) {
    state = applyEvent(state, event);
    if (!state.needsBoard) continue;
    const live = state.players.filter((p) => !p.folded);
    const withChips = live.filter((p) => !p.allIn);
    if (live.length >= 2 && withChips.length <= 1 && live.some((p) => p.seat === heroSeat)) return state;
  }
  return null;
}

function heroShare(live, pots, board, heroSeat) {
  const scores = new Map(live.map((p) => [p.seat, evaluate([...p.hole, ...board])]));
  let share = 0;
  for (const pot of pots) {
    if (!pot.eligible.includes(heroSeat)) continue;
    let best = -Infinity;
    let winners = 0;
    let heroWins = false;
    for (const seat of pot.eligible) {
      const score = scores.get(seat);
      if (score > best) {
        best = score;
        winners = 1;
        heroWins = seat === heroSeat;
      } else if (score === best) {
        winners += 1;
        if (seat === heroSeat) heroWins = true;
      }
    }
    if (heroWins) share += pot.amount / winners;
  }
  return share;
}

/**
 * @param {object[]} events full hand log (every hole card)
 * @param {number} heroSeat
 * @param {{ rng?:() => number, samples?:number }} [options]
 * @returns {number|null} units with 2 decimals
 */
export function heroAllinEv(events, heroSeat, { rng = null, samples = ALLIN_SAMPLES } = {}) {
  const point = allInPoint(events, heroSeat);
  if (!point) return null;
  const live = point.players.filter((p) => !p.folded);
  const pots = buildPots(point.players.map((p) => ({ seat: p.seat, total: p.total, folded: p.folded })));
  const used = new Uint8Array(52);
  for (const p of live) for (const c of p.hole) used[c] = 1;
  for (const c of point.board) used[c] = 1;
  const deck = [];
  for (let c = 0; c < 52; c += 1) if (!used[c]) deck.push(c);
  const need = 5 - point.board.length;
  const hero = point.players.find((p) => p.seat === heroSeat);
  let total = 0;
  let count = 0;
  const tally = (runout) => {
    total += heroShare(live, pots, [...point.board, ...runout], heroSeat);
    count += 1;
  };

  if (need === 1) {
    for (const a of deck) tally([a]);
  } else if (need === 2) {
    for (let i = 0; i < deck.length; i += 1) for (let j = i + 1; j < deck.length; j += 1) tally([deck[i], deck[j]]);
  } else {
    if (!rng) throw new Error('heroAllinEv needs an rng for a preflop all-in');
    const cards = deck.slice();
    for (let s = 0; s < samples; s += 1) {
      for (let k = 0; k < need; k += 1) {
        const j = k + Math.floor(rng() * (cards.length - k));
        [cards[k], cards[j]] = [cards[j], cards[k]];
      }
      tally(cards.slice(0, need));
    }
  }
  return roundEv(total / count - hero.total);
}

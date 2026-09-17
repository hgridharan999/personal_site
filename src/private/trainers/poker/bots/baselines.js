// src/private/trainers/poker/bots/baselines.js
// Fixed reference bots for tests, training anchors and the benchmark gate.
import { randomPolicy } from '../engine/simulate.js';
import { evaluate, CATEGORY } from '../engine/evaluator.js';
import { classOf, COMBO_COUNT } from './handClass.js';
import { RANK_PCT } from './charts.js';
import { equityVsRanges } from './equity.js';
import { legalize } from './legalize.js';
import { EQUITY_VS_ANY } from './preflopEquity.js';
import { huEquity } from './postflop.js';
import { actsByStreet, preflopSpot } from './situation.js';

const ANY_RANGE = new Float32Array(COMBO_COUNT).fill(1);
const potOf = (view) => view.players.reduce((sum, p) => sum + p.total, 0);
const meOf = (ctx) => ctx.view.players.find((p) => p.seat === ctx.seat);
const liveOpponents = (ctx) => ctx.view.players.filter((p) => !p.folded && p.seat !== ctx.seat).length;

/** @type {import('./contract.js').Brain} */
export const randomLegal = { decide: (ctx, rng) => randomPolicy(ctx.view, ctx.legal, rng) };

/** @type {import('./contract.js').Brain} */
export const callingStation = { decide: (ctx) => (ctx.legal.canCheck ? { action: 'check' } : { action: 'call' }) };

/**
 * Plays its raw equity against random hands: pot-size raise with heads-up-equivalent equity >= 0.65,
 * otherwise check, or call when equity covers the pot odds.
 * @returns {import('./contract.js').Brain}
 */
export function createRawEquityBrain({ iterations = 200 } = {}) {
  return {
    decide(ctx, rng) {
      const { view, legal } = ctx;
      const me = meOf(ctx);
      const nOpp = liveOpponents(ctx);
      const equity = view.street === 'preflop'
        ? EQUITY_VS_ANY[classOf(me.hole[0], me.hole[1])] ** nOpp
        : equityVsRanges({ hole: me.hole, board: view.board, ranges: Array(nOpp).fill(ANY_RANGE), rng, iterations }).equity;
      const pot = potOf(view);
      if (legal.canRaise && huEquity(equity, nOpp) >= 0.65) {
        return legalize({ action: 'raise', amount: view.currentBet + pot + legal.toCall }, legal);
      }
      if (legal.canCheck) return { action: 'check' };
      return equity >= legal.toCall / (pot + legal.toCall) ? { action: 'call' } : { action: 'fold' };
    },
  };
}

// Category of the board alone (pairs, trips and quads on a 3-4 card board; full evaluation on the river).
function boardCategory(board) {
  if (board.length >= 5) return evaluate(board) >> 20;
  const counts = {};
  for (const c of board) counts[c >> 2] = (counts[c >> 2] ?? 0) + 1;
  const n = Object.values(counts).sort((a, b) => b - a);
  if (n[0] >= 4) return CATEGORY.QUADS; // a 4-card board that is itself four of a kind
  if (n[0] >= 3) return CATEGORY.TRIPS;
  if (n[0] === 2 && n[1] === 2) return CATEGORY.TWO_PAIR;
  return n[0] === 2 ? CATEGORY.PAIR : CATEGORY.HIGH_CARD;
}

/**
 * Tight-passive: plays the top 12% preflop by calling (raises only the top 3% when the pot is unopened: no
 * raises and no limpers ahead, so an option in the big blind after limps is not treated as unopened), continues
 * postflop only with a hand that improves on the board, and bets half pot with two pair or better when checked to.
 * @type {import('./contract.js').Brain}
 */
export const tightPassive = {
  decide(ctx) {
    const { view, legal, bb, seat, events } = ctx;
    const me = meOf(ctx);
    const check = () => (legal.canCheck ? { action: 'check' } : { action: 'fold' });
    if (view.street === 'preflop') {
      const pct = RANK_PCT[classOf(me.hole[0], me.hole[1])];
      if (pct > 0.12) return check();
      const unopened = preflopSpot(view, actsByStreet(events).preflop, seat).kind === 'open';
      if (pct <= 0.03 && unopened) return legalize({ action: 'raise', amount: 3 * bb }, legal);
      return legal.canCheck ? { action: 'check' } : { action: 'call' };
    }
    const category = evaluate([...me.hole, ...view.board]) >> 20;
    if (category <= boardCategory(view.board)) return check();
    if (category >= 2 && legal.canCheck && legal.canRaise) {
      return legalize({ action: 'bet', amount: Math.round(potOf(view) / 2) }, legal);
    }
    return legal.canCheck ? { action: 'check' } : { action: 'call' };
  },
};

export const rawEquity = createRawEquityBrain();

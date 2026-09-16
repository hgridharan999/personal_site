// src/private/trainers/poker/bots/preflop.js
// Preflop decisions: chart frequencies scaled by persona dials, plus an equity check for big calls.
import { classOf } from './handClass.js';
import { hasChart, scaledFreqs, topShareWeights } from './charts.js';
import { equityVsClassWeights } from './preflopEquity.js';
import { actsByStreet, preflopSpot, chartKeyFor } from './situation.js';

// Range share assumed for a raiser when no tracked range is available (ranked by the raiser order).
const RAISER_SHARE = { open: 0.3, vsLimp: 0.3, vsOpen: 0.2, squeeze: 0.2, vs3bet: 0.07, vs4bet: 0.035 };
const BIG_CALL = 0.35; // a call costing at least this share of the remaining stack is an equity decision
const JAM_SHARE = 0.4; // raises committing at least this share of the stack go all-in

/** Width multipliers [raise, call] for a spot from persona dials. */
export function spotMultipliers(spot, dials) {
  switch (spot.kind) {
    case 'open':
      return [dials[`open${spot.position}`] ?? 1, 1];
    case 'vsLimp':
      return [dials.isoRaise, dials.coldCall];
    case 'vsOpen':
    case 'squeeze':
      return [dials.threeBet, spot.position === 'BB' ? dials.bbDefend : dials.coldCall];
    default:
      return [dials.fourBet, dials.vs3betCall];
  }
}

/** Raise-to amount in units for a spot, before clamping to legal bounds. */
export function raiseSize(spot, view, dials, bb) {
  const bet = view.currentBet;
  switch (spot.kind) {
    case 'open':
      return Math.round((dials.openSize + (spot.position === 'SB' ? 1 : 0)) * bb);
    case 'vsLimp':
      return Math.round((dials.openSize + 1 + spot.limpers) * bb);
    case 'vsOpen':
      return Math.round(bet * (spot.ip ? 3 : 3.8));
    case 'squeeze':
      return Math.round(bet * (spot.ip ? 3 : 3.8) + bet * spot.callers);
    case 'vs3bet':
      return Math.round(bet * 2.3);
    default:
      return Infinity; // 5-bet: all-in
  }
}

/**
 * @param {{ view:object, events:object[], seat:number, legal:object, dials:Record<string,number>, rng:() => number,
 *   bb:number, raiserWeights?:Float32Array|null }} input raiserWeights: tracked 169-class range of the last raiser
 * @returns {{ action:string, amount?:number }} an intended choice (pass through legalize)
 */
export function preflopDecision({ view, events, seat, legal, dials, rng, bb, raiserWeights = null }) {
  const me = view.players.find((p) => p.seat === seat);
  const cls = classOf(me.hole[0], me.hole[1]);
  const spot = preflopSpot(view, actsByStreet(events).preflop, seat);
  const key = chartKeyFor(spot, hasChart);
  const [raiseMul, callMul] = spotMultipliers(spot, dials);
  const f = scaledFreqs(key, cls, raiseMul, callMul);
  const allIn = { action: 'raise', amount: legal.maxRaiseTo ?? 0 };

  if (legal.toCall > 0 && legal.toCall >= BIG_CALL * me.stack) {
    const pot = view.players.reduce((sum, p) => sum + p.total, 0);
    const villain = raiserWeights ?? topShareWeights(RAISER_SHARE[spot.kind]);
    const equity = equityVsClassWeights(cls, villain);
    const need = legal.toCall / (pot + legal.toCall);
    if (legal.canRaise && f.raise >= 0.5 && equity >= 0.55) return allIn;
    return equity >= need * dials.jamCall ? { action: 'call' } : { action: 'fold' };
  }

  const u = rng();
  if (u < f.raise) {
    if (spot.kind === 'open' && rng() < dials.limpFreq) return { action: 'call' };
    const amount = raiseSize(spot, view, dials, bb);
    if (!legal.canRaise) return { action: 'call' };
    return amount >= JAM_SHARE * legal.maxRaiseTo ? allIn : { action: 'raise', amount };
  }
  if (u < f.raise + f.call) return { action: 'call' };
  return { action: 'fold' };
}

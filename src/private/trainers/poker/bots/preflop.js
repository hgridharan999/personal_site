// src/private/trainers/poker/bots/preflop.js
// Preflop decisions: chart frequencies scaled by persona dials, plus an equity check for big calls and 3-bets.
import { CLASS_COUNT, classOf, combosIn } from './handClass.js';
import { hasChart, scaledFreqs, topShareWeights } from './charts.js';
import { equityVsClassWeights } from './preflopEquity.js';
import { actsByStreet, preflopSpot, chartKeyFor } from './situation.js';

// Range share assumed for a raiser when no tracked range is available (ranked by the raiser order).
const RAISER_SHARE = { open: 0.3, vsLimp: 0.3, vsOpen: 0.2, squeeze: 0.2, vs3bet: 0.07, coldVs3bet: 0.07, vs4bet: 0.035 };
const BIG_CALL = 0.35; // a call costing at least this share of the remaining stack is an equity decision
const JAM_SHARE = 0.4; // raises committing at least this share of the stack go all-in
// Share of equity an opener realizes after calling a 3-bet, in and out of position.
const REALIZATION = { ip: 0.95, oop: 0.85 };
// ranges.js gives every class at least this likelihood per action, so a tracked range carries this much junk.
const TRACKER_FLOOR = 0.03;

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
    case 'coldVs3bet':
      // A 4-bet, by the opener or cold, is 2.3x the 3-bet.
      return Math.round(bet * 2.3);
    default:
      return Infinity; // a 5-bet is all-in
  }
}

/**
 * Model of a 3-bettor's range: the top RAISER_SHARE.vs3bet of hands in the raiser order, widened to the share of
 * the tracked range (less the tracker's likelihood floor) when that is wider, e.g. once the profile shows a loose player.
 * @param {Float32Array|null} raiserWeights tracked 169-class range of the 3-bettor
 */
export function threeBettorWeights(raiserWeights) {
  let tracked = 0;
  if (raiserWeights) {
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) tracked += Math.min(1, raiserWeights[cls]) * combosIn(cls);
    tracked = (tracked / 1326 - TRACKER_FLOOR) / (1 - TRACKER_FLOOR);
  }
  return topShareWeights(Math.max(RAISER_SHARE.vs3bet, tracked));
}

/** True when calling a 3-bet is profitable on equity: equity × realization ≥ toCall / (pot + toCall). */
export function defendsThreeBet(cls, { pot, toCall, ip, raiserWeights }) {
  const equity = equityVsClassWeights(cls, threeBettorWeights(raiserWeights));
  return equity * (ip ? REALIZATION.ip : REALIZATION.oop) >= toCall / (pot + toCall);
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
  // An opener facing a single normal-size 3-bet never folds a hand that beats the pot odds (chart raises stay raises).
  if (spot.kind === 'vs3bet' && legal.toCall > 0) {
    const pot = view.players.reduce((sum, p) => sum + p.total, 0);
    if (defendsThreeBet(cls, { pot, toCall: legal.toCall, ip: spot.ip, raiserWeights })) return { action: 'call' };
  }
  return { action: 'fold' };
}

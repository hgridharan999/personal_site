// src/private/trainers/poker/bots/probes.js
// Fixed exploit probes for the benchmark gate. Each plays like rawEquity except in its probe spot.
import { classOf } from './handClass.js';
import { RANK_PCT } from './charts.js';
import { rawEquity } from './baselines.js';
import { legalize } from './legalize.js';
import { actsByStreet, potOf, preflopSpot } from './situation.js';

/**
 * Re-raises to 3x whenever it faces a single raise preflop (with or without callers). Sizing is always
 * 3x the current bet, regardless of any callers between the raiser and this seat (no extra sizing for a squeeze).
 */
export const always3Bet = {
  decide(ctx, rng) {
    const { view, legal, seat, events } = ctx;
    if (view.street === 'preflop' && legal.canRaise) {
      const spot = preflopSpot(view, actsByStreet(events).preflop, seat);
      if (spot.kind === 'vsOpen' || spot.kind === 'squeeze') return legalize({ action: 'raise', amount: 3 * view.currentBet }, legal);
    }
    return rawEquity.decide(ctx, rng);
  },
};

/** Opens 45% of hands to 2.5 BB and bets 2/3 pot on every flop it reaches as the preflop raiser when checked to. */
export const alwaysCbet = {
  decide(ctx, rng) {
    const { view, legal, seat, events, bb } = ctx;
    const acts = actsByStreet(events);
    if (view.street === 'preflop' && legal.canRaise) {
      const me = view.players.find((p) => p.seat === seat);
      const spot = preflopSpot(view, acts.preflop, seat);
      if (spot.kind === 'open' && RANK_PCT[classOf(me.hole[0], me.hole[1])] <= 0.45) {
        return legalize({ action: 'raise', amount: Math.round(2.5 * bb) }, legal);
      }
    }
    if (view.street === 'flop' && legal.canCheck && legal.canRaise) {
      const raises = acts.preflop.filter((a) => a.action === 'raise');
      if (raises.length && raises[raises.length - 1].seat === seat) {
        return legalize({ action: 'bet', amount: Math.round((2 * potOf(view)) / 3) }, legal);
      }
    }
    return rawEquity.decide(ctx, rng);
  },
};

/** Bets 1.5x pot (capped at all-in) on every river where it can bet. */
export const alwaysOverbetRiver = {
  decide(ctx, rng) {
    const { view, legal } = ctx;
    if (view.street === 'river' && legal.canCheck && legal.canRaise) {
      return legalize({ action: 'bet', amount: Math.round(1.5 * potOf(view)) }, legal);
    }
    return rawEquity.decide(ctx, rng);
  },
};

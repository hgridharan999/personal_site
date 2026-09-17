// src/private/trainers/poker/bots/brain.js
// The heuristic brain: charts preflop, Monte Carlo equity against tracked ranges postflop, persona dials,
// and exploit shifts against the profiled hero. Decides only from ctx.view and ctx.events.
import { resolveDials } from './dials.js';
import { adaptDials } from './adapt.js';
import { equityVsRanges } from './equity.js';
import { legalize } from './legalize.js';
import { postflopDecision } from './postflop.js';
import { preflopDecision } from './preflop.js';
import { createRangeTracker, DEFAULT_TYPE, typeFromProfile } from './ranges.js';
import { actsByStreet, postflopContext } from './situation.js';
import { boardTexture, handFeatures } from './texture.js';

/** Production defaults: at most 4,000 samples or 300 ms per postflop decision (spec §5.3), whichever comes first. */
export const DEFAULT_BRAIN_OPTIONS = Object.freeze({ iterations: 4000, budgetMs: 300 });

/**
 * True when adaptation should apply: `ctx.profile` describes a `heroSeat` that is set, is not this
 * bot's own seat, and is still live at the table. Exported so tests can assert the gate directly.
 */
export function shouldAdapt(ctx) {
  if (!ctx.profile || !Number.isInteger(ctx.heroSeat) || ctx.heroSeat === ctx.seat) return false;
  const hero = ctx.view.players.find((p) => p.seat === ctx.heroSeat);
  return Boolean(hero && !hero.folded);
}

/**
 * @param {{ iterations?:number, budgetMs?:number, now?:() => number }} [options]
 *   Tests and training pass `budgetMs: Infinity` so decisions depend only on the rng.
 * @returns {import('./contract.js').Brain}
 */
export function createHeuristicBrain(options = {}) {
  const { iterations, budgetMs, now } = { ...DEFAULT_BRAIN_OPTIONS, ...options };
  const tracker = createRangeTracker();

  return {
    decide(ctx, rng) {
      const { view, seat, legal, events } = ctx;
      const base = resolveDials(ctx.persona?.dials);
      const dials = shouldAdapt(ctx) ? adaptDials(base, ctx.profile) : base;
      const typeOf = (s) => (s === ctx.heroSeat && ctx.profile ? typeFromProfile(ctx.profile) : DEFAULT_TYPE);
      const { classWeights, comboRanges } = tracker.track(view, events, seat, typeOf);

      if (view.street === 'preflop') {
        const raises = actsByStreet(events).preflop.filter((a) => a.action === 'raise');
        const raiser = raises.length ? raises[raises.length - 1].seat : null;
        const raiserWeights = raiser === null ? null : classWeights.get(raiser) ?? null;
        const choice = preflopDecision({ view, events, seat, legal, dials, rng, bb: ctx.bb, raiserWeights });
        return legalize(choice, legal);
      }

      const me = view.players.find((p) => p.seat === seat);
      const context = postflopContext(view, events, seat, legal);
      const { equity } = equityVsRanges({
        hole: me.hole, board: view.board, ranges: [...comboRanges.values()], rng, iterations, budgetMs, now,
      });
      const features = handFeatures(me.hole, view.board);
      const choice = postflopDecision({
        ...context,
        equity,
        currentBet: view.currentBet,
        maxRaiseTo: legal.maxRaiseTo ?? me.committed + me.stack,
        canRaise: legal.canRaise,
        wetness: boardTexture(view.board).wetness,
        draw: features.flushDraw || features.straightDraw === 'oesd',
        dials,
        rng,
      });
      return legalize(choice, legal);
    },
  };
}

// src/private/trainers/poker/analysis/gradeHand.js
// Grades every hero decision of one hand on the information the hero had (spec §7.1) and computes the
// all-in EV. Pure given the hand when budgetMs is Infinity; in the worker the 2 s budget caps the rollouts.
import { mulberry32 } from '../../core/rng.js';
import { equityVsRanges } from '../bots/equity.js';
import { ANALYSIS_VERSION } from './version.js';
import { gradeFor, roundEv, roundProb, seedFor } from './grade.js';
import { decisionPoints } from './spots.js';
import { optionsFor, optionKey } from './options.js';
import { chartCheck, standardRaiseTo } from './preflopCheck.js';
import { heroAllinEv, ALLIN_SAMPLES } from './allinEv.js';
import { createRolloutWorld } from './rollout.js';
import { estimateOptionEvs, rankOptions } from './evOptions.js';
import { isVagueRange, dominantOpponent, isConfident } from './confidence.js';

export const HAND_BUDGET_MS = 2000;
export const EQUITY_ITERATIONS = 2000;
export const MAX_GRADED_DECISIONS = 40; // the POST hands limit per hand
const defaultNow = () => performance.now();

/**
 * @param {object} point a DecisionPoint (analysis/spots.js)
 * @param {{ record:{ id:string, heroSeat:number, lineup:object[], events:object[] }, seed:number, budgetMs?:number,
 *   now?:() => number, minRollouts?:number, maxRollouts?:number, rollout?:Function, createWorld?:Function }} settings
 * @returns {object} DecisionRecord (contracts §4.1)
 */
export function gradeDecision(point, {
  record, seed, budgetMs = Infinity, now = defaultNow, minRollouts, maxRollouts, rollout, createWorld = createRolloutWorld,
}) {
  const { event } = point;
  const size = event.action === 'bet' || event.action === 'raise' ? event.amount : null;
  const decision = {
    idx: point.idx,
    street: point.street,
    position: point.position,
    spot: point.spot,
    action: event.action,
    size,
    pot: point.pot,
    toCall: point.toCall,
    equity: null,
    neededEquity: point.neededEquity === null ? null : roundProb(point.neededEquity),
    analysisVersion: ANALYSIS_VERSION,
  };
  const unrolled = (recommended) => ({
    ...decision, recommended: { ...recommended, evByOption: {} }, evLoss: 0, grade: 'good', confident: true,
  });

  if (point.street === 'preflop') {
    const chart = chartCheck(point);
    if (chart?.ok) return unrolled(chart.recommended);
  }

  let world = null;
  const worldFor = () => {
    world ??= createWorld({ events: record.events, point, heroSeat: record.heroSeat, lineup: record.lineup });
    return world;
  };
  if (point.street !== 'preflop') {
    const hero = point.view.players.find((p) => p.seat === record.heroSeat);
    const { equity } = equityVsRanges({
      hole: hero.hole, board: point.view.board, ranges: [...worldFor().ranges.values()], rng: mulberry32(seed), iterations: EQUITY_ITERATIONS,
    });
    decision.equity = roundProb(equity);
  }

  const options = optionsFor(point.before, {
    preflopRaiseTo: point.street === 'preflop' ? standardRaiseTo(point) : null,
    chosen: event,
  });
  if (options.length < 2) return unrolled({ action: event.action, size });

  const evs = estimateOptionEvs(worldFor(), options, { seed, budgetMs, now, minRollouts, maxRollouts, rollout });
  const ranked = rankOptions(evs);
  const best = ranked[0];
  const chosen = evs.find((o) => o.key === optionKey(event.action, size));
  const evLoss = roundEv(Math.max(0, best.mean - chosen.mean));
  let vagueRange = false;
  if (point.street !== 'preflop') {
    const seat = dominantOpponent(point.before, point.seatEvents, record.heroSeat);
    vagueRange = seat !== null && world.ranges.has(seat) && isVagueRange(world.ranges.get(seat), world.dead);
  }
  return {
    ...decision,
    recommended: {
      action: best.action,
      size: best.size,
      evByOption: Object.fromEntries(evs.map((o) => [o.key, roundEv(o.mean)])),
    },
    evLoss,
    grade: gradeFor(evLoss, point.pot),
    confident: isConfident(ranked, { vagueRange }),
  };
}

/**
 * @param {{ id:string, heroSeat:number, lineup:{seat:number, personaId:string}[], events:object[] }} record
 * @returns {{ decisions:object[], heroAllinEv:number|null }}
 */
export function gradeHand(record, {
  budgetMs = HAND_BUDGET_MS, now = defaultNow, minRollouts, maxRollouts, allinSamples = ALLIN_SAMPLES, rollout, createWorld,
} = {}) {
  const heroAllin = heroAllinEv(record.events, record.heroSeat, { rng: mulberry32(seedFor(record.id, -1)), samples: allinSamples });
  const points = decisionPoints(record.events, record.heroSeat);
  if (points.length === 0 || points.length > MAX_GRADED_DECISIONS) return { decisions: [], heroAllinEv: heroAllin };
  const timed = budgetMs !== Infinity;
  const started = timed ? now() : 0;
  const decisions = points.map((point, i) => {
    const share = timed ? Math.max(0, budgetMs - (now() - started)) / (points.length - i) : Infinity;
    return gradeDecision(point, {
      record, seed: seedFor(record.id, point.idx), budgetMs: share, now, minRollouts, maxRollouts, rollout, createWorld,
    });
  });
  return { decisions, heroAllinEv: heroAllin };
}

// src/private/trainers/poker/analysis/spots.js
// Every hero decision in a hand log, with what the hero could see at that moment, and its spot string.
// Spot grammar (contracts §4.1, Phase 6): pf.<open|vs_limp|vs_open|squeeze|vs_3bet|vs_4bet> or
// <flop|turn|river>.<cbet|no_bet|facing_bet|facing_raise>.<ip|oop>. Phase 5 emits no other modifiers.
import { applyEvent, legalActions } from '../engine/handState.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { positionsOf, actsByStreet, preflopSpot, postflopContext } from '../bots/situation.js';

export const PREFLOP_SPOTS = Object.freeze({
  open: 'pf.open',
  vsLimp: 'pf.vs_limp',
  vsOpen: 'pf.vs_open',
  squeeze: 'pf.squeeze',
  vs3bet: 'pf.vs_3bet',
  vs4bet: 'pf.vs_4bet',
});

// situation.js's preflopSpot also yields 'coldVs3bet' for a player who raised neither the open nor the
// 3-bet (cold facing two raises). The Phase 6 spot grammar has no cold variant, so it maps to pf.vs_3bet.
const PREFLOP_KIND_SPOT = Object.freeze({ ...PREFLOP_SPOTS, coldVs3bet: PREFLOP_SPOTS.vs3bet });

/** @returns {'cbet'|'no_bet'|'facing_bet'|'facing_raise'} */
export function postflopSituation({ toCall, betsThisStreet, aggressor }) {
  if (toCall > 0) return betsThisStreet >= 2 ? 'facing_raise' : 'facing_bet';
  if (betsThisStreet === 0 && aggressor) return 'cbet';
  return 'no_bet';
}

/**
 * @param {object[]} events a full hand log (every hole card), complete or not
 * @param {number} heroSeat
 * @returns {object[]} DecisionPoint[] in log order (see the Task 2 Interfaces block)
 */
export function decisionPoints(events, heroSeat) {
  const points = [];
  let state = null;
  events.forEach((event, idx) => {
    if (event.type === 'act' && event.seat === heroSeat) {
      const legal = legalActions(state);
      const view = viewFor(state, heroSeat);
      const seatEvents = eventsFor(events.slice(0, idx), heroSeat);
      const pot = view.players.reduce((sum, p) => sum + p.total, 0);
      const street = state.street;
      let preflop = null;
      let context = null;
      let spot;
      if (street === 'preflop') {
        preflop = preflopSpot(view, actsByStreet(seatEvents).preflop, heroSeat);
        spot = PREFLOP_KIND_SPOT[preflop.kind];
      } else {
        context = postflopContext(view, seatEvents, heroSeat, legal);
        spot = `${street}.${postflopSituation(context)}.${context.ip ? 'ip' : 'oop'}`;
      }
      points.push({
        idx,
        event,
        before: state,
        legal,
        view,
        seatEvents,
        street,
        position: positionsOf(view)[heroSeat],
        spot,
        pot,
        toCall: legal.toCall,
        neededEquity: legal.toCall > 0 ? legal.toCall / (pot + legal.toCall) : null,
        preflop,
        context,
      });
    }
    state = applyEvent(state, event);
  });
  return points;
}

const STREET_BY_PREFIX = { pf: 'preflop', flop: 'flop', turn: 'turn', river: 'river' };
const STREET_LABEL = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
const POSITION_LABEL = { ip: 'in position', oop: 'out of position' };
const SITUATION_LABEL = {
  open: 'first in',
  vs_limp: 'facing limpers',
  vs_open: 'facing an open',
  squeeze: 'raise and callers',
  vs_3bet: 'facing a 3-bet',
  vs_4bet: 'facing a 4-bet',
  cbet: 'c-bet chance',
  no_bet: 'no bet yet',
  facing_bet: 'facing a bet',
  facing_raise: 'facing a raise',
};

/** @returns {{ street:'preflop'|'flop'|'turn'|'river', situation:string, position:'ip'|'oop'|null } | null} */
export function parseSpot(spot) {
  if (typeof spot !== 'string') return null;
  const [prefix, situation, ...modifiers] = spot.split('.');
  const street = Object.hasOwn(STREET_BY_PREFIX, prefix) ? STREET_BY_PREFIX[prefix] : null;
  if (!street || !situation) return null;
  const position = modifiers.find((m) => m === 'ip' || m === 'oop') ?? null;
  return { street, situation, position };
}

/** "River · facing a bet · out of position"; the raw value when the spot is outside the grammar. */
export function spotLabel(spot) {
  const parsed = parseSpot(spot);
  if (!parsed) return String(spot);
  const situation = Object.hasOwn(SITUATION_LABEL, parsed.situation)
    ? SITUATION_LABEL[parsed.situation]
    : parsed.situation.replaceAll('_', ' ');
  const parts = [STREET_LABEL[parsed.street], situation];
  if (parsed.position) parts.push(POSITION_LABEL[parsed.position]);
  return parts.join(' · ');
}

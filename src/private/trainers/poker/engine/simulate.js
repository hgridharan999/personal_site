// src/private/trainers/poker/engine/simulate.js
// Plays a whole hand with a policy. Used by property tests now and bot training later.
import { applyEvent, legalActions } from './handState.js';
import { dealHand } from './dealer.js';

const MAX_EVENTS = 500;

export function playHand({ seats, button, sb, bb, rng, policy }) {
  const deal = dealHand({ seats, button, sb, bb, rng });
  const events = [];
  let state = null;
  const push = (event) => {
    state = applyEvent(state, event);
    events.push(event);
  };
  deal.events.forEach(push);
  while (state.street !== 'complete') {
    if (events.length > MAX_EVENTS) throw new Error('hand did not terminate');
    if (state.needsBoard) push(deal.boardEvent(state.needsBoard));
    else push({ type: 'act', seat: state.toAct, ...policy(state, legalActions(state), rng) });
  }
  return { events, state };
}

/** Uniform-ish random legal action; raise sizes are uniform between min and max. */
export function randomPolicy(state, legal, rng) {
  const roll = rng();
  if (legal.canRaise && roll < 0.25) {
    const span = legal.maxRaiseTo - legal.minRaiseTo;
    return { action: legal.raiseKind, amount: legal.minRaiseTo + Math.floor(rng() * (span + 1)) };
  }
  if (roll < 0.4 && !legal.canCheck) return { action: 'fold' };
  return legal.canCheck ? { action: 'check' } : { action: 'call' };
}

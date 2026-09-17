// src/private/trainers/poker/bots/testHands.js
// Test helper (imported only by *.test.js): builds hand logs from short step strings.
import { parseCards } from '../engine/cards.js';
import { reduceHand, legalActions } from '../engine/handState.js';
import { viewFor, eventsFor } from '../engine/view.js';

export const HOLES6 = ['2c3d', '7h2s', 'AhAs', 'KdQd', 'JcTc', '9s9h'];

/**
 * Six players (or holes.length players) with `stack` units each, button on the last seat.
 * Steps: 'r 2 5' raise to 5, 'b 2 6' bet 6, 'c 1' call, 'k 1' check, 'f 3' fold, 'B Kh8d4s' board cards.
 * Throws if the log is illegal.
 */
export function buildLog(steps, { holes = HOLES6, stack = 200, button = holes.length - 1 } = {}) {
  const events = [{ type: 'start', button, sb: 1, bb: 2, seats: holes.map((_, seat) => ({ seat, stack })) }];
  holes.forEach((h, seat) => events.push({ type: 'hole', seat, cards: parseCards(h) }));
  for (const step of steps) {
    const [kind, a, b] = step.split(' ');
    if (kind === 'B') {
      events.push({ type: 'board', cards: parseCards(a) });
      continue;
    }
    const action = { r: 'raise', b: 'bet', c: 'call', k: 'check', f: 'fold' }[kind];
    if (!action) throw new Error(`Bad step: ${step}`);
    const event = { type: 'act', seat: Number(a), action };
    if (b !== undefined) event.amount = Number(b);
    events.push(event);
  }
  reduceHand(events);
  return events;
}

/** The BotContext pieces for whoever is to act after `steps`. */
export function contextAfter(steps, options = {}) {
  const events = buildLog(steps, options);
  const state = reduceHand(events);
  const legal = legalActions(state);
  if (!legal) throw new Error('nobody to act');
  return { state, events, legal, seat: legal.seat, view: viewFor(state, legal.seat), seatEvents: eventsFor(events, legal.seat) };
}

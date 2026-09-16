// src/private/trainers/poker/engine/dealer.js
// Turns a seeded shuffle into hand events. Pure given `rng`.
import { newDeck, shuffle } from './cards.js';

export function dealHand({ seats, button, sb, bb, rng }) {
  const deck = shuffle(newDeck(), rng);
  const sorted = seats.map((x) => x.seat).sort((a, b) => a - b);
  const b = sorted.indexOf(button);
  const order = sorted.map((_, k) => sorted[(b + 1 + k) % sorted.length]);
  const n = order.length;
  const events = [
    { type: 'start', seats, button, sb, bb },
    ...order.map((seat, i) => ({ type: 'hole', seat, cards: [deck[i], deck[i + n]] })),
  ];
  const at = 2 * n; // next undealt card; each street burns one first
  const runout = {
    flop: deck.slice(at + 1, at + 4),
    turn: [deck[at + 5]],
    river: [deck[at + 7]],
  };
  return { deck, events, boardEvent: (street) => ({ type: 'board', cards: runout[street] }) };
}

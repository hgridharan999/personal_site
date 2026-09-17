// src/private/trainers/poker/bots/arena.js
// Bot-vs-bot play with duplicate deals: each deal is replayed with the players rotated through every seat,
// so every player holds every set of hole cards once. Used by training and the benchmark gate.
import { mulberry32 } from '../../core/rng.js';
import { applyEvent, legalActions, EngineError } from '../engine/handState.js';
import { dealHand } from '../engine/dealer.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { emptyProfile } from './contract.js';
import { accumulateProfile } from './profileStats.js';

const MAX_EVENTS = 500;

/** @typedef {{ brain:import('./contract.js').Brain, persona:import('./contract.js').Persona|null }} ArenaPlayer */

/**
 * Plays one hand. Brains see only viewFor/eventsFor for their own seat.
 * @param {{ seats:{seat:number, stack:number}[], button:number, dealRng:() => number, decisionRng:() => number,
 *   playerAt:(seat:number) => ArenaPlayer, profile?:object|null, heroSeat?:number|null, sb?:number, bb?:number }} input
 *   profile, heroSeat: the profile of the player in heroSeat, passed to every brain so it can adapt to that seat.
 * @returns {{ events:object[], state:object }}
 */
export function playArenaHand({ seats, button, dealRng, decisionRng, playerAt, profile = null, heroSeat = null, sb = 1, bb = 2 }) {
  const deal = dealHand({ seats, button, sb, bb, rng: dealRng });
  const events = [];
  let state = null;
  const push = (event) => {
    state = applyEvent(state, event);
    events.push(event);
  };
  deal.events.forEach(push);
  while (state.street !== 'complete') {
    if (events.length > MAX_EVENTS) throw new EngineError('HAND_DID_NOT_TERMINATE', 'hand did not terminate');
    if (state.needsBoard) {
      push(deal.boardEvent(state.needsBoard));
      continue;
    }
    const legal = legalActions(state);
    const seat = legal.seat;
    const { brain, persona } = playerAt(seat);
    const ctx = { view: viewFor(state, seat), seat, legal, events: eventsFor(events, seat), persona, profile, heroSeat, bb };
    const choice = brain.decide(ctx, decisionRng);
    const event = { type: 'act', seat, action: choice.action };
    if (choice.action === 'bet' || choice.action === 'raise') event.amount = choice.amount;
    push(event);
  }
  return { events, state };
}

/**
 * Plays one deal under all rotations of `players` (one per seat, 2-6 players, full stacks each hand).
 * Rotation r puts player (s + r) % n in seat s; the cards and button are identical in every rotation.
 * @param {{ players:ArenaPlayer[], dealSeed:number, decisionRng:() => number, button?:number, stack?:number,
 *   subject?:number|null, profile?:object|null, adapt?:boolean,
 *   onHand?:(events:object[], seatOf:(player:number) => number) => void }} input
 *   subject: index of the profiled player (an exploit probe or opponent). Its profile goes to every brain with heroSeat
 *   set to the subject's seat in that rotation, and is updated with accumulateProfile after each hand.
 *   profile: the subject's profile so far. adapt: when true and no profile is given, start one from emptyProfile().
 *   Brains adapt whenever the subject has a profile (given, or started by adapt); with neither, profile and heroSeat
 *   are null. adapt requires a subject.
 * @returns {{ nets:number[], hands:number, profile:object|null }} nets: units won per player over all rotations
 */
export function playDuplicateDeal({
  players, dealSeed, decisionRng, button = 0, stack = 200, subject = null, profile = null, adapt = false, onHand,
}) {
  if (adapt && subject === null) throw new Error('adapt requires a subject');
  const n = players.length;
  const nets = new Array(n).fill(0);
  let current = profile ?? (adapt ? emptyProfile() : null);
  for (let r = 0; r < n; r += 1) {
    const seatOf = (player) => (player - r + n) % n;
    const heroSeat = subject === null ? null : seatOf(subject);
    const { events, state } = playArenaHand({
      seats: players.map((_, seat) => ({ seat, stack })),
      button,
      dealRng: mulberry32(dealSeed),
      decisionRng,
      playerAt: (seat) => players[(seat + r) % n],
      profile: current,
      heroSeat,
    });
    for (let p = 0; p < n; p += 1) nets[p] += state.result.net[seatOf(p)];
    if (subject !== null && current) current = accumulateProfile(current, heroSeat, events);
    if (onHand) onHand(events, seatOf);
  }
  return { nets, hands: n, profile: current };
}

// src/private/trainers/poker/engine/handState.js
// Event-sourced No-Limit Hold'em hand. Amounts are integer units (1 unit = 0.5 BB).
import { evaluate } from './evaluator.js';
import { buildPots, awardPots } from './pots.js';

/**
 * @typedef {{type:'start', seats:{seat:number, stack:number}[], button:number, sb:number, bb:number}} StartEvent
 * @typedef {{type:'hole', seat:number, cards:number[]}} HoleEvent
 * @typedef {{type:'board', cards:number[]}} BoardEvent
 * @typedef {{type:'act', seat:number, action:'fold'|'check'|'call'|'bet'|'raise', amount?:number}} ActEvent
 * @typedef {StartEvent|HoleEvent|BoardEvent|ActEvent} HandEvent
 */

export const MAX_SEATS = 6;
const NEXT_STREET = { preflop: 'flop', flop: 'turn', turn: 'river' };
const BOARD_SIZE = { flop: 3, turn: 4, river: 5 };

export class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new EngineError(code, message);
};

const playerAt = (s, seat) => s.players.find((p) => p.seat === seat) ?? fail('BAD_SEAT', `no player in seat ${seat}`);

/** @param {HandEvent[]} events */
export function reduceHand(events) {
  return events.reduce(applyEvent, null);
}

/** Returns a new state; never mutates `state`. */
export function applyEvent(state, event) {
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    fail('BAD_EVENT', 'event must be an object with a string type');
  }
  if (event.type === 'start') {
    if (state) fail('BAD_EVENT', 'start must be the first event');
    return startHand(event);
  }
  if (!state) fail('BAD_EVENT', 'hand has not started');
  if (state.street === 'complete') fail('BAD_EVENT', 'hand is complete');
  const draft = { ...state, board: state.board.slice(), players: state.players.map((p) => ({ ...p })) };
  if (event.type === 'hole') dealHole(draft, event);
  else if (event.type === 'board') dealBoard(draft, event);
  else if (event.type === 'act') act(draft, event);
  else fail('BAD_EVENT', `unknown event type ${event.type}`);
  return draft;
}

// legalActions(state) -> null | { seat, canCheck, toCall, canRaise,
//   raiseKind: 'bet'|'raise', minRaiseTo: number|null, maxRaiseTo: number|null }
// minRaiseTo/maxRaiseTo are null whenever canRaise is false.
export function legalActions(s) {
  if (!s || s.toAct === null) return null;
  const p = playerAt(s, s.toAct);
  const maxRaiseTo = p.committed + p.stack;
  const othersCanRespond = s.players.some((q) => q !== p && !q.folded && !q.allIn);
  const match = amountToMatch(s, p);
  const canRaise = !p.acted && othersCanRespond && maxRaiseTo > s.currentBet;
  return {
    seat: p.seat,
    canCheck: match <= p.committed,
    toCall: Math.min(Math.max(match - p.committed, 0), p.stack),
    canRaise,
    raiseKind: s.currentBet === 0 ? 'bet' : 'raise',
    minRaiseTo: canRaise ? Math.min(s.currentBet + s.minRaise, maxRaiseTo) : null,
    maxRaiseTo: canRaise ? maxRaiseTo : null,
  };
}

// The amount `p` must match to continue. Normally `s.currentBet`, but if no
// other live player could still put in more chips (all remaining opponents
// are folded or all-in), a short all-in blind/bet cannot force real action:
// the amount to match is capped at the highest commitment among the others.
function amountToMatch(s, p) {
  const others = s.players.filter((q) => q !== p && !q.folded);
  const someoneCanRespond = others.some((q) => !q.allIn);
  if (someoneCanRespond) return s.currentBet;
  const highestOther = others.reduce((max, q) => Math.max(max, q.committed), 0);
  return Math.min(s.currentBet, highestOther);
}

/** Seats clockwise starting left of the button. */
export function seatsFromButton(s) {
  const i = s.players.findIndex((p) => p.seat === s.button);
  return s.players.map((_, k) => s.players[(i + 1 + k) % s.players.length].seat);
}

function startHand({ seats, button, sb, bb }) {
  if (!Array.isArray(seats) || seats.length < 2 || seats.length > MAX_SEATS) fail('BAD_EVENT', 'need 2-6 seats');
  if (seats.some((x) => !x || typeof x !== 'object')) fail('BAD_EVENT', 'seats must be objects');
  const ids = seats.map((x) => x.seat);
  if (new Set(ids).size !== ids.length || ids.some((x) => !Number.isInteger(x) || x < 0 || x >= MAX_SEATS)) {
    fail('BAD_EVENT', 'seats must be distinct integers 0-5');
  }
  if (seats.some((x) => !Number.isInteger(x.stack) || x.stack <= 0)) fail('BAD_EVENT', 'stacks must be positive integers');
  if (!ids.includes(button)) fail('BAD_EVENT', 'button must be an occupied seat');
  if (!Number.isInteger(sb) || !Number.isInteger(bb) || sb <= 0 || bb < sb) fail('BAD_EVENT', 'bad blinds');

  const players = seats
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map(({ seat, stack }) => ({ seat, stack, committed: 0, total: 0, folded: false, allIn: false, acted: false, hole: null }));
  const s = {
    sb, bb, button, sbSeat: 0, bbSeat: 0,
    street: 'preflop', board: [], players,
    currentBet: bb, minRaise: bb, toAct: null, needsBoard: null, result: null,
  };
  s.sbSeat = players.length === 2 ? button : seatAfter(s, button);
  s.bbSeat = seatAfter(s, s.sbSeat);
  post(playerAt(s, s.sbSeat), sb);
  post(playerAt(s, s.bbSeat), bb);
  return s;
}

function seatAfter(s, seat) {
  const i = s.players.findIndex((p) => p.seat === seat);
  return s.players[(i + 1) % s.players.length].seat;
}

function post(p, amount) {
  const pay = Math.min(amount, p.stack);
  p.stack -= pay;
  p.committed += pay;
  p.total += pay;
  if (p.stack === 0) p.allIn = true;
}

function checkCards(s, cards, count) {
  if (!Array.isArray(cards) || cards.length !== count || cards.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) {
    fail('BAD_EVENT', `expected ${count} cards`);
  }
  const used = new Set(s.board);
  for (const p of s.players) if (p.hole) p.hole.forEach((c) => used.add(c));
  for (const c of cards) {
    if (used.has(c)) fail('DUPLICATE_CARD', `card ${c} already dealt`);
    used.add(c);
  }
}

function dealHole(s, { seat, cards }) {
  if (s.players.every((p) => p.hole)) fail('BAD_EVENT', 'hole cards already dealt');
  const p = playerAt(s, seat);
  if (p.hole) fail('BAD_EVENT', `seat ${seat} already has hole cards`);
  checkCards(s, cards, 2);
  p.hole = cards.slice();
  if (s.players.every((q) => q.hole)) beginAction(s, s.bbSeat);
}

function dealBoard(s, { cards }) {
  if (!s.needsBoard) fail('BAD_EVENT', 'no board cards expected');
  checkCards(s, cards, BOARD_SIZE[s.needsBoard] - s.board.length);
  s.board.push(...cards);
  s.needsBoard = null;
  beginAction(s, s.button);
}

function needsToAct(s, p) {
  if (p.folded || p.allIn) return false;
  if (p.committed < amountToMatch(s, p)) return true;
  if (p.acted) return false;
  return s.players.some((q) => q !== p && !q.folded && !q.allIn);
}

function nextToAct(s, afterSeat) {
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.seat === afterSeat);
  for (let k = 1; k <= n; k += 1) {
    const p = s.players[(start + k) % n];
    if (needsToAct(s, p)) return p.seat;
  }
  return null;
}

// Hands the turn to the next player after `afterSeat`, or closes the street if nobody must act.
function beginAction(s, afterSeat) {
  s.toAct = nextToAct(s, afterSeat);
  if (s.toAct === null) closeStreet(s);
}

function act(s, { seat, action, amount }) {
  if (s.toAct === null) fail('HAND_NOT_READY', 'no action expected now');
  if (seat !== s.toAct) fail('NOT_YOUR_TURN', `seat ${s.toAct} is to act`);
  // A stored log may round-trip a missing amount as null; accept null and undefined alike.
  if ((action === 'fold' || action === 'check' || action === 'call') && amount != null) {
    fail('BAD_AMOUNT', `${action} does not take an amount`);
  }
  const legal = legalActions(s);
  const p = playerAt(s, seat);
  if (action === 'fold') {
    p.folded = true;
  } else if (action === 'check') {
    if (!legal.canCheck) fail('ILLEGAL_ACTION', 'cannot check facing a bet');
  } else if (action === 'call') {
    if (legal.canCheck) fail('ILLEGAL_ACTION', 'nothing to call');
    post(p, legal.toCall);
  } else if (action === 'bet' || action === 'raise') {
    raise(s, p, legal, action, amount);
  } else {
    fail('ILLEGAL_ACTION', `unknown action ${action}`);
  }
  p.acted = true;
  const live = s.players.filter((q) => !q.folded);
  if (live.length === 1) {
    finishByFold(s, live[0]);
    return;
  }
  beginAction(s, seat);
}

function raise(s, p, legal, action, amount) {
  if (action !== legal.raiseKind) fail('ILLEGAL_ACTION', `use ${legal.raiseKind}`);
  if (!legal.canRaise) fail('ILLEGAL_ACTION', 'raising is not allowed');
  if (!Number.isInteger(amount) || amount > legal.maxRaiseTo || amount <= s.currentBet) {
    fail('BAD_AMOUNT', 'invalid raise amount');
  }
  if (amount < legal.minRaiseTo) fail('BELOW_MIN_RAISE', `minimum is ${legal.minRaiseTo}`);
  const size = amount - s.currentBet;
  post(p, amount - p.committed);
  if (size >= s.minRaise) {
    s.minRaise = size;
    for (const q of s.players) if (q !== p) q.acted = false;
  }
  s.currentBet = amount;
}

function returnUncalled(s) {
  const byCommit = s.players.slice().sort((a, b) => b.committed - a.committed);
  const excess = byCommit[0].committed - byCommit[1].committed;
  if (excess <= 0) return;
  const top = byCommit[0];
  top.committed -= excess;
  top.total -= excess;
  top.stack += excess;
  top.allIn = false;
}

function closeStreet(s) {
  returnUncalled(s);
  s.toAct = null;
  for (const p of s.players) {
    p.committed = 0;
    p.acted = false;
  }
  s.currentBet = 0;
  s.minRaise = s.bb;
  if (s.street === 'river') {
    showdown(s);
    return;
  }
  s.street = NEXT_STREET[s.street];
  s.needsBoard = s.street;
}

function finish(s, result) {
  const net = {};
  for (const p of s.players) net[p.seat] = (result.awards[p.seat] ?? 0) - p.total;
  s.result = { ...result, net };
  s.street = 'complete';
  s.toAct = null;
  s.needsBoard = null;
}

function finishByFold(s, winner) {
  returnUncalled(s);
  const amount = s.players.reduce((sum, p) => sum + p.total, 0);
  winner.stack += amount;
  finish(s, {
    showdown: false,
    pots: [{ amount, eligible: [winner.seat], winners: [winner.seat] }],
    awards: { [winner.seat]: amount },
    shown: [],
  });
}

function showdown(s) {
  const live = s.players.filter((p) => !p.folded);
  const scores = {};
  for (const p of live) scores[p.seat] = evaluate([...p.hole, ...s.board]);
  const pots = buildPots(s.players.map((p) => ({ seat: p.seat, total: p.total, folded: p.folded })));
  const { pots: awarded, awards } = awardPots(pots, (seat) => scores[seat], seatsFromButton(s));
  for (const p of s.players) p.stack += awards[p.seat] ?? 0;
  finish(s, { showdown: true, pots: awarded, awards, shown: live.map((p) => p.seat), scores });
}

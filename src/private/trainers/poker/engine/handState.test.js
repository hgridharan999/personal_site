// src/private/trainers/poker/engine/handState.test.js
import { describe, it, expect } from 'vitest';
import { parseCards } from './cards.js';
import { applyEvent, reduceHand, legalActions, seatsFromButton, EngineError } from './handState.js';

const HOLES6 = ['AhAd', 'KhKd', 'QhQd', 'JhJd', 'ThTd', '9h9d'];

function setup(stacks, holes, button = 0) {
  let s = applyEvent(null, { type: 'start', button, sb: 1, bb: 2, seats: stacks.map((stack, seat) => ({ seat, stack })) });
  holes.forEach((h, seat) => { s = applyEvent(s, { type: 'hole', seat, cards: parseCards(h) }); });
  return s;
}
const act = (s, seat, action, amount) => applyEvent(s, { type: 'act', seat, action, amount });
const board = (s, text) => applyEvent(s, { type: 'board', cards: parseCards(text) });
const stackSum = (s) => s.players.reduce((sum, p) => sum + p.stack, 0);
function codeOf(fn) {
  try { fn(); } catch (e) { return e instanceof EngineError ? e.code : `not EngineError: ${e.message}`; }
  return null;
}

describe('hand state', () => {
  it('posts blinds and starts action left of the big blind', () => {
    const s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    expect([s.sbSeat, s.bbSeat, s.toAct]).toEqual([1, 2, 3]);
    expect(s.players[1]).toMatchObject({ stack: 199, committed: 1, total: 1 });
    expect(s.players[2]).toMatchObject({ stack: 198, committed: 2, total: 2 });
    expect(legalActions(s)).toEqual({ seat: 3, canCheck: false, toCall: 2, canRaise: true, raiseKind: 'raise', minRaiseTo: 4, maxRaiseTo: 200 });
    expect(seatsFromButton(s)).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it('heads-up: button posts small blind, acts first preflop and last postflop', () => {
    let s = setup([200, 200], ['AhAd', 'KhKd']);
    expect([s.sbSeat, s.bbSeat, s.toAct]).toEqual([0, 1, 0]);
    s = act(s, 0, 'call');
    s = act(s, 1, 'check');
    expect([s.street, s.needsBoard, s.toAct]).toEqual(['flop', 'flop', null]);
    s = board(s, '2c7s9d');
    expect(s.toAct).toBe(1);
  });

  it('awards the blinds to the big blind when everyone folds, returning the uncalled chip', () => {
    let s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    for (const seat of [3, 4, 5, 0, 1]) s = act(s, seat, 'fold');
    expect(s.street).toBe('complete');
    expect(s.players[2].stack).toBe(201);
    expect(s.result).toMatchObject({ showdown: false, awards: { 2: 2 }, shown: [] });
    expect(s.result.net).toEqual({ 0: 0, 1: -1, 2: 1, 3: 0, 4: 0, 5: 0 });
    expect(stackSum(s)).toBe(1200);
  });

  it('enforces the minimum raise', () => {
    let s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    s = act(s, 3, 'raise', 6);
    expect(legalActions(s).minRaiseTo).toBe(10);
    expect(codeOf(() => act(s, 4, 'raise', 9))).toBe('BELOW_MIN_RAISE');
    s = act(s, 4, 'raise', 10);
    expect(legalActions(s).minRaiseTo).toBe(14);
  });

  it('gives the big blind an option after limps', () => {
    let s = setup([200, 200, 200], HOLES6.slice(0, 3));
    expect(s.toAct).toBe(0);
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    expect(legalActions(s)).toMatchObject({ seat: 2, canCheck: true, canRaise: true });
    s = act(s, 2, 'check');
    expect([s.street, s.needsBoard]).toEqual(['flop', 'flop']);
    s = board(s, '2c7s8d');
    expect(legalActions(s)).toMatchObject({ seat: 1, raiseKind: 'bet', minRaiseTo: 2, canCheck: true });
  });

  it('does not reopen betting after an incomplete all-in raise', () => {
    let s = setup([200, 200, 16], HOLES6.slice(0, 3));
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    s = act(s, 2, 'check');
    s = board(s, '2c7s8d');
    s = act(s, 1, 'bet', 10);
    expect(legalActions(s)).toMatchObject({ seat: 2, minRaiseTo: 14, maxRaiseTo: 14, canRaise: true });
    s = act(s, 2, 'raise', 14);
    expect(legalActions(s)).toMatchObject({ seat: 0, canRaise: true, minRaiseTo: 24 });
    s = act(s, 0, 'call');
    expect(legalActions(s)).toMatchObject({ seat: 1, canRaise: false, toCall: 4 });
    expect(codeOf(() => act(s, 1, 'raise', 30))).toBe('ILLEGAL_ACTION');
    s = act(s, 1, 'call');
    expect([s.street, s.needsBoard]).toEqual(['turn', 'turn']);
  });

  it('reopens betting after a full raise', () => {
    let s = setup([200, 200, 100], HOLES6.slice(0, 3));
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    s = act(s, 2, 'check');
    s = board(s, '2c7s8d');
    s = act(s, 1, 'bet', 10);
    s = act(s, 2, 'raise', 20);
    s = act(s, 0, 'call');
    expect(legalActions(s)).toMatchObject({ seat: 1, canRaise: true, minRaiseTo: 30, toCall: 10 });
  });

  it('forbids raising when nobody else can respond', () => {
    let s = setup([200, 50], ['AhAd', 'KhKd']);
    s = act(s, 0, 'call');
    s = act(s, 1, 'raise', 50);
    expect(legalActions(s)).toMatchObject({ seat: 0, canRaise: false, toCall: 48 });
  });

  it('runs out the board after all-ins and builds side pots', () => {
    let s = setup([50, 100, 200], ['AhAd', 'KhKd', 'QhQd']);
    s = act(s, 0, 'raise', 50);
    s = act(s, 1, 'raise', 100);
    s = act(s, 2, 'call');
    expect([s.street, s.needsBoard, s.toAct]).toEqual(['flop', 'flop', null]);
    s = board(s, '2c7s9d');
    expect(s.needsBoard).toBe('turn');
    s = board(s, 'Ts');
    expect(s.needsBoard).toBe('river');
    s = board(s, '3c');
    expect(s.street).toBe('complete');
    expect(s.result.pots).toEqual([
      { amount: 150, eligible: [0, 1, 2], winners: [0] },
      { amount: 100, eligible: [1, 2], winners: [1] },
    ]);
    expect(s.players.map((p) => p.stack)).toEqual([150, 100, 100]);
    expect(s.result.net).toEqual({ 0: 100, 1: 0, 2: -100 });
    expect(s.result.shown).toEqual([0, 1, 2]);
  });

  it('splits a tied pot and gives the odd unit to the first winner left of the button', () => {
    let s = setup([200, 200, 200], ['2c3d', 'KhKd', '2d3c']);
    s = act(s, 0, 'call');
    s = act(s, 1, 'fold');
    s = act(s, 2, 'check');
    s = board(s, 'AhAsKs');
    s = act(s, 2, 'check');
    s = act(s, 0, 'check');
    s = board(s, 'Qs');
    s = act(s, 2, 'check');
    s = act(s, 0, 'check');
    s = board(s, 'Jh');
    s = act(s, 2, 'check');
    s = act(s, 0, 'check');
    expect(s.result.awards).toEqual({ 2: 3, 0: 2 });
    expect(s.players.map((p) => p.stack)).toEqual([200, 199, 201]);
  });

  it('posts a short blind all-in', () => {
    const s = setup([200, 1, 200], HOLES6.slice(0, 3));
    expect(s.players[1]).toMatchObject({ stack: 0, allIn: true, committed: 1 });
    expect(s.toAct).toBe(0);
  });

  it('rejects illegal events with codes', () => {
    const fresh = applyEvent(null, { type: 'start', button: 0, sb: 1, bb: 2, seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 200 }] });
    expect(codeOf(() => act(fresh, 0, 'call'))).toBe('HAND_NOT_READY');
    const one = applyEvent(fresh, { type: 'hole', seat: 0, cards: parseCards('AhAd') });
    expect(codeOf(() => applyEvent(one, { type: 'hole', seat: 1, cards: parseCards('AhKd') }))).toBe('DUPLICATE_CARD');
    const s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    expect(codeOf(() => act(s, 4, 'fold'))).toBe('NOT_YOUR_TURN');
    expect(codeOf(() => act(s, 3, 'check'))).toBe('ILLEGAL_ACTION');
    expect(codeOf(() => act(s, 3, 'bet', 6))).toBe('ILLEGAL_ACTION');
    expect(codeOf(() => act(s, 3, 'raise', 500))).toBe('BAD_AMOUNT');
    expect(codeOf(() => board(s, '2c7s8d'))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(s, { type: 'start', button: 0, sb: 1, bb: 2, seats: [] }))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(null, { type: 'start', button: 3, sb: 1, bb: 2, seats: [{ seat: 0, stack: 5 }, { seat: 1, stack: 5 }] }))).toBe('BAD_EVENT');
  });

  it('never mutates the previous state and replays identically', () => {
    const events = [
      { type: 'start', button: 0, sb: 1, bb: 2, seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 200 }, { seat: 2, stack: 200 }] },
      { type: 'hole', seat: 0, cards: parseCards('AhAd') },
      { type: 'hole', seat: 1, cards: parseCards('KhKd') },
      { type: 'hole', seat: 2, cards: parseCards('QhQd') },
    ];
    const s1 = reduceHand(events);
    const s2 = act(s1, 0, 'fold');
    expect(s1.players[0].folded).toBe(false);
    expect(s1.toAct).toBe(0);
    expect(s2.toAct).toBe(1);
    expect(reduceHand([...events, { type: 'act', seat: 0, action: 'fold' }])).toEqual(s2);
  });
});

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
    expect(legalActions(s)).toMatchObject({ seat: 1, canRaise: false, toCall: 4, minRaiseTo: null, maxRaiseTo: null });
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
    expect(legalActions(s)).toMatchObject({ seat: 0, canRaise: false, toCall: 48, minRaiseTo: null, maxRaiseTo: null });
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

  it('builds side pots for three distinct all-ins, one of them from a folder', () => {
    // 4-handed, button 0: sbSeat 1, bbSeat 2, first to act (left of BB) is seat 3.
    // Stacks: [0]=20, [1]=150, [2]=400, [3]=60. sb=1, bb=2.
    let s = setup([20, 150, 400, 60], ['AhAd', 'KhKd', '2c3d', 'QhQd']);
    expect(s.toAct).toBe(3);

    // 1. Seat 3 raises all-in to 60 (currentBet 2 -> 60, size 58 >= minRaise 2: a full raise,
    //    reopening action; minRaise becomes 58).
    s = act(s, 3, 'raise', 60);
    // 2. Seat 0 calls all-in for its remaining 20 (toCall = min(60, 20) = 20).
    s = act(s, 0, 'call');
    // 3. Seat 1 raises all-in to 150. minRaiseTo = min(currentBet 60 + minRaise 58, maxRaiseTo 150)
    //    = min(118, 150) = 118, so 150 is legal (>= 118, <= maxRaiseTo 150). This is again a full
    //    raise (size 90 >= 58), reopening action for seat 2 (seat 0 and seat 3 are already all-in).
    expect(legalActions(s)).toMatchObject({ seat: 1, canRaise: true, minRaiseTo: 118, maxRaiseTo: 150 });
    s = act(s, 1, 'raise', 150);
    // 4. Seat 2 folds, forfeiting the 2 (its posted big blind). Nobody live can act further
    //    (seat 0 and seat 3 are all-in, seat 1 has nobody left to respond to), so the street
    //    closes: seat 1's 150 is uncalled beyond the next-highest total (60), so 90 returns to
    //    seat 1, leaving seat 1 with stack 90 and total 60.
    s = act(s, 2, 'fold');
    expect([s.toAct, s.street, s.needsBoard]).toEqual([null, 'flop', 'flop']);
    expect(s.players[1]).toMatchObject({ stack: 90, total: 60, committed: 0 });

    // Nobody left can bet (seat 0/3 all-in, seat 2 folded, seat 1 has no live opponent who can
    // still add chips), so the board runs out with no further action events.
    s = board(s, '7s8s9c');
    s = board(s, 'Tc');
    s = board(s, '2h');
    expect(s.street).toBe('complete');

    // Totals at showdown: seat0=20, seat1=60 (after the 90 return), seat2=2 (folded blind),
    // seat3=60. buildPots over levels [2, 20, 60]:
    //  - level 2: 4 x 2 = 8, eligible (not folded, total>=2) = [0,1,3]
    //  - level 20: seat0 contributes 18, seat1 18, seat2 0 (capped, folded), seat3 18 = 54,
    //    eligible [0,1,3] again -> merges with the first pot: main pot = 8+54 = 62, eligible [0,1,3]
    //  - level 60: seat1 contributes 40, seat3 40 (seat0 capped at 20, seat2 capped+folded) = 80,
    //    eligible (total>=60, not folded) = [1,3] -> a new side pot of 80
    // Total pot = 62 + 80 = 142 = 20 + 60 + 2 + 60 (every chip put in this hand).
    // Board 7s 8s 9c Tc 2h gives every live hand only a pocket pair (no straight: ranks are
    // 7,8,9,T + hole rank, no 6 or J; no flush: only two spades on board). So seat0 (AA) beats
    // seat1 (KK) beats seat3 (QQ) at every rank comparison.
    //  - main pot [0,1,3]: seat0's AA is best among {AA, KK, QQ} -> seat0 wins 62.
    //  - side pot [1,3]: seat0 is not eligible; KK beats QQ -> seat1 wins 80.
    expect(s.result.showdown).toBe(true);
    expect(s.result.pots).toEqual([
      { amount: 62, eligible: [0, 1, 3], winners: [0] },
      { amount: 80, eligible: [1, 3], winners: [1] },
    ]);
    // Final stacks: seat0 = 0 (all-in) + 62 = 62; seat1 = 90 (post-return) + 80 = 170;
    // seat2 = 398 (400 - 2 bb, never returned since folded) + 0 = 398; seat3 = 0 + 0 = 0.
    // Total: 62 + 170 + 398 + 0 = 630 = 20 + 150 + 400 + 60 (every stack at the table).
    expect(s.players.map((p) => p.stack)).toEqual([62, 170, 398, 0]);
    // net = award - total contributed this hand: seat0 62-20=42, seat1 80-60=20,
    // seat2 0-2=-2, seat3 0-60=-60. Sums to 0.
    expect(s.result.net).toEqual({ 0: 42, 1: 20, 2: -2, 3: -60 });
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(630);
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

  it('posts a short big blind all-in', () => {
    const s = setup([200, 1, 200], HOLES6.slice(0, 3));
    expect(s.players[1]).toMatchObject({ stack: 0, allIn: true, committed: 1 });
    expect(s.toAct).toBe(0);
  });

  it('does not force action on a short all-in big blind when nobody else can respond (heads-up)', () => {
    let s = applyEvent(null, {
      type: 'start',
      seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 1 }],
      button: 0,
      sb: 1,
      bb: 2,
    });
    s = applyEvent(s, { type: 'hole', seat: 0, cards: parseCards('AhAd') });
    s = applyEvent(s, { type: 'hole', seat: 1, cards: parseCards('KhKd') });
    expect(s.toAct).toBeNull();
    expect(s.street).toBe('flop');
    expect(s.needsBoard).toBe('flop');
    s = board(s, '2c7s9d');
    s = board(s, 'Ts');
    s = board(s, '3c');
    expect(s.street).toBe('complete');
    expect(stackSum(s)).toBe(201);
  });

  it('does not force action on a short all-in big blind when nobody else can respond (3-handed)', () => {
    let s = setup([200, 200, 1], HOLES6.slice(0, 3));
    s = act(s, 0, 'fold');
    expect(s.toAct).toBeNull();
    expect(s.needsBoard).toBe('flop');
  });

  it('still requires the full big blind multi-way even with a short all-in blind', () => {
    const s = setup([200, 200, 1], HOLES6.slice(0, 3));
    expect(legalActions(s)).toMatchObject({ seat: 0, toCall: 2 });
  });

  it('rejects malformed events with BAD_EVENT instead of throwing a raw TypeError', () => {
    expect(codeOf(() => applyEvent(null, null))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(null, undefined))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(null, 'nope'))).toBe('BAD_EVENT');
    const s = setup([200, 200], ['AhAd', 'KhKd']);
    expect(codeOf(() => applyEvent(s, null))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(s, undefined))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(s, {}))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(null, {
      type: 'start',
      button: 0,
      sb: 1,
      bb: 2,
      seats: [{ seat: 0, stack: 200 }, null],
    }))).toBe('BAD_EVENT');
  });

  it('rejects an amount on fold, check or call, but accepts null or undefined', () => {
    let s = setup([200, 200], ['AhAd', 'KhKd']);
    expect(codeOf(() => applyEvent(s, { type: 'act', seat: 0, action: 'call', amount: 1 }))).toBe('BAD_AMOUNT');
    expect(codeOf(() => applyEvent(s, { type: 'act', seat: 0, action: 'fold', amount: 0 }))).toBe('BAD_AMOUNT');
    // A stored log may round-trip a missing amount as null; that must be accepted like undefined.
    s = act(s, 0, 'call', null);
    expect(s.players[0].committed).toBe(2);
    s = act(s, 1, 'check', undefined);
    expect(s.street).toBe('flop');
  });

  it('returns uncalled chips when a street closes on an all-in call', () => {
    let s = setup([200, 50], ['AhAd', 'KhKd']);
    s = act(s, 0, 'raise', 200);
    s = act(s, 1, 'call');
    expect(s.needsBoard).toBe('flop');
    expect(s.players[0].stack).toBe(150);
    expect(s.players[0].total).toBe(50);
  });

  it('rejects a board card that duplicates a hole card', () => {
    let s = setup([200, 200], ['AhAd', 'KhKd']);
    s = act(s, 0, 'call');
    s = act(s, 1, 'check');
    expect(codeOf(() => board(s, 'Ah7s9d'))).toBe('DUPLICATE_CARD');
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

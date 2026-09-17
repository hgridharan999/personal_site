// src/private/trainers/poker/bots/situation.test.js
import { describe, it, expect } from 'vitest';
import { applyEvent } from '../engine/handState.js';
import { hasChart } from './charts.js';
import { positionsOf, actsByStreet, preflopSpot, chartKeyFor, postflopContext, potOf } from './situation.js';
import { contextAfter } from './testHands.js';

const spotFor = (steps) => {
  const c = contextAfter(steps);
  return preflopSpot(c.view, actsByStreet(c.seatEvents).preflop, c.seat);
};

describe('positionsOf', () => {
  it('labels 6, 4 and 2 handed tables', () => {
    const six = applyEvent(null, { type: 'start', button: 5, sb: 1, bb: 2, seats: [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 200 })) });
    expect(positionsOf(six)).toEqual({ 0: 'SB', 1: 'BB', 2: 'UTG', 3: 'HJ', 4: 'CO', 5: 'BTN' });
    const four = applyEvent(null, { type: 'start', button: 1, sb: 1, bb: 2, seats: [1, 2, 4, 5].map((seat) => ({ seat, stack: 200 })) });
    expect(positionsOf(four)).toEqual({ 2: 'SB', 4: 'BB', 5: 'CO', 1: 'BTN' });
    const two = applyEvent(null, { type: 'start', button: 3, sb: 1, bb: 2, seats: [0, 3].map((seat) => ({ seat, stack: 200 })) });
    expect(positionsOf(two)).toEqual({ 3: 'SB', 0: 'BB' });
  });
});

describe('preflopSpot and chartKeyFor', () => {
  it('first in is an open', () => {
    const spot = spotFor([]);
    expect(spot).toMatchObject({ kind: 'open', position: 'UTG', raises: 0 });
    expect(chartKeyFor(spot, hasChart)).toBe('open.UTG');
  });

  it('facing a single raise is vsOpen, with a caller it is a squeeze', () => {
    const vsOpen = spotFor(['r 2 5', 'f 3']);
    expect(vsOpen).toMatchObject({ kind: 'vsOpen', position: 'CO', raiserPosition: 'UTG', ip: true });
    expect(chartKeyFor(vsOpen, hasChart)).toBe('vsOpen.CO.UTG');
    const squeeze = spotFor(['r 2 5', 'c 3', 'f 4']);
    expect(squeeze).toMatchObject({ kind: 'squeeze', position: 'BTN', callers: 1 });
    expect(chartKeyFor(squeeze, hasChart)).toBe('squeeze.BTN');
  });

  it('the opener facing a 3-bet is vs3bet with position relative to the 3-bettor', () => {
    const oop = spotFor(['r 2 5', 'f 3', 'f 4', 'r 5 15', 'f 0', 'f 1']);
    expect(oop).toMatchObject({ kind: 'vs3bet', position: 'UTG', ip: false });
    expect(chartKeyFor(oop, hasChart)).toBe('vs3bet.UTG.oop');
    const ip = spotFor(['f 2', 'f 3', 'r 4 5', 'f 5', 'f 0', 'r 1 18']);
    expect(ip).toMatchObject({ kind: 'vs3bet', position: 'CO', ip: true });
    expect(chartKeyFor(ip, hasChart)).toBe('vs3bet.CO.ip');
  });

  it('a player facing a 3-bet they made no raise in is coldVs3bet, on the vs4bet chart', () => {
    const cold = spotFor(['r 2 5', 'r 3 15']);
    expect(cold).toMatchObject({ kind: 'coldVs3bet', position: 'CO', raises: 2, raiserPosition: 'HJ', ip: true });
    expect(chartKeyFor(cold, hasChart)).toBe('vs4bet.ip');
    const blind = spotFor(['r 2 5', 'r 3 15', 'f 4', 'f 5', 'f 0']);
    expect(blind).toMatchObject({ kind: 'coldVs3bet', position: 'BB', ip: false });
    expect(chartKeyFor(blind, hasChart)).toBe('vs4bet.oop');
    // The caller of the open, squeezed by a later 3-bet, never raised either.
    const squeezed = spotFor(['r 2 5', 'c 3', 'r 4 20', 'f 5', 'f 0', 'f 1', 'f 2']);
    expect(squeezed).toMatchObject({ kind: 'coldVs3bet', position: 'HJ', ip: false });
    expect(chartKeyFor(squeezed, hasChart)).toBe('vs4bet.oop');
  });

  it('any 4-bet is vs4bet', () => {
    const fourBet = spotFor(['r 2 5', 'f 3', 'f 4', 'r 5 15', 'f 0', 'f 1', 'r 2 40']);
    expect(fourBet.kind).toBe('vs4bet');
    expect(chartKeyFor(fourBet, hasChart)).toBe('vs4bet.ip');
  });

  it('limps give vsLimp; an unknown vsOpen pairing falls back to a squeeze chart', () => {
    const limp = spotFor(['c 2', 'f 3']);
    expect(limp).toMatchObject({ kind: 'vsLimp', limpers: 1, position: 'CO' });
    expect(chartKeyFor(limp, hasChart)).toBe('vsLimp.CO');
    const limpRaised = spotFor(['c 2', 'r 3 8', 'f 4', 'f 5', 'f 0', 'f 1']);
    expect(limpRaised).toMatchObject({ kind: 'vsOpen', position: 'UTG', raiserPosition: 'HJ' });
    expect(chartKeyFor(limpRaised, hasChart)).toBe('squeeze.CO');
  });
});

describe('potOf', () => {
  it('sums the chips every player committed this hand, folded players included', () => {
    const c = contextAfter(['r 2 5', 'c 3', 'f 4']);
    expect(potOf(c.view)).toBe(1 + 2 + 5 + 5);
  });
});

describe('postflopContext', () => {
  it('reads pot, opponents, position, aggressor and SPR on the flop', () => {
    const c = contextAfter(['r 2 5', 'f 3', 'f 4', 'c 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1']);
    expect(c.seat).toBe(2);
    const ctx = postflopContext(c.view, c.seatEvents, c.seat, c.legal);
    expect(ctx).toMatchObject({ street: 'flop', pot: 16, toCall: 0, stack: 195, nOpp: 2, ip: false, aggressor: true, betsThisStreet: 0, pfAggressor: 2 });
    expect(ctx.spr).toBeCloseTo(195 / 16, 10);
  });

  it('the button facing a bet is in position and not the aggressor', () => {
    const c = contextAfter(['r 2 5', 'f 3', 'f 4', 'c 5', 'f 0', 'f 1', 'B Kh8d4s', 'b 2 8']);
    const ctx = postflopContext(c.view, c.seatEvents, c.seat, c.legal);
    expect(ctx).toMatchObject({ street: 'flop', pot: 21, toCall: 8, nOpp: 1, ip: true, aggressor: false, betsThisStreet: 1 });
  });
});

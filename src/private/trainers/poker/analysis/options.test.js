import { describe, it, expect } from 'vitest';
import { reduceHand } from '../engine/handState.js';
import { buildLog, contextAfter } from '../bots/testHands.js';
import { SIZE_FRACTIONS, optionKey, parseOptionKey, optionsFor } from './options.js';

const keys = (list) => list.map((o) => o.key);
// Six seats, button 5: SB 0, BB 1, UTG 2, HJ 3, CO 4, BTN 5. The BTN opens to 5 and the BB calls.
const FLOP = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s'];

describe('option keys', () => {
  it('formats and parses keys', () => {
    expect(SIZE_FRACTIONS).toEqual([1 / 3, 1 / 2, 3 / 4, 1]);
    expect(optionKey('fold')).toBe('fold');
    expect(optionKey('call', null)).toBe('call');
    expect(optionKey('raise', 24)).toBe('raise:24');
    expect(parseOptionKey('bet:11')).toEqual({ action: 'bet', size: 11 });
    expect(parseOptionKey('check')).toEqual({ action: 'check', size: null });
  });
});

describe('optionsFor', () => {
  it('bets 1/3, 1/2, 3/4 and pot of the pot, then all-in, when checking is free', () => {
    const { state } = contextAfter(FLOP); // BB to act, pot 11, stack 195
    const options = optionsFor(state);
    expect(keys(options)).toEqual(['check', 'bet:4', 'bet:6', 'bet:8', 'bet:11', 'bet:195']);
    expect(options[1]).toEqual({ key: 'bet:4', action: 'bet', size: 4 });
  });

  it('adds fold and sizes raises from the pot after calling', () => {
    const { state } = contextAfter([...FLOP, 'b 1 4']); // BTN faces 4 into 15
    expect(keys(optionsFor(state))).toEqual(['fold', 'call', 'raise:10', 'raise:14', 'raise:18', 'raise:23', 'raise:195']);
  });

  it('uses the given standard size preflop, keeps the chosen size and drops duplicates', () => {
    const { state } = contextAfter([]); // UTG, pot 3, 200 behind
    expect(keys(optionsFor(state, { preflopRaiseTo: 5 }))).toEqual(['fold', 'call', 'raise:5', 'raise:200']);
    expect(keys(optionsFor(state, { preflopRaiseTo: 5, chosen: { action: 'raise', amount: 7 } })))
      .toEqual(['fold', 'call', 'raise:5', 'raise:200', 'raise:7']);
    expect(keys(optionsFor(state, { preflopRaiseTo: 5, chosen: { action: 'raise', amount: 5 } })))
      .toEqual(['fold', 'call', 'raise:5', 'raise:200']);
    expect(keys(optionsFor(state))).toEqual(['fold', 'call', 'raise:200']);
  });

  it('offers check and raises to the big blind when limpers let it check', () => {
    const { state } = contextAfter(['c 2', 'f 3', 'f 4', 'f 5', 'f 0']);
    expect(keys(optionsFor(state, { preflopRaiseTo: 8, chosen: { action: 'check' } }))).toEqual(['check', 'raise:8', 'raise:200']);
    expect(keys(optionsFor(state, { chosen: { action: 'fold' } }))).toEqual(['check', 'raise:200', 'fold']);
  });

  it('throws when nobody is to act', () => {
    const state = reduceHand(buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0'])); // the big blind wins
    expect(() => optionsFor(state)).toThrow('nobody is to act');
  });
});

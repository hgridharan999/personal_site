// src/private/trainers/poker/bots/probes.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { rawEquity, tightPassive, callingStation } from './baselines.js';
import { always3Bet, alwaysCbet, alwaysOverbetRiver } from './probes.js';
import { playArenaHand } from './arena.js';
import { contextAfter } from './testHands.js';

const ctxOf = (steps, options) => {
  const cx = contextAfter(steps, options);
  return { view: cx.view, seat: cx.seat, legal: cx.legal, events: cx.seatEvents, persona: null, profile: null, bb: 2 };
};

describe('reference bots', () => {
  it('rawEquity raises AA pot-size preflop and folds 72o to a raise', () => {
    expect(rawEquity.decide(ctxOf([]), mulberry32(1))).toEqual({ action: 'raise', amount: 7 });
    const junk = ctxOf(['r 2 6'], { holes: ['2c3d', '7h2s', 'AhAs', '7c2d', 'JcTc', '9s9h'] });
    expect(rawEquity.decide(junk, mulberry32(1))).toEqual({ action: 'fold' });
  });

  it('tightPassive raises only premium hands unopened, calls its range, checks one pair and folds air to a bet', () => {
    expect(tightPassive.decide(ctxOf([]), mulberry32(1))).toEqual({ action: 'raise', amount: 6 });
    const kq = ctxOf(['r 2 6']); // HJ KdQd facing a raise
    expect(tightPassive.decide(kq, mulberry32(1))).toEqual({ action: 'call' });
    const overpair = ctxOf(['r 2 6', 'c 3', 'f 4', 'f 5', 'f 0', 'f 1', 'B 2h5s8c']);
    expect(overpair.seat).toBe(2);
    expect(tightPassive.decide(overpair, mulberry32(1))).toEqual({ action: 'check' }); // one pair: no bet
    const set = ctxOf(['r 2 6', 'c 3', 'f 4', 'f 5', 'f 0', 'f 1', 'B Ad5s8c']);
    expect(tightPassive.decide(set, mulberry32(1))).toEqual({ action: 'bet', amount: 8 }); // trips: half of a 15 pot, rounded
    const hj = ctxOf(['r 2 6', 'c 3', 'f 4', 'f 5', 'f 0', 'f 1', 'B 2h5s8c', 'b 2 8']);
    expect(tightPassive.decide(hj, mulberry32(1))).toEqual({ action: 'fold' });
  });

  it('always3Bet re-raises any single raise to 3x', () => {
    expect(always3Bet.decide(ctxOf(['r 2 5']), mulberry32(1))).toEqual({ action: 'raise', amount: 15 });
  });

  it('alwaysCbet bets 2/3 pot on the flop as the preflop raiser', () => {
    const flop = ctxOf(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1']);
    expect(alwaysCbet.decide(flop, mulberry32(1))).toEqual({ action: 'bet', amount: 7 });
  });

  it('alwaysOverbetRiver bets 1.5x pot on the river', () => {
    const river = ctxOf(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1', 'k 2', 'B 6c', 'k 1', 'k 2', 'B 3h', 'k 1']);
    expect(alwaysOverbetRiver.decide(river, mulberry32(1))).toEqual({ action: 'bet', amount: 17 });
  });

  it('every reference bot completes 300 hands with only legal actions', () => {
    const rng = mulberry32(4);
    const bots = [rawEquity, tightPassive, always3Bet, alwaysCbet, alwaysOverbetRiver, callingStation];
    for (let h = 0; h < 300; h += 1) {
      const { state } = playArenaHand({
        seats: bots.map((_, seat) => ({ seat, stack: 200 })),
        button: h % 6,
        dealRng: rng,
        decisionRng: rng,
        playerAt: (seat) => ({ brain: bots[(seat + h) % 6], persona: null }),
      });
      expect(state.street).toBe('complete');
    }
  });
});

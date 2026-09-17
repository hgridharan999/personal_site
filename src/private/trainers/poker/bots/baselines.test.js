// src/private/trainers/poker/bots/baselines.test.js
import { describe, it, expect } from 'vitest';
import { playHand } from '../engine/simulate.js';
import { viewFor } from '../engine/view.js';
import { randomLegal, callingStation, tightPassive } from './baselines.js';
import { contextAfter } from './testHands.js';

function makeRng(seed) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

const seats6 = () => Array.from({ length: 6 }, (_, seat) => ({ seat, stack: 200 }));

function policyFor(brain) {
  return (state, legal, rng) => {
    const ctx = { view: viewFor(state, legal.seat), seat: legal.seat, legal, events: [], persona: null, profile: null, bb: 2 };
    return brain.decide(ctx, rng);
  };
}

describe('baseline brains', () => {
  it('randomLegal produces only legal actions and every hand completes over 2000 seeded hands', () => {
    const rng = makeRng(1);
    const policy = policyFor(randomLegal);
    for (let i = 0; i < 2000; i += 1) {
      const { state } = playHand({ seats: seats6(), button: i % 6, sb: 1, bb: 2, rng, policy });
      expect(state.street).toBe('complete');
    }
  });

  it('callingStation produces only legal actions, never folds or raises, and every hand completes over 2000 seeded hands', () => {
    const rng = makeRng(2);
    const seenActions = new Set();
    const policy = (state, legal, r) => {
      const ctx = { view: viewFor(state, legal.seat), seat: legal.seat, legal, events: [], persona: null, profile: null, bb: 2 };
      const choice = callingStation.decide(ctx, r);
      seenActions.add(choice.action);
      return choice;
    };
    for (let i = 0; i < 2000; i += 1) {
      const { state } = playHand({ seats: seats6(), button: i % 6, sb: 1, bb: 2, rng, policy });
      expect(state.street).toBe('complete');
    }
    expect(seenActions.has('fold')).toBe(false);
    expect(seenActions.has('raise')).toBe(false);
    expect(seenActions.has('bet')).toBe(false);
    expect(seenActions.size).toBeGreaterThan(0);
  });
});

describe('tightPassive edge cases', () => {
  const ctxOf = (steps, options) => {
    const cx = contextAfter(steps, options);
    return { view: cx.view, seat: cx.seat, legal: cx.legal, events: cx.seatEvents, persona: null, profile: null, bb: 2 };
  };

  it('calls rather than raises a premium hand over limpers (not an unopened pot)', () => {
    const holes = ['2c3d', '7h2s', '7c2d', 'KdQd', 'AhAs', '9s9h']; // AA moved to CO, behind two limpers
    const limped = ctxOf(['c 2', 'c 3'], { holes });
    expect(limped.seat).toBe(4);
    expect(tightPassive.decide(limped)).toEqual({ action: 'call' });
  });

  it('does not bet when the board alone already has quads (four of a kind)', () => {
    const quadBoard = ctxOf(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'c 1', 'B 8c8d8h', 'k 1', 'k 2', 'B 8s']);
    expect(tightPassive.decide(quadBoard)).toEqual({ action: 'check' });
  });
});

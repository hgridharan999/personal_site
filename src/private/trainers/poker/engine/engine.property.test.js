import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { shuffle } from './cards.js';
import { reduceHand } from './handState.js';
import { playHand, randomPolicy } from './simulate.js';
import { nextButton, stacksAfter } from './table.js';

const HANDS = Number(process.env.POKER_PROPERTY_HANDS ?? 100000);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Wraps a policy so every decision is checked against `legalActions`'s own contract before
// it is used: toCall never exceeds the stack, canCheck agrees with toCall, and the raise
// bounds are either a valid [minRaiseTo, maxRaiseTo] window above currentBet, or both null
// when canRaise is false. Shared by both property tests below.
function checkedPolicy(basePolicy, h) {
  return (state, legal, rng) => {
    const player = state.players.find((p) => p.seat === legal.seat);
    if (legal.toCall > player.stack) {
      throw new Error(`hand ${h}: toCall ${legal.toCall} exceeds stack ${player.stack}`);
    }
    if (legal.canCheck !== (legal.toCall === 0)) {
      throw new Error(`hand ${h}: canCheck ${legal.canCheck} inconsistent with toCall ${legal.toCall}`);
    }
    if (legal.canRaise) {
      if (legal.minRaiseTo > legal.maxRaiseTo) {
        throw new Error(`hand ${h}: minRaiseTo ${legal.minRaiseTo} > maxRaiseTo ${legal.maxRaiseTo}`);
      }
      if (legal.minRaiseTo <= state.currentBet) {
        throw new Error(`hand ${h}: minRaiseTo ${legal.minRaiseTo} <= currentBet ${state.currentBet}`);
      }
    } else if (legal.minRaiseTo !== null || legal.maxRaiseTo !== null) {
      throw new Error(`hand ${h}: raise bounds not null when canRaise is false`);
    }
    return basePolicy(state, legal, rng);
  };
}

// Shared per-hand invariants for both property tests: chip conservation, net-sums-to-zero,
// no negative stacks, the contribution invariant and the showdown winner invariant.
function checkHandInvariants(h, seats, state) {
  const before = sum(seats.map((x) => x.stack));
  const after = sum(state.players.map((p) => p.stack));
  if (after !== before) throw new Error(`hand ${h}: chips ${before} -> ${after}`);
  if (sum(Object.values(state.result.net)) !== 0) throw new Error(`hand ${h}: net does not sum to 0`);
  if (state.players.some((p) => p.stack < 0)) throw new Error(`hand ${h}: negative stack`);

  const startStack = {};
  for (const x of seats) startStack[x.seat] = x.stack;
  for (const p of state.players) {
    if (p.folded) continue;
    const others = state.players.filter((q) => q.seat !== p.seat);
    const maxOtherTotal = others.length ? Math.max(...others.map((q) => q.total)) : 0;
    const expected = Math.min(startStack[p.seat], maxOtherTotal);
    if (p.total !== expected) {
      throw new Error(
        `hand ${h}: seat ${p.seat} total ${p.total} != min(stack ${startStack[p.seat]}, maxOtherTotal ${maxOtherTotal})`,
      );
    }
  }

  if (state.result.showdown) {
    for (const pot of state.result.pots) {
      const maxScore = Math.max(...pot.eligible.map((seat) => state.result.scores[seat]));
      for (const seat of pot.eligible) {
        const atMax = state.result.scores[seat] === maxScore;
        if (atMax !== pot.winners.includes(seat)) {
          throw new Error(`hand ${h}: seat ${seat} score/winners mismatch in pot ${JSON.stringify(pot)}`);
        }
      }
    }
  }
}

// Aggressive short-stacked policy for the second property test: mostly shoves or min-raises
// when it can, folds a chunk of the rest, and otherwise checks/calls.
function shortStackedPolicy(state, legal, rng) {
  const roll = rng();
  if (roll < 0.35 && legal.canRaise) return { action: legal.raiseKind, amount: legal.maxRaiseTo };
  if (roll < 0.6 && legal.canRaise) return { action: legal.raiseKind, amount: legal.minRaiseTo };
  if (roll < 0.7 && !legal.canCheck) return { action: 'fold' };
  return legal.canCheck ? { action: 'check' } : { action: 'call' };
}

describe('engine properties', () => {
  it(`plays ${HANDS} random hands legally, conserving chips`, () => {
    const rng = mulberry32(20260916);
    for (let h = 0; h < HANDS; h += 1) {
      const n = 2 + Math.floor(rng() * 5);
      const ids = shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, n);
      const seats = ids.map((seat) => ({ seat, stack: 1 + Math.floor(rng() * 400) }));
      const button = ids[Math.floor(rng() * n)];
      const { events, state } = playHand({ seats, button, sb: 1, bb: 2, rng, policy: checkedPolicy(randomPolicy, h) });
      checkHandInvariants(h, seats, state);
      if (h % 100 === 0) expect(reduceHand(events)).toEqual(state);
    }
  }, 300_000);

  it('plays 50,000 short-stacked aggressive hands legally', () => {
    const HANDS2 = 50_000;
    const rng = mulberry32(424242);
    for (let h = 0; h < HANDS2; h += 1) {
      const n = 2 + Math.floor(rng() * 5);
      const ids = shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, n);
      const seats = ids.map((seat) => ({
        seat,
        stack: rng() < 0.5 ? 1 + Math.floor(rng() * 12) : 1 + Math.floor(rng() * 400),
      }));
      const button = ids[Math.floor(rng() * n)];
      const { events, state } = playHand({
        seats, button, sb: 1, bb: 2, rng, policy: checkedPolicy(shortStackedPolicy, h),
      });
      checkHandInvariants(h, seats, state);
      if (h % 100 === 0) expect(reduceHand(events)).toEqual(state);
    }
  }, 300_000);

  it('plays a 6-handed session to one survivor, rotating the button', () => {
    const rng = mulberry32(99);
    let seats = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 200 }));
    let button = 0;
    let hands = 0;
    while (seats.length > 1 && hands < 20000) {
      const { state } = playHand({ seats, button, sb: 1, bb: 2, rng, policy: randomPolicy });
      seats = stacksAfter(state).filter((x) => x.stack > 0);
      expect(sum(seats.map((x) => x.stack))).toBe(1200);
      if (seats.length > 1) button = nextButton(seats.map((x) => x.seat), button);
      hands += 1;
    }
    expect(seats.length).toBe(1);
  }, 120_000);
});

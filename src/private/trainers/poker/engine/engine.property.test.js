import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { shuffle } from './cards.js';
import { reduceHand } from './handState.js';
import { playHand, randomPolicy } from './simulate.js';
import { nextButton, stacksAfter } from './table.js';

const HANDS = Number(process.env.POKER_PROPERTY_HANDS ?? 100000);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('engine properties', () => {
  it(`plays ${HANDS} random hands legally, conserving chips`, () => {
    const rng = mulberry32(20260916);
    for (let h = 0; h < HANDS; h += 1) {
      const n = 2 + Math.floor(rng() * 5);
      const ids = shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, n);
      const seats = ids.map((seat) => ({ seat, stack: 1 + Math.floor(rng() * 400) }));
      const button = ids[Math.floor(rng() * n)];
      const { events, state } = playHand({ seats, button, sb: 1, bb: 2, rng, policy: randomPolicy });
      const before = sum(seats.map((x) => x.stack));
      const after = sum(state.players.map((p) => p.stack));
      if (after !== before) throw new Error(`hand ${h}: chips ${before} -> ${after}`);
      if (sum(Object.values(state.result.net)) !== 0) throw new Error(`hand ${h}: net does not sum to 0`);
      if (state.players.some((p) => p.stack < 0)) throw new Error(`hand ${h}: negative stack`);
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

import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { dealHand } from './dealer.js';
import { reduceHand } from './handState.js';
import { nextButton, stacksAfter } from './table.js';

const seats = [{ seat: 1, stack: 200 }, { seat: 3, stack: 200 }, { seat: 4, stack: 200 }];

describe('dealer', () => {
  it('deals hole cards one at a time starting left of the button, then burns before each street', () => {
    const { deck, events, boardEvent } = dealHand({ seats, button: 3, sb: 1, bb: 2, rng: mulberry32(5) });
    expect(events[0]).toEqual({ type: 'start', seats, button: 3, sb: 1, bb: 2 });
    expect(events.slice(1)).toEqual([
      { type: 'hole', seat: 4, cards: [deck[0], deck[3]] },
      { type: 'hole', seat: 1, cards: [deck[1], deck[4]] },
      { type: 'hole', seat: 3, cards: [deck[2], deck[5]] },
    ]);
    expect(boardEvent('flop')).toEqual({ type: 'board', cards: [deck[7], deck[8], deck[9]] });
    expect(boardEvent('turn')).toEqual({ type: 'board', cards: [deck[11]] });
    expect(boardEvent('river')).toEqual({ type: 'board', cards: [deck[13]] });
    expect(reduceHand(events).toAct).toBe(3); // heads-up rules don't apply; UTG is left of BB (seat 1)
  });

  it('is deterministic for a seed', () => {
    const a = dealHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(77) });
    const b = dealHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(77) });
    expect(a.events).toEqual(b.events);
  });
});

describe('table helpers', () => {
  it('moves the button to the next occupied seat, wrapping', () => {
    expect(nextButton([1, 3, 4], 1)).toBe(3);
    expect(nextButton([1, 3, 4], 4)).toBe(1);
    expect(nextButton([1, 3, 4], 2)).toBe(3); // previous button seat left the table
  });

  it('reads stacks after a hand', () => {
    const state = reduceHand(dealHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(1) }).events);
    expect(stacksAfter(state)).toEqual([{ seat: 1, stack: 200 }, { seat: 3, stack: 199 }, { seat: 4, stack: 198 }]);
  });
});

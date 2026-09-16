// src/private/trainers/poker/engine/view.test.js
import { describe, it, expect } from 'vitest';
import { applyEvent } from './handState.js';
import { parseCards } from './cards.js';
import { playHand, randomPolicy } from './simulate.js';
import { viewFor, eventsFor } from './view.js';

const HOLES6 = ['AhAd', 'KhKd', 'QhQd', 'JhJd', 'ThTd', '9h9d'];

function setup(stacks, holes, button = 0) {
  let s = applyEvent(null, { type: 'start', button, sb: 1, bb: 2, seats: stacks.map((stack, seat) => ({ seat, stack })) });
  holes.forEach((h, seat) => { s = applyEvent(s, { type: 'hole', seat, cards: parseCards(h) }); });
  return s;
}

const seats6 = () => Array.from({ length: 6 }, (_, seat) => ({ seat, stack: 200 }));

function makeRng(seed) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

describe('viewFor', () => {
  it('keeps the viewer seat hole cards and nulls everyone else mid-hand', () => {
    const s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    const view = viewFor(s, 1);
    expect(view.players[1].hole).toEqual(parseCards('KhKd'));
    for (const p of view.players) {
      if (p.seat !== 1) expect(p.hole).toBeNull();
    }
  });

  it('does not mutate the original state', () => {
    const s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    const before = JSON.stringify(s);
    viewFor(s, 1);
    expect(JSON.stringify(s)).toBe(before);
    // sanity: original state still has every hole card
    for (const p of s.players) expect(p.hole).not.toBeNull();
  });

  it('reveals shown seats and hides folded seats after a showdown', () => {
    const rng = makeRng(42);
    let state = null;
    for (let i = 0; i < 500; i += 1) {
      const { state: finalState } = playHand({ seats: seats6(), button: 0, sb: 1, bb: 2, rng, policy: randomPolicy });
      if (finalState.result.showdown) { state = finalState; break; }
    }
    expect(state).not.toBeNull();
    const view = viewFor(state, state.result.shown[0]);
    for (const p of view.players) {
      if (state.result.shown.includes(p.seat)) expect(p.hole).not.toBeNull();
      else expect(p.hole).toBeNull();
    }
  });

  it('after a hand with no showdown, only the viewer can see their own cards', () => {
    const rng = makeRng(7);
    let state = null;
    for (let i = 0; i < 500; i += 1) {
      const { state: finalState } = playHand({ seats: seats6(), button: 0, sb: 1, bb: 2, rng, policy: randomPolicy });
      if (!finalState.result.showdown) { state = finalState; break; }
    }
    expect(state).not.toBeNull();
    const viewerSeat = state.players[0].seat;
    const view = viewFor(state, viewerSeat);
    for (const p of view.players) {
      if (p.seat === viewerSeat) expect(p.hole).not.toBeNull();
      else expect(p.hole).toBeNull();
    }
  });
});

describe('eventsFor', () => {
  it('nulls other seats hole cards, keeps the viewer, and leaves other event types untouched', () => {
    const s0 = applyEvent(null, { type: 'start', button: 0, sb: 1, bb: 2, seats: seats6() });
    const events = [
      { type: 'start', button: 0, sb: 1, bb: 2, seats: seats6() },
      { type: 'hole', seat: 0, cards: parseCards('AhAd') },
      { type: 'hole', seat: 1, cards: parseCards('KhKd') },
      { type: 'act', seat: 3, action: 'call' },
      { type: 'board', cards: parseCards('2c7s9d') },
    ];
    const view = eventsFor(events, 1);
    expect(view[0]).toEqual(events[0]);
    expect(view[1]).toEqual({ type: 'hole', seat: 0, cards: null });
    expect(view[2]).toEqual({ type: 'hole', seat: 1, cards: parseCards('KhKd') });
    expect(view[3]).toEqual(events[3]);
    expect(view[4]).toEqual(events[4]);
    void s0;
  });
});

import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCards } from '../engine/cards.js';
import { playHand } from '../engine/simulate.js';
import { buildHandRecord } from './handRecord.js';

const base = {
  id: 'hand-1',
  sessionId: 'session-1',
  handNo: 3,
  playedAt: '2026-09-16T12:00:00.000Z',
  botVersion: 'test-bots',
  heroSeat: 0,
  lineup: [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: `p${seat}` })),
};

const passive = (state, legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });

describe('buildHandRecord', () => {
  it('records a showdown hand with the contract fields', () => {
    const seats = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 200 }));
    const { events, state } = playHand({ seats, button: 4, sb: 1, bb: 2, rng: mulberry32(11), policy: passive });
    const record = buildHandRecord({ ...base, events });
    expect(Object.keys(record).sort()).toEqual([
      'botVersion', 'buttonSeat', 'events', 'handNo', 'heroNet', 'heroSeat', 'id', 'lineup', 'playedAt', 'pot',
      'sessionId', 'showdown', 'startStacks', 'v',
    ]);
    expect(record).toMatchObject({
      v: 1, id: 'hand-1', sessionId: 'session-1', handNo: 3, playedAt: base.playedAt, botVersion: 'test-bots',
      heroSeat: 0, buttonSeat: 4, pot: 12, showdown: true,
    });
    expect(record.lineup).toEqual(base.lineup);
    expect(record.startStacks).toEqual(seats);
    expect(record.heroNet).toBe(state.result.net[0]);
    expect(record.events).toEqual(events);
    expect(record.events).not.toBe(events);
  });

  it('uses the final state when given one, and matches the recomputed record', () => {
    const seats = [0, 1, 2].map((seat) => ({ seat, stack: 200 }));
    const { events, state } = playHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(5), policy: passive });
    expect(buildHandRecord({ ...base, events, state })).toEqual(buildHandRecord({ ...base, events }));
    expect(() => buildHandRecord({ ...base, events, state: { ...state, street: 'river' } })).toThrow('hand is not complete');
  });

  it('records a hand won without a showdown', () => {
    const cards = parseCards('AhAdKhKdQhQd');
    const events = [
      { type: 'start', seats: [0, 1, 2].map((seat) => ({ seat, stack: 200 })), button: 0, sb: 1, bb: 2 },
      { type: 'hole', seat: 0, cards: cards.slice(0, 2) },
      { type: 'hole', seat: 1, cards: cards.slice(2, 4) },
      { type: 'hole', seat: 2, cards: cards.slice(4, 6) },
      { type: 'act', seat: 0, action: 'raise', amount: 6 },
      { type: 'act', seat: 1, action: 'fold' },
      { type: 'act', seat: 2, action: 'fold' },
    ];
    const record = buildHandRecord({ ...base, lineup: base.lineup.slice(0, 2), events });
    // The uncalled 4 units are returned, so the pot is 1 (SB) + 2 (BB) + 2 (hero's called part).
    expect(record).toMatchObject({ buttonSeat: 0, heroNet: 3, pot: 5, showdown: false });
  });

  it('defaults the id to a random UUID', () => {
    const seats = [0, 1].map((seat) => ({ seat, stack: 200 }));
    const { events } = playHand({ seats, button: 0, sb: 1, bb: 2, rng: mulberry32(2), policy: passive });
    const { id, ...rest } = base;
    expect(buildHandRecord({ ...rest, events }).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects logs that are not a complete hand', () => {
    const seats = [0, 1].map((seat) => ({ seat, stack: 200 }));
    const { events } = playHand({ seats, button: 0, sb: 1, bb: 2, rng: mulberry32(2), policy: passive });
    expect(() => buildHandRecord({ ...base, events: events.slice(0, 3) })).toThrow('hand is not complete');
    expect(() => buildHandRecord({ ...base, events: events.slice(1) })).toThrow('start event');
  });
});

import { playHand, randomPolicy } from '../../src/private/trainers/poker/engine/simulate.js';
import { mulberry32 } from '../../src/private/trainers/core/rng.js';

// Test-only fixtures for the poker API (not a route: lives under api/_lib).

export const POKER_SESSION_ID = '6d0c3a52-3b7e-4f3a-9d8e-1a2b3c4d5e6f';
export const POKER_STARTED_AT = '2026-09-16T18:00:00.000Z';
const PERSONAS = ['moss', 'viper', 'duchess', 'rook', 'ink', 'brick'];
const ALL_SEATS = [0, 1, 2, 3, 4, 5];

export const pokerHandId = (n) => `b2f4e6a8-1c3d-4e5f-8a9b-${String(n).padStart(12, '0')}`;

const botLineup = (seatIds, heroSeat) =>
  seatIds.filter((seat) => seat !== heroSeat).map((seat, i) => ({ seat, personaId: PERSONAS[i] }));

/** A valid POST /api/trainers/poker/sessions body (contracts §4 session shape). */
export function pokerSessionBody(overrides = {}) {
  return {
    id: POKER_SESSION_ID,
    startedAt: POKER_STARTED_AT,
    botVersion: 'placeholder',
    tableMode: 'random',
    lineup: botLineup(ALL_SEATS, 0),
    heroSeat: 0,
    ...overrides,
  };
}

/** A HandRecord (contracts §4) for a hand played by the engine with random legal actions. */
export function pokerHandRecord({
  seed = 1, handNo = 1, id = pokerHandId(handNo), sessionId = POKER_SESSION_ID,
  button = 0, heroSeat = 0, seatIds = ALL_SEATS, stack = 200,
} = {}) {
  const seats = seatIds.map((seat) => ({ seat, stack }));
  const { events, state } = playHand({ seats, button, sb: 1, bb: 2, rng: mulberry32(seed), policy: randomPolicy });
  return {
    v: 1,
    id,
    sessionId,
    handNo,
    playedAt: new Date(Date.parse(POKER_STARTED_AT) + handNo * 60000).toISOString(),
    botVersion: 'placeholder',
    heroSeat,
    buttonSeat: button,
    lineup: botLineup(seatIds, heroSeat),
    startStacks: seats.map((s) => ({ seat: s.seat, stack: s.stack })),
    events,
    heroNet: state.result.net[heroSeat] ?? 0,
    pot: state.players.reduce((sum, p) => sum + p.total, 0),
    showdown: state.result.showdown,
  };
}

export function findHandRecord(predicate, options = {}) {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const record = pokerHandRecord({ ...options, seed });
    if (predicate(record)) return record;
  }
  throw new Error('no seed produced a matching hand');
}

export const heroActed = (record) => record.events.some((e) => e.type === 'act' && e.seat === record.heroSeat);

/** A valid DecisionRecord for the hero's first action in `record`. */
export function heroDecision(record, overrides = {}) {
  const idx = record.events.findIndex((e) => e.type === 'act' && e.seat === record.heroSeat);
  if (idx < 0) throw new Error('hero never acted in this hand');
  const event = record.events[idx];
  return {
    idx,
    street: 'preflop',
    position: 'BTN',
    spot: 'pf.open',
    action: event.action,
    size: event.amount ?? null,
    pot: 3,
    toCall: 2,
    equity: null,
    neededEquity: 0.4,
    recommended: { action: 'fold', size: null, evByOption: { fold: 0, call: -1.5 } },
    evLoss: 1.5,
    grade: 'mistake',
    confident: true,
    analysisVersion: 1,
    ...overrides,
  };
}

// src/private/trainers/poker/lib/tableSnapshot.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import {
  createSession, startHand, nextStep, applyAction, dealBoard, finishHand, canRebuy, sessionSummary, abandonSession,
} from './tableCore.js';
import { seatViews, tableCenter, heroTurn, streetKey, seatName } from './tableView.js';
import { logLines } from './actionLog.js';
import { tableSnapshot } from './tableSnapshot.js';

const personas = listPersonas();
const lineup = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: personas[seat - 1].id }));
const NOW = '2026-09-16T12:00:00.000Z';
const passive = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });

const fresh = () => createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW });
const dealt = (seed = 1) => startHand(fresh(), { rng: mulberry32(seed), now: NOW, personas });

function advance(session, untilType) {
  let s = session;
  for (let guard = 0; guard < 200; guard += 1) {
    const step = nextStep(s);
    if (step.type === untilType) return s;
    if (step.type === 'board') s = dealBoard(s);
    else if (step.type === 'hero' || step.type === 'bot') s = applyAction(s, step.seat, passive(legalActions(s.hand.state)));
    else return s;
  }
  throw new Error('did not reach step');
}

const hasFunction = (value) => {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(hasFunction);
};

/** Every view-model reading the table components make must agree between the raw session and the snapshot. */
function expectSameViewModel(raw) {
  const snap = tableSnapshot(raw);
  expect(seatViews(snap)).toEqual(seatViews(raw));
  expect(tableCenter(snap)).toEqual(tableCenter(raw));
  expect(heroTurn(snap)).toEqual(heroTurn(raw));
  expect(streetKey(snap)).toBe(streetKey(raw));
  expect(canRebuy(snap)).toBe(canRebuy(raw));
  expect(sessionSummary(snap, NOW)).toEqual(sessionSummary(raw, NOW));
  const log = raw.hand ? logLines(raw.hand.events, { nameOf: (seat) => seatName(raw, seat), heroSeat: raw.heroSeat }) : [];
  expect(snap.hand?.log ?? []).toEqual(log);
}

describe('tableSnapshot', () => {
  it('copies a session with no hand as is', () => {
    const raw = fresh();
    expect(tableSnapshot(raw)).toEqual(raw);
    expectSameViewModel(raw);
  });

  it('drops the event log and the deck, and hides bot hole cards mid-hand', () => {
    const raw = advance(dealt(), 'hero');
    const snap = tableSnapshot(raw);
    expect(Object.keys(snap.hand).sort()).toEqual(['button', 'eventCount', 'log', 'no', 'playedAt', 'state']);
    expect(snap.hand.eventCount).toBe(raw.hand.events.length);
    expect(hasFunction(snap)).toBe(false);
    for (const p of snap.hand.state.players) {
      if (p.seat === raw.heroSeat) expect(p.hole).toEqual(raw.hand.state.players.find((q) => q.seat === p.seat).hole);
      else expect(p.hole).toBeNull();
    }
    expectSameViewModel(raw);
    expectSameViewModel(abandonSession(raw));
  });

  it('matches the raw session through every street, showdown, settlement and an abandon', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      let s = dealt(seed);
      for (let guard = 0; guard < 200 && nextStep(s).type !== 'complete'; guard += 1) {
        expectSameViewModel(s);
        const step = nextStep(s);
        if (step.type === 'board') s = dealBoard(s);
        else s = applyAction(s, step.seat, passive(legalActions(s.hand.state)));
      }
      expectSameViewModel(s);
      const shown = s.hand.state.result.shown;
      const snap = tableSnapshot(s);
      for (const p of snap.hand.state.players) {
        if (p.seat !== s.heroSeat && !shown.includes(p.seat)) expect(p.hole).toBeNull();
      }
      const settled = finishHand(s, { botVersion: 'test', createId: () => 'h1' }).session;
      expectSameViewModel(settled);
      expectSameViewModel(abandonSession(settled));
    }
  });
});

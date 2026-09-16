import { describe, it, expect } from 'vitest';
import { createPokerHandsHandler } from './hands.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import {
  POKER_SESSION_ID, pokerHandRecord, pokerHandId, findHandRecord, heroActed, heroDecision,
} from '../../_lib/pokerTesting.js';
import { reduceHand } from '../../../src/private/trainers/poker/engine/handState.js';
import { cardsToString } from '../../../src/private/trainers/poker/engine/cards.js';

const OTHER_SESSION_ID = '7e1d4b63-4c8f-4a4b-8e9f-2b3c4d5e6f70';
const make = (sql) => createPokerHandsHandler({ getSql: () => sql, auth: () => TEST_AUTH });

async function call(sql, options) {
  const res = mockRes();
  await make(sql)(authedReq(options), res);
  return res;
}

function db({ sessions = [{ id: POKER_SESSION_ID, heroSeat: 0 }], inserted = 1 } = {}) {
  return mockSql((text) => {
    if (text.includes('jsonb_array_elements_text')) return sessions;
    if (text.includes('WITH ins AS')) return [{ inserted }];
    return [];
  });
}

describe('api/trainers/poker/hands', () => {
  it('405 for GET', async () => {
    const res = await call(db(), { method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('401 without a session cookie, never cached', async () => {
    const res = await call(db(), { method: 'POST', authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('400 with details for an invalid batch', async () => {
    const res = await call(db(), { method: 'POST', body: { hands: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
  });

  it('409 SESSION_NOT_FOUND before inserting anything', async () => {
    const sql = db({ sessions: [] });
    const res = await call(sql, { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Session not saved yet', code: 'SESSION_NOT_FOUND', details: { sessionIds: [POKER_SESSION_ID] } });
    expect(sql.queries).toHaveLength(1);
    expect(JSON.parse(sql.queries[0].values[0])).toEqual([POKER_SESSION_ID]);
  });

  it('looks up each distinct session once and reports only the missing ones', async () => {
    const sql = db({ sessions: [{ id: POKER_SESSION_ID }] });
    const hands = [
      { hand: pokerHandRecord({ handNo: 1 }) },
      { hand: pokerHandRecord({ seed: 2, handNo: 2 }) },
      { hand: pokerHandRecord({ seed: 3, handNo: 1, id: pokerHandId(3), sessionId: OTHER_SESSION_ID }) },
    ];
    const res = await call(sql, { method: 'POST', body: { hands } });
    expect(res.statusCode).toBe(409);
    expect(res.body.details).toEqual({ sessionIds: [OTHER_SESSION_ID] });
    expect(JSON.parse(sql.queries[0].values[0])).toEqual([POKER_SESSION_ID, OTHER_SESSION_ID]);
  });

  it('409 HERO_SEAT_MISMATCH before inserting anything, when a hand disagrees with the session seat', async () => {
    const sql = db({ sessions: [{ id: POKER_SESSION_ID, heroSeat: 3 }] });
    const hand = pokerHandRecord();
    const res = await call(sql, { method: 'POST', body: { hands: [{ hand }] } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: "heroSeat does not match the session's hero seat",
      code: 'HERO_SEAT_MISMATCH',
      details: { handIds: [hand.id] },
    });
    expect(sql.queries).toHaveLength(1);
  });

  it('behaves as before when heroSeat matches the session', async () => {
    const sql = db({ sessions: [{ id: POKER_SESSION_ID, heroSeat: 0 }] });
    const res = await call(sql, { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ saved: true, inserted: 1, duplicate: 0 });
  });

  it('inserts hands, decisions and session totals in one statement', async () => {
    const hand = findHandRecord(heroActed);
    const decision = heroDecision(hand);
    const sql = db();
    const res = await call(sql, { method: 'POST', body: { hands: [{ hand, decisions: [decision], heroAllinEv: 4.25 }] } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ saved: true, inserted: 1, duplicate: 0 });
    expect(sql.queries).toHaveLength(2);

    const insert = sql.queries[1];
    for (const fragment of [
      'INSERT INTO poker_hands', 'ON CONFLICT DO NOTHING', 'RETURNING id, session_id, hero_net, hero_allin_ev',
      'INSERT INTO poker_decisions', 'JOIN ins ON ins.id = y.hand_id',
      'UPDATE poker_sessions s', 'COALESCE(hero_allin_ev, hero_net)',
    ]) {
      expect(insert.text).toContain(fragment);
    }
    expect(insert.values).toHaveLength(2);
    const [handRows, decisionRows] = insert.values.map((v) => JSON.parse(v));

    const state = reduceHand(hand.events);
    expect(handRows).toEqual([{
      id: hand.id,
      session_id: POKER_SESSION_ID,
      hand_no: 1,
      played_at: hand.playedAt,
      button_seat: 0,
      hero_seat: 0,
      hero_start_stack: 200,
      hero_actions: hand.events.filter((e) => e.type === 'act' && e.seat === 0).length,
      lineup: hand.lineup,
      hole_cards: state.players.map((p) => ({ seat: p.seat, cards: cardsToString(p.hole) })),
      board: cardsToString(state.board),
      events: hand.events,
      pot: hand.pot,
      hero_net: hand.heroNet,
      hero_allin_ev: 4.25,
      showdown: hand.showdown,
    }]);
    expect(decisionRows).toEqual([{
      hand_id: hand.id,
      idx: decision.idx,
      street: 'preflop',
      position: 'BTN',
      spot: 'pf.open',
      action: decision.action,
      size: decision.size,
      pot: 3,
      to_call: 2,
      equity: null,
      needed_equity: 0.4,
      recommended: decision.recommended,
      ev_loss: 1.5,
      grade: 'mistake',
      confident: true,
      analysis_version: 1,
    }]);
  });

  it('reports duplicates on a retry', async () => {
    const res = await call(db({ inserted: 0 }), { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ saved: true, inserted: 0, duplicate: 1 });
  });

  it('500 INTERNAL when the database throws', async () => {
    const sql = mockSql(() => Promise.reject(new Error('boom')));
    const original = console.error;
    console.error = () => {};
    try {
      const res = await call(sql, { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL');
    } finally {
      console.error = original;
    }
  });
});

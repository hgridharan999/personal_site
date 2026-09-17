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

function db({ sessions = [{ id: POKER_SESSION_ID, heroSeat: 0 }], inserted = 1, conflicts = [] } = {}) {
  return mockSql((text) => {
    if (text.includes('jsonb_array_elements_text')) return sessions;
    if (text.includes('WITH ins AS')) return [{ inserted }];
    if (text.includes('p.hand_no = x.hand_no')) return conflicts.map((id) => ({ id }));
    return [];
  });
}

describe('api/trainers/poker/hands', () => {
  it('405 for PUT', async () => {
    const res = await call(db(), { method: 'PUT' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST, PATCH');
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

  it('400 before touching the database for a year-0000 playedAt or a NUL personaId', async () => {
    const hand = pokerHandRecord();
    const nul = `x${String.fromCharCode(0)}`;
    for (const bad of [
      { ...hand, playedAt: '0000-01-01T00:00:00.000Z' },
      { ...hand, lineup: hand.lineup.map((l) => ({ ...l, personaId: nul })) },
    ]) {
      const sql = db();
      const res = await call(sql, { method: 'POST', body: { hands: [{ hand: bad }] } });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(sql.queries).toHaveLength(0);
    }
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

  it('moves ended_at of a closed session forward to hands that arrive after the close, in the same statement', async () => {
    const sql = db();
    await call(sql, { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
    const insert = sql.queries[1];
    for (const fragment of [
      'RETURNING id, session_id, hero_net, hero_allin_ev, played_at',
      'max(played_at) AS last_played_at',
      'ended_at = CASE WHEN s.ended_at IS NULL THEN NULL ELSE GREATEST(s.ended_at, t.last_played_at) END',
    ]) {
      expect(insert.text).toContain(fragment);
    }
  });

  it('does not look for hand number conflicts when every hand was inserted', async () => {
    const sql = db({ inserted: 1 });
    await call(sql, { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
    expect(sql.queries).toHaveLength(2);
  });

  it('409 HAND_NO_CONFLICT when a new hand id reuses a stored (session, handNo)', async () => {
    const first = pokerHandRecord({ handNo: 1 });
    const second = pokerHandRecord({ seed: 2, handNo: 2 });
    const sql = db({ inserted: 0, conflicts: [second.id] });
    const res = await call(sql, { method: 'POST', body: { hands: [{ hand: first }, { hand: second }] } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'handNo is already used by another hand in this session',
      code: 'HAND_NO_CONFLICT',
      details: { handIds: [second.id] },
    });
    expect(sql.queries).toHaveLength(3);
    const lookup = sql.queries[2];
    expect(lookup.text).toContain('NOT EXISTS (SELECT 1 FROM poker_hands p WHERE p.id = x.id)');
    expect(JSON.parse(lookup.values[0])).toEqual([
      { id: first.id, session_id: POKER_SESSION_ID, hand_no: 1 },
      { id: second.id, session_id: POKER_SESSION_ID, hand_no: 2 },
    ]);
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

describe('GET /api/trainers/poker/hands?id=', () => {
  const ID = pokerHandId(7);

  it('400 for a bad id and 404 when the hand is missing', async () => {
    let res = await call(mockSql(), { method: 'GET', query: { id: 'nope' } });
    expect(res.statusCode).toBe(400);
    res = await call(mockSql([[], []]), { method: 'GET', query: { id: ID } });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Hand not found', code: 'NOT_FOUND' });
  });

  it('returns one hand with its events, neighbours and decisions', async () => {
    const hand = { id: ID, handNo: 7, events: [{ type: 'start' }], prevHandId: null, nextHandId: pokerHandId(8) };
    const decisions = [{ idx: 9, grade: 'good' }];
    const sql = mockSql((text) => (text.includes('AS "prevHandId"') ? [hand] : decisions));
    const res = await call(sql, { method: 'GET', query: { id: ID } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hand, decisions });
    const [handQuery, decisionQuery] = sql.queries;
    for (const fragment of ['FROM poker_hands h WHERE h.id =', 'h.events', 'ORDER BY p.hand_no DESC LIMIT 1', 'ORDER BY n.hand_no LIMIT 1']) {
      expect(handQuery.text).toContain(fragment);
    }
    expect(handQuery.values).toEqual([ID]);
    expect(decisionQuery.text).toContain('FROM poker_decisions WHERE hand_id =');
    expect(decisionQuery.text).toContain('ORDER BY idx');
  });
});

describe('GET /api/trainers/poker/hands?ungraded=1', () => {
  const query = (extra = {}) => ({ ungraded: '1', sessionId: POKER_SESSION_ID, belowVersion: '1', ...extra });

  it('400 for a bad query before touching the database', async () => {
    const sql = mockSql();
    for (const bad of [{ sessionId: 'x' }, { belowVersion: '0' }, { limit: '21' }, { ungraded: 'yes' }]) {
      const res = await call(sql, { method: 'GET', query: query(bad) });
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect(sql.queries).toHaveLength(0);
  });

  it('pages hands without current grades after a cursor', async () => {
    const rows = [5, 6, 9].map((handNo) => ({ id: pokerHandId(handNo), handNo, heroSeat: 0, lineup: [], events: [] }));
    const sql = mockSql([rows]);
    const res = await call(sql, { method: 'GET', query: query({ afterHandNo: '4', limit: '2' }) });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hands: rows.slice(0, 2), nextAfterHandNo: 6 });
    const [q] = sql.queries;
    for (const fragment of ['h.hero_actions > 0', 'max(d.analysis_version)', 'ORDER BY h.hand_no']) expect(q.text).toContain(fragment);
    expect(q.values).toEqual([POKER_SESSION_ID, 4, 1, 3]);
    const last = await call(mockSql([rows.slice(0, 1)]), { method: 'GET', query: query() });
    expect(last.body).toEqual({ hands: rows.slice(0, 1), nextAfterHandNo: null });
  });
});

describe('PATCH /api/trainers/poker/hands (re-grade)', () => {
  const first = findHandRecord(heroActed, { handNo: 1 });
  const second = findHandRecord(heroActed, { handNo: 2 });
  const grade = (hand, version = 2, overrides = {}) => ({
    handId: hand.id, analysisVersion: version, decisions: [heroDecision(hand, { analysisVersion: version })], heroAllinEv: null, ...overrides,
  });
  const stored = (...list) => list.map((h) => ({ id: h.id, heroSeat: h.heroSeat, events: h.events }));
  const patch = (sql, body) => call(sql, { method: 'PATCH', body });

  it('400 for an invalid batch before touching the database', async () => {
    const sql = mockSql();
    const mismatched = { ...grade(first), decisions: [heroDecision(first, { analysisVersion: 3 })] };
    for (const body of [{ grades: [] }, { grades: [grade(first), grade(first)] }, { grades: [mismatched] }]) {
      const res = await patch(sql, body);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(sql.queries).toHaveLength(0);
  });

  it('400 when a decision does not point at a stored hero action', async () => {
    const sql = mockSql([stored(first)]);
    const bad = grade(first, 2, { decisions: [heroDecision(first, { analysisVersion: 2, idx: 0 })] });
    const res = await patch(sql, { grades: [bad] });
    expect(res.statusCode).toBe(400);
    expect(res.body.details.problems).toEqual([
      { path: ['grades', 0, 'decisions', 0, 'idx'], message: 'decision idx must point at a hero action with the same action' },
    ]);
    expect(sql.transactions).toHaveLength(0);
  });

  it('reports hands that are not stored without a transaction', async () => {
    const sql = mockSql([[]]);
    const res = await patch(sql, { grades: [grade(first)] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ updated: [], skipped: [], missing: [first.id] });
    expect(sql.transactions).toHaveLength(0);
  });

  it('locks the hands, then upserts newer grades and moves allin_adj_net in one statement', async () => {
    const sql = mockSql([stored(first, second)]);
    sql.transactionResult = [[{ id: first.id }, { id: second.id }], [{ id: first.id }]];
    const res = await patch(sql, { grades: [grade(first, 2, { heroAllinEv: 12.5 }), grade(second)] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ updated: [first.id], skipped: [second.id], missing: [] });
    expect(sql.queries[0].text).toContain('SELECT id, hero_seat AS "heroSeat", events FROM poker_hands');
    expect(sql.transactions).toHaveLength(1);
    const [lock, upsert] = sql.transactions[0];
    expect(lock.text).toContain('ORDER BY id FOR UPDATE');
    for (const fragment of [
      'COALESCE((SELECT max(d.analysis_version) FROM poker_decisions d WHERE d.hand_id = h.id), 0) < i.analysis_version',
      'DELETE FROM poker_decisions d USING target t',
      'ON CONFLICT (hand_id, idx) DO UPDATE SET',
      'UPDATE poker_hands h SET hero_allin_ev = t.new_ev',
      'sum(COALESCE(new_ev, hero_net) - COALESCE(old_ev, hero_net))',
      'UPDATE poker_sessions s',
    ]) {
      expect(upsert.text).toContain(fragment);
    }
    const rows = JSON.parse(upsert.values[0]);
    expect(rows.map((r) => [r.hand_id, r.analysis_version, r.hero_allin_ev])).toEqual([[first.id, 2, 12.5], [second.id, 2, null]]);
    expect(rows[0].decisions[0]).toMatchObject({ idx: heroDecision(first).idx, to_call: 2, ev_loss: 1.5, analysis_version: 2 });
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getSql } from '../../_lib/db.js';
import { mockRes, authedReq, TEST_AUTH } from '../../_lib/testing.js';
import { pokerSessionBody, pokerHandRecord, findHandRecord, heroActed, heroDecision } from '../../_lib/pokerTesting.js';
import { createPokerSessionsHandler } from './sessions.js';
import { createPokerHandsHandler } from './hands.js';

// Opt-in: POKER_DB_IT=1 with DATABASE_URL pointing at a migrated, disposable database
// (a Neon branch, never production). It writes one session and deletes it afterwards.
const RUN = Boolean(process.env.POKER_DB_IT && process.env.DATABASE_URL);
const auth = () => TEST_AUTH;

async function call(handler, options) {
  const res = mockRes();
  await handler(authedReq(options), res);
  return res;
}

describe.skipIf(!RUN)('poker persistence against a real database', () => {
  const sessionId = randomUUID();
  const openSessionId = randomUUID();
  const sessions = createPokerSessionsHandler({ auth });
  const hands = createPokerHandsHandler({ auth });

  // Lifted out of the main test so later cases can reuse the exact same rows
  // (same id) to exercise dedup/no-op paths against what is already stored.
  const first = findHandRecord(heroActed, { id: randomUUID(), sessionId, handNo: 1 });
  const second = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 2, seed: 99, button: 1 });
  const batch = { hands: [{ hand: first, decisions: [heroDecision(first)] }, { hand: second }] };

  afterAll(async () => {
    await getSql()`DELETE FROM poker_sessions WHERE id IN (${sessionId}, ${openSessionId})`;
  });

  it('saves, deduplicates, totals, closes and reads back a session', async () => {
    let res = await call(hands, { method: 'POST', body: batch });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');

    res = await call(sessions, { method: 'POST', body: pokerSessionBody({ id: sessionId }) });
    expect(res.body).toEqual({ id: sessionId, saved: true, duplicate: false });
    res = await call(sessions, { method: 'POST', body: pokerSessionBody({ id: sessionId }) });
    expect(res.body.duplicate).toBe(true);

    res = await call(hands, { method: 'POST', body: batch });
    expect(res.body).toEqual({ saved: true, inserted: 2, duplicate: 0 });
    res = await call(hands, { method: 'POST', body: batch });
    expect(res.body).toEqual({ saved: true, inserted: 0, duplicate: 2 });

    res = await call(sessions, { query: { status: 'open' } });
    expect(res.body.sessions.map((s) => s.id)).toContain(sessionId);

    const endedAt = '2026-09-16T19:00:00.000Z';
    res = await call(sessions, { method: 'PATCH', query: { id: sessionId }, body: { endedAt } });
    expect(res.statusCode).toBe(200);
    const net = first.heroNet + second.heroNet;
    expect(res.body).toMatchObject({ id: sessionId, closed: true, hands: 2, net, allinAdjNet: net, rebuys: 200 > 200 + first.heroNet ? 1 : 0 });
    expect(new Date(res.body.endedAt).toISOString()).toBe(endedAt);

    res = await call(sessions, { query: { status: 'open' } });
    expect(res.body.sessions.map((s) => s.id)).not.toContain(sessionId);

    res = await call(sessions, { query: { id: sessionId } });
    expect(res.statusCode).toBe(200);
    expect(res.body.hands.map((h) => h.handNo)).toEqual([1, 2]);
    expect(res.body.hands[0].events).toEqual(first.events);
    expect(res.body.decisions).toHaveLength(1);
    expect(res.body.session.hands).toBe(2);
  });

  it('a partially new batch (1 existing hand, 1 new hand) inserts only the new one and session hands increases by exactly 1', async () => {
    const before = await call(sessions, { query: { id: sessionId } });
    const startHands = before.body.session.hands;

    const third = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 3, seed: 7, button: 2 });
    // `first` is already stored from the earlier test; it must be a no-op, leaving only `third` inserted.
    const res = await call(hands, { method: 'POST', body: { hands: [{ hand: first }, { hand: third }] } });
    expect(res.body).toEqual({ saved: true, inserted: 1, duplicate: 1 });

    const after = await call(sessions, { query: { id: sessionId } });
    expect(after.body.session.hands).toBe(startHands + 1);
  });

  it('a different hand id reusing an existing (session_id, hand_no) is a 409 HAND_NO_CONFLICT and leaves totals unchanged', async () => {
    const before = await call(sessions, { query: { id: sessionId } });
    const { hands: startHands, net: startNet, allinAdjNet: startAdj } = before.body.session;

    // Same (sessionId, handNo=1) as `first`, but a brand new id: the unique constraint on
    // (session_id, hand_no) must catch this even though it can't collide on id.
    const clash = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 1, seed: 11, button: 3 });
    const res = await call(hands, { method: 'POST', body: { hands: [{ hand: clash }] } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'HAND_NO_CONFLICT', details: { handIds: [clash.id] } });

    const after = await call(sessions, { query: { id: sessionId } });
    expect(after.body.session).toMatchObject({ hands: startHands, net: startNet, allinAdjNet: startAdj });
  });

  it('a hand with a non-null heroAllinEv updates allin_adj_net using the numeric(…,2) column rounding, not naive float rounding', async () => {
    const before = await call(sessions, { query: { id: sessionId } });
    const startAdj = before.body.session.allinAdjNet;

    // 12.3456 has more precision than the numeric(10,2)/numeric(12,2) columns allow, so Postgres
    // rounds it on insert. Expect the *rounded* 12.35, not a truncated 12.34 or the raw value.
    const graded = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 4, seed: 21, button: 4 });
    const heroAllinEv = 12.3456;
    const res = await call(hands, { method: 'POST', body: { hands: [{ hand: graded, heroAllinEv }] } });
    expect(res.body).toEqual({ saved: true, inserted: 1, duplicate: 0 });

    const after = await call(sessions, { query: { id: sessionId } });
    const stored = after.body.hands.find((h) => h.id === graded.id);
    expect(stored.heroAllinEv).toBeCloseTo(12.35, 2);
    expect(after.body.session.allinAdjNet).toBeCloseTo(startAdj + 12.35, 2);
  });

  it('rejects a hand whose heroSeat does not match the session with 409 HERO_SEAT_MISMATCH', async () => {
    // The session was opened with heroSeat: 0 (pokerSessionBody's default); this hand claims seat 1.
    const mismatched = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 5, seed: 33, button: 5, heroSeat: 1 });
    const res = await call(hands, { method: 'POST', body: { hands: [{ hand: mismatched }] } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('HERO_SEAT_MISMATCH');
    expect(res.body.details).toEqual({ handIds: [mismatched.id] });
  });

  it('a hand saved after the close moves ended_at forward, while an open session keeps ended_at NULL', async () => {
    const before = await call(sessions, { query: { id: sessionId } });
    const endedAt = Date.parse(before.body.session.endedAt);

    // handNo 90 is played at started_at + 90 minutes, after the 19:00 close.
    const late = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 90, seed: 41, button: 1 });
    expect(Date.parse(late.playedAt)).toBeGreaterThan(endedAt);
    let res = await call(hands, { method: 'POST', body: { hands: [{ hand: late }] } });
    expect(res.body).toEqual({ saved: true, inserted: 1, duplicate: 0 });
    let after = await call(sessions, { query: { id: sessionId } });
    expect(new Date(after.body.session.endedAt).toISOString()).toBe(late.playedAt);

    res = await call(sessions, { method: 'POST', body: pokerSessionBody({ id: openSessionId }) });
    expect(res.body.saved).toBe(true);
    const openHand = pokerHandRecord({ id: randomUUID(), sessionId: openSessionId, handNo: 1 });
    res = await call(hands, { method: 'POST', body: { hands: [{ hand: openHand }] } });
    expect(res.body).toEqual({ saved: true, inserted: 1, duplicate: 0 });
    after = await call(sessions, { query: { id: openSessionId } });
    expect(after.body.session.endedAt).toBeNull();
  });
});

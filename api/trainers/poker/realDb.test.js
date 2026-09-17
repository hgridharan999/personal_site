import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getSql } from '../../_lib/db.js';
import { mockRes, authedReq, TEST_AUTH } from '../../_lib/testing.js';
import { pokerSessionBody, pokerHandRecord, findHandRecord, heroActed, heroDecision } from '../../_lib/pokerTesting.js';
import { createPokerSessionsHandler } from './sessions.js';
import { createPokerHandsHandler } from './hands.js';
import { createPokerProfileHandler } from './profile.js';

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
  const regradeSessionId = randomUUID();
  const sessions = createPokerSessionsHandler({ auth });
  const hands = createPokerHandsHandler({ auth });

  // Lifted out of the main test so later cases can reuse the exact same rows
  // (same id) to exercise dedup/no-op paths against what is already stored.
  const first = findHandRecord(heroActed, { id: randomUUID(), sessionId, handNo: 1 });
  const second = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 2, seed: 99, button: 1 });
  const batch = { hands: [{ hand: first, decisions: [heroDecision(first)] }, { hand: second }] };

  // Its own session so the GET-one-hand, ungraded-paging and re-grade cases below don't depend
  // on the exact hand/handNo state the earlier tests in this file leave behind.
  const h1 = findHandRecord(heroActed, { id: randomUUID(), sessionId: regradeSessionId, handNo: 1 });
  const h2 = findHandRecord(heroActed, { id: randomUUID(), sessionId: regradeSessionId, handNo: 2 });
  const h3 = findHandRecord(heroActed, { id: randomUUID(), sessionId: regradeSessionId, handNo: 3 });
  const roundA = findHandRecord(heroActed, { id: randomUUID(), sessionId: regradeSessionId, handNo: 4 });
  const roundB = findHandRecord(heroActed, { id: randomUUID(), sessionId: regradeSessionId, handNo: 5 });

  afterAll(async () => {
    await getSql()`DELETE FROM poker_sessions WHERE id IN (${sessionId}, ${openSessionId}, ${regradeSessionId})`;
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

  it('computes the profile from stored hands', async () => {
    const res = await call(createPokerProfileHandler({ auth }), {});
    expect(res.statusCode).toBe(200);
    expect(res.body.hands).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.profile.hands).toBe('number');
  });

  it('opens a second session for the GET-one-hand, ungraded-paging and re-grade cases below', async () => {
    const res = await call(sessions, { method: 'POST', body: pokerSessionBody({ id: regradeSessionId }) });
    expect(res.body).toEqual({ id: regradeSessionId, saved: true, duplicate: false });
    for (const hand of [h1, h2, h3, roundA, roundB]) {
      const saved = await call(hands, { method: 'POST', body: { hands: [{ hand }] } });
      expect(saved.body.inserted).toBe(1);
    }
  });

  it('GET one hand returns its prev/next neighbours within the same session', async () => {
    const mid = await call(hands, { query: { id: h2.id } });
    expect(mid.statusCode).toBe(200);
    expect(mid.body.hand.prevHandId).toBe(h1.id);
    expect(mid.body.hand.nextHandId).toBe(h3.id);

    const firstHand = await call(hands, { query: { id: h1.id } });
    expect(firstHand.body.hand.prevHandId).toBeNull();
    // roundA (handNo 4) is also stored in this session, so h3's neighbour is roundA, not null.
    const lastHand = await call(hands, { query: { id: h3.id } });
    expect(lastHand.body.hand.nextHandId).toBe(roundA.id);
  });

  it('GET ungraded pages hands after a cursor', async () => {
    const page1 = await call(hands, { query: { ungraded: '1', sessionId: regradeSessionId, belowVersion: '1', limit: '2' } });
    expect(page1.body.hands.map((h) => h.handNo)).toEqual([1, 2]);
    expect(page1.body.nextAfterHandNo).toBe(2);

    const page2 = await call(hands, {
      query: { ungraded: '1', sessionId: regradeSessionId, belowVersion: '1', afterHandNo: '2', limit: '2' },
    });
    expect(page2.body.hands.map((h) => h.handNo)).toEqual([3, 4]);
    expect(page2.body.nextAfterHandNo).toBe(4);

    const page3 = await call(hands, {
      query: { ungraded: '1', sessionId: regradeSessionId, belowVersion: '1', afterHandNo: '4', limit: '2' },
    });
    expect(page3.body.hands.map((h) => h.handNo)).toEqual([5]);
    expect(page3.body.nextAfterHandNo).toBeNull();
  });

  it('re-grades a stored hand once per higher analysis version; equal or lower versions are skipped', async () => {
    const before = await call(sessions, { query: { id: regradeSessionId } });
    const startAdj = before.body.session.allinAdjNet;
    const grade = (hand, version, heroAllinEv) => ({
      grades: [{ handId: hand.id, analysisVersion: version, decisions: [heroDecision(hand, { analysisVersion: version })], heroAllinEv }],
    });

    let res = await call(hands, { method: 'PATCH', body: grade(h1, 1, h1.heroNet + 10) });
    expect(res.body).toEqual({ updated: [h1.id], skipped: [], missing: [] });

    // Re-running the exact same batch (same analysisVersion already stored) is a no-op, even
    // though heroAllinEv differs: the delta must not be counted twice.
    res = await call(hands, { method: 'PATCH', body: grade(h1, 1, h1.heroNet + 99) });
    expect(res.body).toEqual({ updated: [], skipped: [h1.id], missing: [] });

    // A strictly higher version updates again, moving allin_adj_net by only this new delta.
    res = await call(hands, { method: 'PATCH', body: grade(h1, 2, h1.heroNet + 4) });
    expect(res.body.updated).toEqual([h1.id]);

    // A version lower than what is now stored (2) is skipped too.
    res = await call(hands, { method: 'PATCH', body: grade(h1, 1, h1.heroNet + 500) });
    expect(res.body).toEqual({ updated: [], skipped: [h1.id], missing: [] });

    const after = await call(sessions, { query: { id: regradeSessionId } });
    expect(after.body.session.allinAdjNet).toBeCloseTo(startAdj + 4, 2);
    const one = await call(hands, { query: { id: h1.id } });
    expect(one.body.hand.heroAllinEv).toBeCloseTo(h1.heroNet + 4, 2);
    expect(one.body.decisions.map((d) => d.analysisVersion)).toEqual([2]);

    const ungraded = await call(hands, { query: { ungraded: '1', sessionId: regradeSessionId, belowVersion: '2' } });
    expect(ungraded.body.hands.map((h) => h.id)).not.toContain(h1.id);
  });

  it('rounds hero_allin_ev to 2 decimals before it feeds the allin_adj_net delta, so the session total matches the stored hands', async () => {
    const before = await call(sessions, { query: { id: regradeSessionId } });
    const startAdj = before.body.session.allinAdjNet;

    // 0.004 rounds to 0.00 on each hand; summing the *unrounded* 0.004s first (0.008) would round
    // to 0.01 once added to the numeric(12,2) session column instead, so this only passes when
    // hero_allin_ev is rounded per-hand before it feeds the delta.
    const res = await call(hands, {
      method: 'PATCH',
      body: {
        grades: [roundA, roundB].map((hand) => ({
          handId: hand.id,
          analysisVersion: 1,
          decisions: [heroDecision(hand, { analysisVersion: 1 })],
          heroAllinEv: 0.004,
        })),
      },
    });
    // The upsert orders `updated` by hand id, not input order, so compare as a set.
    expect(res.body.skipped).toEqual([]);
    expect(res.body.missing).toEqual([]);
    expect(res.body.updated.slice().sort()).toEqual([roundA.id, roundB.id].sort());

    const [oneA, oneB] = await Promise.all([
      call(hands, { query: { id: roundA.id } }),
      call(hands, { query: { id: roundB.id } }),
    ]);
    expect(oneA.body.hand.heroAllinEv).toBeCloseTo(0, 2);
    expect(oneB.body.hand.heroAllinEv).toBeCloseTo(0, 2);

    const after = await call(sessions, { query: { id: regradeSessionId } });
    const expectedDelta = (0 - roundA.heroNet) + (0 - roundB.heroNet);
    expect(after.body.session.allinAdjNet).toBeCloseTo(startAdj + expectedDelta, 2);
  });
});

import { describe, it, expect } from 'vitest';
import { createPokerSessionsHandler, OPEN_SESSIONS_LIMIT } from './sessions.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { POKER_SESSION_ID as ID, POKER_STARTED_AT, pokerSessionBody, pokerHandRecord } from '../../_lib/pokerTesting.js';
import {
  REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT, shapeReviewHand, shapeSummary, shapeOpponents,
} from '../../_lib/pokerReview.js';
import { ANALYSIS_VERSION } from '../../../src/private/trainers/poker/analysis/version.js';

const make = (sql) => createPokerSessionsHandler({ getSql: () => sql, auth: () => TEST_AUTH });

async function call(sql, options) {
  const res = mockRes();
  await make(sql)(authedReq(options), res);
  return res;
}

describe('api/trainers/poker/sessions', () => {
  it('405 for other methods', async () => {
    const res = await call(mockSql(), { method: 'PUT' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST, PATCH');
  });

  it('401 without a session cookie, never cached', async () => {
    const res = await call(mockSql(), { method: 'POST', authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('500 when the database is not configured', async () => {
    const res = mockRes();
    await createPokerSessionsHandler({ getSql: () => null, auth: () => TEST_AUTH })(authedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('DB_NOT_CONFIGURED');
  });

  describe('POST', () => {
    it('400 with details for an invalid body', async () => {
      const res = await call(mockSql(), { method: 'POST', body: { id: 'x' } });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toBeDefined();
    });

    it('inserts the session idempotently on id', async () => {
      const sql = mockSql([[{ id: ID }]]);
      const res = await call(sql, { method: 'POST', body: pokerSessionBody() });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ id: ID, saved: true, duplicate: false });
      expect(sql.queries).toHaveLength(1);
      const [insert] = sql.queries;
      for (const fragment of ['INSERT INTO poker_sessions', 'ON CONFLICT (id) DO NOTHING', 'RETURNING id']) {
        expect(insert.text).toContain(fragment);
      }
      expect(insert.values).toEqual([ID, 'placeholder', 'random', JSON.stringify(pokerSessionBody().lineup), 0, POKER_STARTED_AT]);
    });

    it('400 before touching the database for a year-0000 start or a NUL string', async () => {
      const nul = `x${String.fromCharCode(0)}`;
      for (const bad of [{ startedAt: '0000-01-01T00:00:00.000Z' }, { botVersion: nul }]) {
        const sql = mockSql();
        const res = await call(sql, { method: 'POST', body: pokerSessionBody(bad) });
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(sql.queries).toHaveLength(0);
      }
    });

    it('reports a duplicate open', async () => {
      const res = await call(mockSql([[]]), { method: 'POST', body: pokerSessionBody() });
      expect(res.body).toEqual({ id: ID, saved: true, duplicate: true });
    });
  });

  describe('PATCH', () => {
    it('400 without a valid id or endedAt', async () => {
      let res = await call(mockSql(), { method: 'PATCH', query: { id: 'x' }, body: { endedAt: null } });
      expect(res.statusCode).toBe(400);
      res = await call(mockSql(), { method: 'PATCH', query: { id: ID }, body: {} });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('409 SESSION_NOT_FOUND when the session row does not exist yet', async () => {
      const res = await call(mockSql([[]]), { method: 'PATCH', query: { id: ID }, body: { endedAt: null } });
      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ error: 'Session not saved yet', code: 'SESSION_NOT_FOUND', details: { sessionIds: [ID] } });
    });

    it('closes with the given end time, computes rebuys and ignores client totals', async () => {
      const row = { id: ID, endedAt: '2026-09-16T19:00:00.000Z', hands: 12, net: -35, allinAdjNet: -20.5, rebuys: 1 };
      const sql = mockSql([[row]]);
      const body = { id: ID, endedAt: row.endedAt, hands: 99, net: 555, rebuys: 7 };
      const res = await call(sql, { method: 'PATCH', query: { id: ID }, body });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ...row, closed: true });
      const [update] = sql.queries;
      for (const fragment of ['lag(hero_start_stack + hero_net) OVER (ORDER BY hand_no)', 'max(played_at)', 'UPDATE poker_sessions s', 'COALESCE(']) {
        expect(update.text).toContain(fragment);
      }
      expect(update.values).toContain(row.endedAt);
      expect(update.values).not.toContain(99);
      expect(update.values).not.toContain(555);
      expect(update.values).not.toContain(7);
    });

    it('a stale close passes a null end time', async () => {
      const sql = mockSql([[{ id: ID, endedAt: POKER_STARTED_AT, hands: 0, net: 0, allinAdjNet: 0, rebuys: 0 }]]);
      const res = await call(sql, { method: 'PATCH', query: { id: ID }, body: { endedAt: null } });
      expect(res.statusCode).toBe(200);
      expect(sql.queries[0].values).toContain(null);
    });
  });

  describe('GET', () => {
    it('400 without a valid id and 404 when missing', async () => {
      let res = await call(mockSql(), { query: { id: 'x' } });
      expect(res.statusCode).toBe(400);
      res = await call(mockSql([[]]), { query: { id: ID } });
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    const start = pokerHandRecord({ button: 2 }).events[0];
    const handRow = (handNo) => ({
      id: `h${handNo}`, handNo, playedAt: POKER_STARTED_AT, heroSeat: 0, start, holeCards: [{ seat: 0, cards: 'AhKs' }],
      board: '', pot: 3, heroNet: -1, heroAllinEv: null, showdown: false, heroActions: 1, decisions: 1, evLoss: 0,
      severity: 0, confident: true, version: ANALYSIS_VERSION,
    });
    const reviewDb = ({ hands, session = { id: ID, hands: 2, net: 5, allinAdjNet: 3.5, lineup: [{ seat: 1, personaId: 'moss' }] } }) => {
      const summary = { decisions: 4, evLoss: 9, gradedHands: 2, ungradedHands: 1, good: 2, inaccuracy: 1, mistake: 1, blunder: 0, debatable: 1 };
      const costliest = [{ handId: 'h2', handNo: 2, idx: 12, evLoss: 6, grade: 'mistake', confident: true }];
      const opponents = [{ seat: 1, personaId: 'moss' }];
      const sql = mockSql((text) => {
        if (text.includes('FROM poker_sessions WHERE id')) return [session];
        if (text.includes('CROSS JOIN LATERAL (')) return hands;
        if (text.includes('AS "ungradedHands"')) return [summary];
        if (text.includes('ORDER BY d.ev_loss DESC')) return costliest;
        if (text.includes('jsonb_array_elements(h.lineup)')) return opponents;
        return [];
      });
      return { sql, session, summary, costliest, opponents };
    };

    it('returns the review page without event logs', async () => {
      const hands = [handRow(1), handRow(2)];
      const { sql, session, summary, costliest, opponents } = reviewDb({ hands });
      const res = await call(sql, { query: { id: ID } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        session,
        summary: shapeSummary(session, summary),
        costliest,
        opponents: shapeOpponents(opponents, session.lineup),
        hands: hands.map(shapeReviewHand),
        nextAfterHandNo: null,
      });
      const handQuery = sql.queries.find((q) => q.text.includes('CROSS JOIN LATERAL ('));
      expect(handQuery.text).toContain('h.events->0 AS start');
      expect(handQuery.text).not.toMatch(/h\.events,/);
      expect(handQuery.values).toEqual([ID, 0, REVIEW_PAGE_HANDS + 1]);
      const summaryQuery = sql.queries.find((q) => q.text.includes('AS "ungradedHands"'));
      expect(summaryQuery.values).toEqual([ID, ANALYSIS_VERSION, ID]);
      const costliestQuery = sql.queries.find((q) => q.text.includes('ORDER BY d.ev_loss DESC'));
      expect(costliestQuery.values).toEqual([ID, COSTLIEST_LIMIT]);
    });

    it('pages hands after a cursor', async () => {
      const hands = Array.from({ length: REVIEW_PAGE_HANDS + 1 }, (_, i) => handRow(301 + i));
      const { sql } = reviewDb({ hands });
      const res = await call(sql, { query: { id: ID, afterHandNo: '300' } });
      expect(res.body.hands).toHaveLength(REVIEW_PAGE_HANDS);
      expect(res.body.nextAfterHandNo).toBe(600);
      expect(sql.queries.find((q) => q.text.includes('CROSS JOIN LATERAL (')).values).toEqual([ID, 300, REVIEW_PAGE_HANDS + 1]);
    });

    it('lists open sessions with their last activity', async () => {
      const sessions = [{ id: ID, startedAt: POKER_STARTED_AT, hands: 3, lastActivityAt: '2026-09-16T18:03:00.000Z' }];
      const sql = mockSql([sessions]);
      const res = await call(sql, { query: { status: 'open' } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ sessions });
      expect(sql.queries[0].text).toContain('WHERE s.ended_at IS NULL');
      expect(sql.queries[0].text).toContain('GREATEST(s.started_at, max(h.played_at))');
      expect(sql.queries[0].values).toEqual([OPEN_SESSIONS_LIMIT]);
      expect(OPEN_SESSIONS_LIMIT).toBe(20);
    });

    it('lists recent sessions with hands', async () => {
      const sessions = [{ id: ID, startedAt: POKER_STARTED_AT, endedAt: null, tableMode: 'random', hands: 3, net: 4, allinAdjNet: 4 }];
      const sql = mockSql([sessions]);
      const res = await call(sql, { query: { status: 'recent' } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ sessions });
      expect(sql.queries[0].text).toContain('WHERE hands > 0');
      expect(sql.queries[0].text).toContain('ORDER BY started_at DESC, id DESC');
      expect(sql.queries[0].values).toEqual([RECENT_SESSIONS_LIMIT]);
    });

    it('400 for an unknown status', async () => {
      const res = await call(mockSql(), { query: { status: 'closed' } });
      expect(res.statusCode).toBe(400);
    });
  });

  it('500 INTERNAL when the database throws', async () => {
    const sql = mockSql(() => Promise.reject(new Error('boom')));
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args);
    try {
      const res = await call(sql, { method: 'POST', body: pokerSessionBody() });
      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL');
      expect(errors[0][0]).toBe('trainers/poker/sessions failed:');
    } finally {
      console.error = original;
    }
  });
});

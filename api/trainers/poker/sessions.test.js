import { describe, it, expect } from 'vitest';
import { createPokerSessionsHandler, OPEN_SESSIONS_LIMIT } from './sessions.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { POKER_SESSION_ID as ID, POKER_STARTED_AT, pokerSessionBody } from '../../_lib/pokerTesting.js';

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
    it('400 without a valid id, 404 when missing, 200 with hands and decisions', async () => {
      let res = await call(mockSql(), { query: { id: 'x' } });
      expect(res.statusCode).toBe(400);

      res = await call(mockSql([[]]), { query: { id: ID } });
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      const session = { id: ID, hands: 2 };
      const hands = [{ id: 'h1', handNo: 1 }, { id: 'h2', handNo: 2 }];
      const decisions = [{ handId: 'h1', idx: 4 }];
      const sql = mockSql((text) => {
        if (text.includes('FROM poker_decisions d')) return decisions;
        if (text.includes('FROM poker_hands WHERE session_id')) return hands;
        if (text.includes('FROM poker_sessions WHERE id')) return [session];
        return [];
      });
      res = await call(sql, { query: { id: ID } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ session, hands, decisions });
      expect(sql.queries.find((q) => q.text.includes('FROM poker_hands WHERE session_id')).text).toContain('ORDER BY hand_no');
      expect(sql.queries.find((q) => q.text.includes('FROM poker_decisions d')).text).toContain('ORDER BY h.hand_no, d.idx');
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

import { describe, it, expect } from 'vitest';
import { createSessionsHandler } from './sessions.js';
import { mockRes, authedReq, mockSql, TEST_AUTH, zetamacPayload } from '../_lib/testing.js';

const make = (sql) => createSessionsHandler({ getSql: () => sql, auth: () => TEST_AUTH });
const ID = '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c';

describe('api/trainers/sessions', () => {
  it('405 for other methods', async () => {
    const res = mockRes();
    await make(mockSql())(authedReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST');
  });

  it('401 without a session cookie', async () => {
    const res = mockRes();
    await make(mockSql())(authedReq({ method: 'POST', authed: false }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('500 when the database is not configured', async () => {
    const res = mockRes();
    await createSessionsHandler({ getSql: () => null, auth: () => TEST_AUTH })(authedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('DB_NOT_CONFIGURED');
  });

  it('400 with details for an invalid payload', async () => {
    const res = mockRes();
    await make(mockSql())(authedReq({ method: 'POST', body: { session: {} } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
  });

  it('saves session + attempts in one atomic statement gated on the session insert', async () => {
    const sql = mockSql([[{ inserted: 1 }]]);
    const res = mockRes();
    await make(sql)(authedReq({ method: 'POST', body: zetamacPayload() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: ID, saved: true, duplicate: false });
    expect(sql.transactions).toHaveLength(0);
    expect(sql.queries).toHaveLength(1);
    const [save] = sql.queries;
    for (const fragment of ['WITH s AS', 'INSERT INTO sessions', 'ON CONFLICT (id) DO NOTHING', 'RETURNING id', 'INSERT INTO attempts', 'jsonb_to_recordset', 'JOIN s']) {
      expect(save.text).toContain(fragment);
    }
    expect(save.values[0]).toBe(ID);
    const rowsParam = save.values.find((v) => typeof v === 'string' && v.startsWith('['));
    const rows = JSON.parse(rowsParam);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      session_id: ID, idx: 0, qtype: 'z.mul', fact_key: 'mul:7x83', prompt: '7 × 83', answer: '581',
      response: '581', is_correct: true, time_ms: 2140, corrections: 0,
    });
  });

  it('reports a duplicate retry without inserting attempts', async () => {
    const sql = mockSql([[{ inserted: 0 }]]);
    const res = mockRes();
    await make(sql)(authedReq({ method: 'POST', body: zetamacPayload() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: ID, saved: true, duplicate: true });
    expect(sql.queries).toHaveLength(1);
  });

  it('GET 400 without a valid id, 404 when missing, 200 with attempts', async () => {
    let res = mockRes();
    await make(mockSql())(authedReq({ query: { id: 'x' } }), res);
    expect(res.statusCode).toBe(400);

    res = mockRes();
    await make(mockSql([[]]))(authedReq({ query: { id: ID } }), res);
    expect(res.statusCode).toBe(404);

    const session = { id: ID, trainer: 'zetamac' };
    const attempts = [{ idx: 0 }, { idx: 1 }];
    res = mockRes();
    await make(mockSql([[session], attempts]))(authedReq({ query: { id: ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ session, attempts });
  });

  it('500 INTERNAL when the database throws', async () => {
    const sql = mockSql(() => Promise.reject(new Error('boom')));
    const res = mockRes();
    await make(sql)(authedReq({ method: 'POST', body: zetamacPayload() }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('INTERNAL');
  });
});

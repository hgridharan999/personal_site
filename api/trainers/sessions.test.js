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

  it('saves session + attempts in one transaction', async () => {
    const sql = mockSql();
    sql.transactionResult = [[{ id: ID }], []];
    const res = mockRes();
    await make(sql)(authedReq({ method: 'POST', body: zetamacPayload() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: ID, saved: true, duplicate: false });
    expect(sql.transactions).toHaveLength(1);
    const [insertSession, insertAttempts] = sql.transactions[0];
    expect(insertSession.text).toMatch(/INSERT INTO sessions/);
    expect(insertSession.text).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    expect(insertSession.values[0]).toBe(ID);
    expect(insertAttempts.text).toMatch(/jsonb_to_recordset/);
    const rows = JSON.parse(insertAttempts.values[0]);
    expect(rows[0]).toMatchObject({ session_id: ID, idx: 0, fact_key: 'mul:7x83', is_correct: true, time_ms: 2140 });
  });

  it('reports a duplicate retry', async () => {
    const sql = mockSql();
    sql.transactionResult = [[], []];
    const res = mockRes();
    await make(sql)(authedReq({ method: 'POST', body: zetamacPayload() }), res);
    expect(res.body).toEqual({ id: ID, saved: true, duplicate: true });
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
    const sql = mockSql();
    sql.transaction = async () => { throw new Error('boom'); };
    const res = mockRes();
    await make(sql)(authedReq({ method: 'POST', body: zetamacPayload() }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('INTERNAL');
  });
});

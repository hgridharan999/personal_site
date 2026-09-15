import { describe, it, expect } from 'vitest';
import { createDrillHandler } from './drill.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../_lib/testing.js';

const make = (sql) => createDrillHandler({ getSql: () => sql, auth: () => TEST_AUTH });

describe('api/trainers/drill', () => {
  it('locked before 3 standard games', async () => {
    const sql = mockSql((text) => (text.includes('count(*)::int AS games') ? [{ games: 2 }] : []));
    const res = mockRes();
    await make(sql)(authedReq(), res);
    expect(res.body).toEqual({ standardGames: 2, unlocked: false, facts: [] });
  });

  it('ranks weak facts when unlocked', async () => {
    const rows = [
      { factKey: 'mul:7x83', qtype: 'z.mul', n: 3, medianMs: 4000, correctionsRate: 0 },
      { factKey: 'mul:3x10', qtype: 'z.mul', n: 3, medianMs: 1000, correctionsRate: 0 },
    ];
    const sql = mockSql((text) => (text.includes('count(*)::int AS games') ? [{ games: 5 }] : rows));
    const res = mockRes();
    await make(sql)(authedReq(), res);
    expect(res.body.unlocked).toBe(true);
    expect(res.body.facts.map((f) => f.factKey)).toEqual(['mul:7x83', 'mul:3x10']);
    const factQuery = sql.queries.find((q) => q.text.includes('WITH recent'));
    expect(factQuery.values).toContain(20);
  });

  it('405 for POST', async () => {
    const res = mockRes();
    await make(mockSql())(authedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});

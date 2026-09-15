import { describe, it, expect } from 'vitest';
import { createStatsHandler } from './stats.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../_lib/testing.js';

const KEY = 'b'.repeat(64);
const make = (sql) => createStatsHandler({ getSql: () => sql, auth: () => TEST_AUTH });

describe('api/trainers/stats', () => {
  it('401 without session, 400 for bad trainer', async () => {
    let res = mockRes();
    await make(mockSql())(authedReq({ query: { trainer: 'zetamac' }, authed: false }), res);
    expect(res.statusCode).toBe(401);
    res = mockRes();
    await make(mockSql())(authedReq({ query: { trainer: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns an empty structure when there are no games', async () => {
    const res = mockRes();
    await make(mockSql(() => []))(authedReq({ query: { trainer: 'optiver' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      configs: [], configKey: null, series: [], byType: [],
      pace: { bucketSize: 10, rows: [] }, histogram: { binWidthMs: 1000, bins: [] },
      overall: { n: 0, medianMs: null, p90Ms: null },
      slowest: [], timesGrid: [], slowFacts: [], carries: [], wrongLog: [],
    });
  });

  it('picks the newest config for the mode and shapes zetamac stats', async () => {
    const sql = mockSql((text) => {
      if (text.includes('GROUP BY config_key, mode')) {
        return [
          { configKey: 'c'.repeat(64), mode: 'custom', games: 1, lastPlayed: '2026-09-14', config: {} },
          { configKey: KEY, mode: 'standard', games: 4, lastPlayed: '2026-09-13', config: {} },
        ];
      }
      if (text.includes('duration_ms AS "durationMs"')) return [{ id: 's1', score: 40 }];
      if (text.includes("LIKE 'mul:%'")) return [{ factKey: 'mul:7x13', n: 2, medianMs: 1800 }];
      if (text.includes("IN ('z.add', 'z.sub')")) return [{ factKey: 'add:58+67', qtype: 'z.add', n: 1, totalMs: 3000 }];
      return [];
    });
    const res = mockRes();
    await make(sql)(authedReq({ query: { trainer: 'zetamac' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.configKey).toBe(KEY);
    expect(res.body.series).toEqual([{ id: 's1', score: 40 }]);
    expect(res.body.pace.bucketSize).toBe(5);
    expect(res.body.histogram.binWidthMs).toBe(500);
    expect(res.body.timesGrid).toEqual([{ a: 7, b: 13, n: 2, medianMs: 1800 }]);
    expect(res.body.carries).toEqual([{ qtype: 'z.add', carries: 2, n: 1, meanMs: 3000 }]);
    expect(res.body.wrongLog).toEqual([]);
    // match on the series-only column alias: the configs query also contains "ORDER BY started_at"
    const seriesQuery = sql.queries.find((q) => q.text.includes('duration_ms AS "durationMs"'));
    expect(seriesQuery.values).toEqual(['zetamac', 'standard', KEY]);
  });

  it('loads the newest config per (config_key, mode) without aggregating every config', async () => {
    const sql = mockSql(() => []);
    await make(sql)(authedReq({ query: { trainer: 'zetamac' } }), mockRes());
    const configsQuery = sql.queries.find((q) => q.text.includes('GROUP BY config_key, mode'));
    expect(configsQuery).toBeDefined();
    expect(configsQuery.text).not.toContain('array_agg');
    expect(configsQuery.text).toContain('DISTINCT ON (config_key, mode)');
    expect(configsQuery.text).toContain('ORDER BY config_key, mode, started_at DESC');
    for (const alias of ['"configKey"', 'mode', 'games', '"lastPlayed"', 'config']) {
      expect(configsQuery.text).toContain(alias);
    }
    expect(configsQuery.values).toEqual(['zetamac', 'zetamac']);
  });

  it('honors an explicit configKey', async () => {
    const other = 'd'.repeat(64);
    const sql = mockSql(() => []);
    const res = mockRes();
    await make(sql)(authedReq({ query: { trainer: 'optiver', configKey: other } }), res);
    expect(res.body.configKey).toBe(other);
  });
});

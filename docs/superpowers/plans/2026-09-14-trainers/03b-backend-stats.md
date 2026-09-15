# Phase 3b: Stats and Drill API (Task 10)

Read `00-overview.md` and `03a-backend-sessions.md` first. Depends on Task 2 (`core/stats.js`), Task 8 and Task 9.

---

### Task 10: Fact helpers, stats endpoint, drill endpoint, nested dev routes

**Files:**
- Create: `src/private/trainers/core/facts.js`
- Create: `api/_lib/statsShape.js`
- Create: `api/trainers/stats.js`
- Create: `api/trainers/drill.js`
- Modify: `api/_lib/testing.js` (let `mockSql` accept a resolver function)
- Modify: `vite.api-dev.js` (nested paths + `req.query`)
- Test: `src/private/trainers/core/facts.test.js`, `api/_lib/statsShape.test.js`, `api/trainers/stats.test.js`, `api/trainers/drill.test.js`

**Interfaces:**
- Consumes:
  - `stdDev`, `mean` (Task 2)
  - `guard`, `sendError`, `statsQuery`, `getSql` (Tasks 8–9)
  - `mockRes`, `authedReq`, `mockSql`, `TEST_AUTH` (Task 9)
- Produces:
  - `core/facts.js`:
    - `DRILL_UNLOCK_GAMES = 3`, `DRILL_RECENT_GAMES = 20`, `DRILL_POOL_SIZE = 40`
    - `parseFactKey(key: string): { op: 'add'|'sub'|'mul'|'div', a: number, b: number } | null`, returning the original operands: `add:a+b`; `sub:(a+b)-a` gives `{a, b}`; `mul:axb`; `div:(a*b)/a` gives `{a, b}`
    - `countCarries(a: number, b: number): number`, the carries in column addition. The borrows in `(a+b) − a` equal the carries in `a + b`.
    - `rankWeakFacts(rows: {factKey, qtype, n, medianMs, correctionsRate}[], limit = DRILL_POOL_SIZE): (row & { weakness: number })[]`, where weakness = z-score of `medianMs` within its `qtype` (0 when that group's std dev is null or 0) + 1.5 × `correctionsRate`, sorted descending
  - `api/_lib/statsShape.js`:
    - `timesGrid(rows: {factKey, n, medianMs}[]): {a, b, n, medianMs}[]`, keeping `mul` facts with b ≤ 20
    - `carriesBreakdown(rows: {factKey, qtype, n, totalMs}[]): {qtype, carries, n, meanMs}[]`, sorted by qtype then carries
    - `factModesFor(mode): string[]`, where `standard` gives `['standard','drill']` and any other mode gives `[mode]`
  - `GET /api/trainers/stats?trainer=&mode=&configKey=` returns `200 StatsResponse`:
    ```js
    {
      configs: [{ configKey, mode, games, lastPlayed, profileVersion, config }],   // every config for the trainer, newest first
      configKey: string | null,                                   // requested, else newest for `mode`, else null
      series: [{ id, startedAt, score, correct, wrong, unanswered, durationMs }],  // oldest → newest
      byType: [{ qtype, n, accuracy, medianMs, p90Ms, avgCorrections }],
      pace: { bucketSize, rows: [{ bucket, n, medianMs }] },     // zetamac 5, optiver 10
      histogram: { binWidthMs, bins: [{ bin, n }] },              // zetamac 500 ms, optiver 1000 ms; bin 19 = "≥ 19×width"
      overall: { n, medianMs, p90Ms },                            // exact, over all timed attempts (medianMs/p90Ms null when n = 0)
      slowest: [{ sessionId, idx, prompt, answer, response, isCorrect, timeMs, startedAt }],  // top 20
      timesGrid: [{ a, b, n, medianMs }],                         // zetamac only, else []
      slowFacts: [{ factKey, qtype, n, medianMs, avgCorrections }],  // zetamac only, n ≥ 2, top 20
      carries: [{ qtype, carries, n, meanMs }],                   // zetamac only
      wrongLog: [{ sessionId, idx, prompt, response, answer, startedAt }],  // optiver only, latest 50
    }
    ```
  - `GET /api/trainers/drill` returns `200 { standardGames: number, unlocked: boolean, facts: ranked weak facts (≤ 40) }`
  - `createStatsHandler({ getSql, auth })`, `createDrillHandler({ getSql, auth })`
  - `mockSql(resultsOrResolver)`: when given a function `(text, values) => rows`, awaited queries resolve with its return value

All SQL uses quoted camelCase aliases and the casts `::int` / `::float8` (see the note at the top of `03a`).

- [ ] **Step 1: Write the failing tests for the pure helpers**

`src/private/trainers/core/facts.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseFactKey, countCarries, rankWeakFacts, DRILL_UNLOCK_GAMES, DRILL_RECENT_GAMES, DRILL_POOL_SIZE } from './facts.js';

describe('parseFactKey', () => {
  it.each([
    ['add:37+58', { op: 'add', a: 37, b: 58 }],
    ['sub:95-37', { op: 'sub', a: 37, b: 58 }],
    ['mul:7x83', { op: 'mul', a: 7, b: 83 }],
    ['div:581/7', { op: 'div', a: 7, b: 83 }],
  ])('%s', (key, expected) => {
    expect(parseFactKey(key)).toEqual(expected);
  });
  it.each(['add:3x4', 'mul:3+4', 'div:10/3', 'div:10/0', 'sub:5-9', 'pow:2^3', '', null])('rejects %j', (key) => {
    expect(parseFactKey(key)).toBeNull();
  });
});

describe('countCarries', () => {
  it.each([[12, 34, 0], [58, 67, 2], [95, 5, 2], [99, 1, 2], [500, 500, 1], [0, 0, 0]])('%i + %i → %i', (a, b, c) => {
    expect(countCarries(a, b)).toBe(c);
  });
});

describe('rankWeakFacts', () => {
  const rows = [
    { factKey: 'mul:7x83', qtype: 'z.mul', n: 3, medianMs: 4000, correctionsRate: 0 },
    { factKey: 'mul:3x10', qtype: 'z.mul', n: 3, medianMs: 1000, correctionsRate: 0 },
    { factKey: 'mul:9x99', qtype: 'z.mul', n: 3, medianMs: 2500, correctionsRate: 1 },
    { factKey: 'add:2+2', qtype: 'z.add', n: 2, medianMs: 9000, correctionsRate: 0 },
  ];
  it('scores z within qtype plus 1.5 × corrections, sorted desc', () => {
    const ranked = rankWeakFacts(rows);
    expect(ranked.map((r) => r.factKey)).toEqual(['mul:9x99', 'mul:7x83', 'add:2+2', 'mul:3x10']);
    expect(ranked.find((r) => r.factKey === 'add:2+2').weakness).toBe(0);
    expect(ranked[0].weakness).toBeCloseTo(1.5, 6);
    expect(ranked[1].weakness).toBeCloseTo(1, 6);
  });
  it('applies the limit and exposes constants', () => {
    expect(rankWeakFacts(rows, 2)).toHaveLength(2);
    expect([DRILL_UNLOCK_GAMES, DRILL_RECENT_GAMES, DRILL_POOL_SIZE]).toEqual([3, 20, 40]);
  });
});
```

`api/_lib/statsShape.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { timesGrid, carriesBreakdown, factModesFor } from './statsShape.js';

describe('statsShape', () => {
  it('timesGrid keeps mul facts with b ≤ 20', () => {
    expect(timesGrid([
      { factKey: 'mul:7x13', n: 2, medianMs: 1800 },
      { factKey: 'mul:7x83', n: 1, medianMs: 3000 },
      { factKey: 'add:1+2', n: 1, medianMs: 500 },
    ])).toEqual([{ a: 7, b: 13, n: 2, medianMs: 1800 }]);
  });
  it('carriesBreakdown groups add/sub facts by carry count', () => {
    expect(carriesBreakdown([
      { factKey: 'add:12+34', qtype: 'z.add', n: 2, totalMs: 2000 },
      { factKey: 'add:58+67', qtype: 'z.add', n: 1, totalMs: 3000 },
      { factKey: 'add:21+43', qtype: 'z.add', n: 2, totalMs: 1000 },
      { factKey: 'sub:125-58', qtype: 'z.sub', n: 1, totalMs: 4000 },
    ])).toEqual([
      { qtype: 'z.add', carries: 0, n: 4, meanMs: 750 },
      { qtype: 'z.add', carries: 2, n: 1, meanMs: 3000 },
      { qtype: 'z.sub', carries: 2, n: 1, meanMs: 4000 },
    ]);
  });
  it('factModesFor', () => {
    expect(factModesFor('standard')).toEqual(['standard', 'drill']);
    expect(factModesFor('custom')).toEqual(['custom']);
    expect(factModesFor('drill')).toEqual(['drill']);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/private/trainers/core/facts.test.js api/_lib/statsShape.test.js`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement the pure helpers**

`src/private/trainers/core/facts.js`:

```js
import { mean, stdDev } from './stats.js';

// Zetamac fact keys (spec §4.3) and drill weakness ranking (spec §4.4).
// Shared by the drill API (server) and the drill generator (client).

export const DRILL_UNLOCK_GAMES = 3;
export const DRILL_RECENT_GAMES = 20;
export const DRILL_POOL_SIZE = 40;

const FACT = /^(add|sub|mul|div):(\d+)([+\-x/])(\d+)$/;
const OPERATOR = { add: '+', sub: '-', mul: 'x', div: '/' };

export function parseFactKey(key) {
  const m = typeof key === 'string' ? FACT.exec(key) : null;
  if (!m || OPERATOR[m[1]] !== m[3]) return null;
  const [op, x, y] = [m[1], Number(m[2]), Number(m[4])];
  switch (op) {
    case 'add':
    case 'mul':
      return { op, a: x, b: y };
    case 'sub':
      return x >= y ? { op, a: y, b: x - y } : null;
    case 'div':
      return y !== 0 && x % y === 0 ? { op, a: y, b: x / y } : null;
    default:
      return null;
  }
}

export function countCarries(a, b) {
  let carries = 0;
  let carry = 0;
  while (a > 0 || b > 0) {
    carry = (a % 10) + (b % 10) + carry >= 10 ? 1 : 0;
    carries += carry;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return carries;
}

export function rankWeakFacts(rows, limit = DRILL_POOL_SIZE) {
  const byType = new Map();
  for (const r of rows) byType.set(r.qtype, [...(byType.get(r.qtype) || []), r.medianMs]);
  const moments = new Map([...byType].map(([qtype, ms]) => [qtype, { m: mean(ms), sd: stdDev(ms) }]));

  return rows
    .map((r) => {
      const { m, sd } = moments.get(r.qtype);
      const z = sd ? (r.medianMs - m) / sd : 0;
      return { ...r, weakness: z + 1.5 * r.correctionsRate };
    })
    .sort((x, y) => y.weakness - x.weakness)
    .slice(0, limit);
}
```

`api/_lib/statsShape.js`:

```js
import { parseFactKey, countCarries } from '../../src/private/trainers/core/facts.js';

export function factModesFor(mode) {
  return mode === 'standard' ? ['standard', 'drill'] : [mode];
}

export function timesGrid(rows) {
  return rows.flatMap((r) => {
    const f = parseFactKey(r.factKey);
    return f && f.op === 'mul' && f.b <= 20 ? [{ a: f.a, b: f.b, n: r.n, medianMs: r.medianMs }] : [];
  });
}

export function carriesBreakdown(rows) {
  const groups = new Map();
  for (const r of rows) {
    const f = parseFactKey(r.factKey);
    if (!f || (f.op !== 'add' && f.op !== 'sub')) continue;
    const key = `${r.qtype}|${countCarries(f.a, f.b)}`;
    const g = groups.get(key) || { qtype: r.qtype, carries: countCarries(f.a, f.b), n: 0, totalMs: 0 };
    g.n += r.n;
    g.totalMs += r.totalMs;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ qtype, carries, n, totalMs }) => ({ qtype, carries, n, meanMs: totalMs / n }))
    .sort((x, y) => x.qtype.localeCompare(y.qtype) || x.carries - y.carries);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/private/trainers/core/facts.test.js api/_lib/statsShape.test.js`
Expected: PASS.

- [ ] **Step 5: Let `mockSql` accept a resolver**

In `api/_lib/testing.js`, replace the `mockSql` function with:

```js
export function mockSql(resultsOrResolver = []) {
  const resolver = typeof resultsOrResolver === 'function' ? resultsOrResolver : null;
  const queue = resolver ? [] : [...resultsOrResolver];
  const queries = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    const q = {
      text,
      values,
      then: (resolve, reject) =>
        Promise.resolve(resolver ? resolver(text, values) : (queue.shift() ?? [])).then(resolve, reject),
    };
    queries.push(q);
    return q;
  };
  sql.queries = queries;
  sql.transactions = [];
  sql.transactionResult = null;
  sql.transaction = async (qs) => {
    sql.transactions.push(qs);
    return sql.transactionResult ?? [[{ id: 'x' }], []];
  };
  return sql;
}
```

Run: `npx vitest run api/trainers/sessions.test.js`
Expected: still PASS.

- [ ] **Step 6: Write the failing handler tests**

`api/trainers/stats.test.js`:

```js
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

  it('honors an explicit configKey', async () => {
    const other = 'd'.repeat(64);
    const sql = mockSql(() => []);
    const res = mockRes();
    await make(sql)(authedReq({ query: { trainer: 'optiver', configKey: other } }), res);
    expect(res.body.configKey).toBe(other);
  });
});
```

`api/trainers/drill.test.js`:

```js
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
```

- [ ] **Step 7: Run the tests and confirm they fail**

Run: `npx vitest run api/trainers/stats.test.js api/trainers/drill.test.js`
Expected: FAIL with unresolved imports.

- [ ] **Step 8: Implement the stats endpoint**

`api/trainers/stats.js`:

```js
import { z } from 'zod';
import { getSql as defaultGetSql } from '../_lib/db.js';
import { authConfig } from '../_lib/session.js';
import { guard, sendError } from '../_lib/http.js';
import { statsQuery } from '../_lib/trainerSchemas.js';
import { timesGrid, carriesBreakdown, factModesFor } from '../_lib/statsShape.js';

// GET /api/trainers/stats?trainer=zetamac|optiver&mode=standard|custom|drill&configKey=<hex>

const SHAPE = {
  zetamac: { bucketSize: 5, binWidthMs: 500 },
  optiver: { bucketSize: 10, binWidthMs: 1000 },
};

function emptyStats(trainer, configs, configKey) {
  const { bucketSize, binWidthMs } = SHAPE[trainer];
  return {
    configs, configKey, series: [], byType: [],
    pace: { bucketSize, rows: [] }, histogram: { binWidthMs, bins: [] }, overall: NO_OVERALL,
    slowest: [], timesGrid: [], slowFacts: [], carries: [], wrongLog: [],
  };
}

const NO_OVERALL = Object.freeze({ n: 0, medianMs: null, p90Ms: null });

async function loadStats(sql, { trainer, mode, configKey }) {
  const configs = await sql`
    SELECT config_key AS "configKey", mode, count(*)::int AS games, max(started_at) AS "lastPlayed",
           max(profile_version) AS "profileVersion",
           (array_agg(config ORDER BY started_at DESC))[1] AS config
    FROM sessions WHERE trainer = ${trainer}
    GROUP BY config_key, mode ORDER BY max(started_at) DESC`;
  const key = configKey ?? configs.find((c) => c.mode === mode)?.configKey ?? null;
  if (!key) return emptyStats(trainer, configs, null);

  const { bucketSize, binWidthMs } = SHAPE[trainer];
  const factModes = factModesFor(mode);
  const zetamac = trainer === 'zetamac';

  const [series, overallRows, byType, pace, bins, slowest, gridRows, slowFacts, carryRows, wrongLog] = await Promise.all([
    sql`SELECT id, started_at AS "startedAt", score, correct, wrong, unanswered, duration_ms AS "durationMs"
        FROM sessions WHERE trainer = ${trainer} AND mode = ${mode} AND config_key = ${key}
        ORDER BY started_at`,
    sql`SELECT count(*)::int AS n,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "medianMs",
               percentile_cont(0.9) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "p90Ms"
        FROM attempts a JOIN sessions s ON s.id = a.session_id
        WHERE s.trainer = ${trainer} AND s.mode = ${mode} AND s.config_key = ${key} AND a.time_ms IS NOT NULL`,
    sql`SELECT a.qtype, count(*)::int AS n, avg(a.is_correct::int)::float8 AS accuracy,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "medianMs",
               percentile_cont(0.9) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "p90Ms",
               avg(a.corrections)::float8 AS "avgCorrections"
        FROM attempts a JOIN sessions s ON s.id = a.session_id
        WHERE s.trainer = ${trainer} AND s.mode = ${mode} AND s.config_key = ${key} AND a.time_ms IS NOT NULL
        GROUP BY a.qtype ORDER BY a.qtype`,
    sql`SELECT (a.idx / ${bucketSize}::int) * ${bucketSize}::int AS bucket, count(*)::int AS n,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "medianMs"
        FROM attempts a JOIN sessions s ON s.id = a.session_id
        WHERE s.trainer = ${trainer} AND s.mode = ${mode} AND s.config_key = ${key} AND a.time_ms IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
    sql`SELECT LEAST(a.time_ms / ${binWidthMs}::int, 19) AS bin, count(*)::int AS n
        FROM attempts a JOIN sessions s ON s.id = a.session_id
        WHERE s.trainer = ${trainer} AND s.mode = ${mode} AND s.config_key = ${key} AND a.time_ms IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
    sql`SELECT a.session_id AS "sessionId", a.idx, a.prompt, a.answer, a.response, a.is_correct AS "isCorrect",
               a.time_ms AS "timeMs", s.started_at AS "startedAt"
        FROM attempts a JOIN sessions s ON s.id = a.session_id
        WHERE s.trainer = ${trainer} AND s.mode = ${mode} AND s.config_key = ${key} AND a.time_ms IS NOT NULL
        ORDER BY a.time_ms DESC LIMIT 20`,
    zetamac
      ? sql`SELECT a.fact_key AS "factKey", count(*)::int AS n,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "medianMs"
            FROM attempts a JOIN sessions s ON s.id = a.session_id
            WHERE s.trainer = 'zetamac' AND s.mode = ANY(${factModes}) AND s.config_key = ${key}
              AND a.time_ms IS NOT NULL AND a.fact_key LIKE 'mul:%'
            GROUP BY a.fact_key`
      : [],
    zetamac
      ? sql`SELECT a.fact_key AS "factKey", a.qtype, count(*)::int AS n,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "medianMs",
                   avg(a.corrections)::float8 AS "avgCorrections"
            FROM attempts a JOIN sessions s ON s.id = a.session_id
            WHERE s.trainer = 'zetamac' AND s.mode = ANY(${factModes}) AND s.config_key = ${key}
              AND a.time_ms IS NOT NULL AND a.fact_key IS NOT NULL
            GROUP BY a.fact_key, a.qtype HAVING count(*) >= 2
            ORDER BY "medianMs" DESC LIMIT 20`
      : [],
    zetamac
      ? sql`SELECT a.fact_key AS "factKey", a.qtype, count(*)::int AS n, sum(a.time_ms)::float8 AS "totalMs"
            FROM attempts a JOIN sessions s ON s.id = a.session_id
            WHERE s.trainer = 'zetamac' AND s.mode = ANY(${factModes}) AND s.config_key = ${key}
              AND a.time_ms IS NOT NULL AND a.qtype IN ('z.add', 'z.sub')
            GROUP BY a.fact_key, a.qtype`
      : [],
    zetamac
      ? []
      : sql`SELECT a.session_id AS "sessionId", a.idx, a.prompt, a.response, a.answer, s.started_at AS "startedAt"
            FROM attempts a JOIN sessions s ON s.id = a.session_id
            WHERE s.trainer = 'optiver' AND s.mode = ${mode} AND s.config_key = ${key}
              AND a.response IS NOT NULL AND NOT a.is_correct
            ORDER BY s.started_at DESC, a.idx LIMIT 50`,
  ]);

  return {
    configs,
    configKey: key,
    series,
    byType,
    pace: { bucketSize, rows: pace },
    histogram: { binWidthMs, bins },
    overall: overallRows[0] ?? NO_OVERALL,
    slowest,
    timesGrid: timesGrid(gridRows),
    slowFacts,
    carries: carriesBreakdown(carryRows),
    wrongLog,
  };
}

export function createStatsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET'], auth, getSql });
    if (!sql) return undefined;
    const parsed = statsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stats query', z.flattenError(parsed.error));
    }
    try {
      return res.status(200).json(await loadStats(sql, parsed.data));
    } catch (err) {
      console.error('trainers/stats failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createStatsHandler();
```

- [ ] **Step 9: Implement the drill endpoint**

`api/trainers/drill.js`:

```js
import { getSql as defaultGetSql } from '../_lib/db.js';
import { authConfig } from '../_lib/session.js';
import { guard, sendError } from '../_lib/http.js';
import { rankWeakFacts, DRILL_UNLOCK_GAMES, DRILL_RECENT_GAMES, DRILL_POOL_SIZE } from '../../src/private/trainers/core/facts.js';

// GET /api/trainers/drill — weakest Zetamac facts from the most recent standard games (spec §4.4).

export function createDrillHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET'], auth, getSql });
    if (!sql) return undefined;
    try {
      const [[{ games }], rows] = await Promise.all([
        sql`SELECT count(*)::int AS games FROM sessions WHERE trainer = 'zetamac' AND mode = 'standard'`,
        sql`WITH recent AS (
              SELECT id FROM sessions WHERE trainer = 'zetamac' AND mode = 'standard'
              ORDER BY started_at DESC LIMIT ${DRILL_RECENT_GAMES}
            )
            SELECT a.fact_key AS "factKey", a.qtype, count(*)::int AS n,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "medianMs",
                   avg(a.corrections)::float8 AS "correctionsRate"
            FROM attempts a JOIN recent r ON r.id = a.session_id
            WHERE a.time_ms IS NOT NULL AND a.fact_key IS NOT NULL
            GROUP BY a.fact_key, a.qtype HAVING count(*) >= 2`,
      ]);
      const unlocked = games >= DRILL_UNLOCK_GAMES;
      return res.status(200).json({
        standardGames: games,
        unlocked,
        facts: unlocked ? rankWeakFacts(rows, DRILL_POOL_SIZE) : [],
      });
    } catch (err) {
      console.error('trainers/drill failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createDrillHandler();
```

- [ ] **Step 10: Run the tests and confirm they pass**

Run: `npx vitest run api/trainers/stats.test.js api/trainers/drill.test.js`
Expected: PASS.

- [ ] **Step 11: Support nested API paths and `req.query` in the dev shim**

In `vite.api-dev.js`, replace these two lines:

```js
        const name = (req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '');
        const file = path.resolve(server.config.root, 'api', `${name}.js`);
        if (!/^[a-z0-9-]+$/i.test(name) || !fs.existsSync(file)) return next();
```

with:

```js
        const url = new URL(req.url || '/', 'http://localhost');
        const name = url.pathname.replace(/^\/+|\/+$/g, '');
        // Segments of [a-z0-9-] only: blocks '..', '_lib', dotted files like '*.test'.
        if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(name)) return next();
        const file = path.resolve(server.config.root, 'api', `${name}.js`);
        if (!fs.existsSync(file)) return next();
        req.query = Object.fromEntries(url.searchParams);
```

- [ ] **Step 12: Verify against the dev server**

Run `npm run dev` (through the preview tool, not Bash). Without a session cookie:

```bash
curl -s "http://localhost:5173/api/trainers/stats?trainer=zetamac"
```

Expected: `{"error":"Sign in required","code":"UNAUTHORIZED"}`.

```bash
curl -s "http://localhost:5173/api/_lib/db"
```

Expected: HTML from Vite (not routed to the API).

Then run `npm test`. Expected: every test passes.

- [ ] **Step 13: Commit**

```bash
git add src/private/trainers/core/facts.js src/private/trainers/core/facts.test.js api/_lib/statsShape.js api/_lib/statsShape.test.js api/_lib/testing.js api/trainers/stats.js api/trainers/stats.test.js api/trainers/drill.js api/trainers/drill.test.js vite.api-dev.js
git commit -m "Add trainer stats and drill APIs with nested dev routes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

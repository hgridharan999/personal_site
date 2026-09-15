# Phase 3a: Database and Sessions API (Tasks 8–9)

Read `00-overview.md` first. Depends only on the existing auth code (`api/_lib/session.js`), so it can run in parallel with Phase 2.

Existing auth API used here (`api/_lib/session.js`, already in the repo):
- `authConfig(): { password, secret } | null`
- `verifySession(req, config): boolean`, which reads the `hg_session` cookie
- `sessionCookie(config): string`, a `Set-Cookie` value whose first `;`-separated part is `hg_session=<token>`

**Postgres types through the Neon HTTP driver:** `count(*)` is `bigint` and `avg(...)` is `numeric`, and both arrive as **strings**. Always cast in SQL: `count(*)::int`, `avg(x)::float8`, `percentile_cont(...)::float8`.

---

### Task 8: Schema, migration runner, DB client

**Files:**
- Modify: `package.json` (add the `@neondatabase/serverless` dependency and a `db:migrate` script)
- Create: `db/migrations/001_trainers.sql`
- Create: `scripts/migrate.js`
- Create: `api/_lib/db.js`
- Modify: `.env.example` (document `DATABASE_URL`)
- Test: `scripts/migrate.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `api/_lib/db.js`: `getSql(): NeonQueryFunction | null`, a memoized `neon(process.env.DATABASE_URL)`, or `null` when the env var is missing
  - `scripts/migrate.js`:
    - `MIGRATION_NAME = /^\d{3}_[a-z0-9_]+\.sql$/`
    - `pendingMigrations(files: string[], applied: string[]): string[]`, which keeps only valid names, sorts them ascending, and drops the applied ones
  - Tables `sessions` and `attempts` exactly as in spec §3.2

- [ ] **Step 1: Install the driver and add the script**

Run: `npm i @neondatabase/serverless@1.1.0`

Add to `package.json` `"scripts"`:

```json
"db:migrate": "node --env-file-if-exists=.env.local scripts/migrate.js"
```

Append to `.env.example`:

```bash

# Trainer history database (Neon Postgres via Vercel Marketplace). Server-only.
# Vercel sets this automatically once Neon is connected; copy it into .env.local for dev + migrations.
DATABASE_URL=
```

- [ ] **Step 2: Write the failing test**

`scripts/migrate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from './migrate.js';

describe('pendingMigrations', () => {
  it('sorts, filters invalid names, and skips applied', () => {
    const files = ['002_stats.sql', 'README.md', '001_trainers.sql', '1_bad.sql', '003_more.sql'];
    expect(pendingMigrations(files, ['001_trainers.sql'])).toEqual(['002_stats.sql', '003_more.sql']);
  });
  it('returns nothing when everything is applied', () => {
    expect(pendingMigrations(['001_trainers.sql'], ['001_trainers.sql'])).toEqual([]);
  });
  it('MIGRATION_NAME', () => {
    expect(MIGRATION_NAME.test('001_trainers.sql')).toBe(true);
    expect(MIGRATION_NAME.test('001-trainers.sql')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run scripts/migrate.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 4: Write the migration SQL**

`db/migrations/001_trainers.sql`:

```sql
CREATE TABLE sessions (
  id              uuid PRIMARY KEY,
  trainer         text NOT NULL CHECK (trainer IN ('zetamac', 'optiver')),
  mode            text NOT NULL CHECK (mode IN ('standard', 'custom', 'drill')),
  config          jsonb NOT NULL,
  config_key      text NOT NULL,
  profile_version int,
  started_at      timestamptz NOT NULL,
  duration_ms     int NOT NULL,
  correct         int NOT NULL,
  wrong           int NOT NULL,
  unanswered      int NOT NULL,
  score           int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_series ON sessions (trainer, mode, config_key, started_at);

CREATE TABLE attempts (
  session_id  uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  idx         int NOT NULL,
  qtype       text NOT NULL,
  fact_key    text,
  prompt      text NOT NULL,
  answer      text NOT NULL,
  response    text,
  is_correct  boolean NOT NULL,
  time_ms     int,
  corrections int NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, idx)
);

CREATE INDEX attempts_fact ON attempts (fact_key);
CREATE INDEX attempts_qtype ON attempts (qtype);
```

(The index adds `mode` to the spec's `sessions_series`, because every stats query filters on it.)

- [ ] **Step 5: Implement the runner and the DB client**

`scripts/migrate.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';

// Applies db/migrations/NNN_name.sql in order, once each, each in its own transaction.
// Usage: npm run db:migrate   (reads DATABASE_URL from env or .env.local)

export const MIGRATION_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

export function pendingMigrations(files, applied) {
  const done = new Set(applied);
  return files.filter((f) => MIGRATION_NAME.test(f) && !done.has(f)).sort();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (add it to .env.local).');
    process.exit(1);
  }
  if (!neonConfig.webSocketConstructor && globalThis.WebSocket) {
    neonConfig.webSocketConstructor = globalThis.WebSocket;
  }

  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const pending = pendingMigrations(fs.readdirSync(dir), rows.map((r) => r.name));
    if (pending.length === 0) console.log('Database is up to date.');

    for (const name of pending) {
      const sqlText = fs.readFileSync(path.join(dir, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sqlText);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`Applied ${name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
```

`api/_lib/db.js`:

```js
import { neon } from '@neondatabase/serverless';

// One HTTP query function per function instance. Null when the DB isn't configured,
// so handlers can answer 500 DB_NOT_CONFIGURED instead of crashing.
let sql = null;

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx vitest run scripts/migrate.test.js`
Expected: PASS.

- [ ] **Step 7: Apply the migration (only if `DATABASE_URL` is available)**

Run: `npm run db:migrate`
Expected: `Applied 001_trainers.sql`. Running it a second time prints `Database is up to date.`
If `DATABASE_URL` isn't set yet, the command prints `DATABASE_URL is not set (add it to .env.local).` and exits 1. Note that in the task report and continue: the user connects Neon later (spec §9).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json db/migrations/001_trainers.sql scripts/migrate.js scripts/migrate.test.js api/_lib/db.js .env.example
git commit -m "Add trainer database schema, migration runner and Neon client" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Validation schemas, handler guard, sessions endpoint

**Files:**
- Modify: `package.json` (add the `zod` dependency)
- Create: `api/_lib/http.js`
- Create: `api/_lib/trainerSchemas.js`
- Create: `api/trainers/sessions.js`
- Create: `.vercelignore` (Vercel turns every `.js` under `api/` into a function, so tests must not deploy)
- Test: `api/_lib/trainerSchemas.test.js`, `api/trainers/sessions.test.js`
- Test helper: `api/_lib/testing.js`

**Interfaces:**
- Consumes: `getSql` (Task 8); `authConfig`, `verifySession`, `sessionCookie` (existing).
- Produces:
  - `api/_lib/http.js`:
    - `sendError(res, status, code, error, details?)`
    - `guard(req, res, { methods: string[], auth: () => config|null, getSql: () => sql|null }): sql | null`. It sets `Cache-Control: no-store`, and sends 405 / 401 `UNAUTHORIZED` / 500 `DB_NOT_CONFIGURED` itself, returning `null` in those cases.
  - `api/_lib/trainerSchemas.js`:
    - `QTYPES: string[]`
    - `TRAINERS`, `MODES`
    - `sessionPayload` (Zod schema for the session payload in `00-overview.md`)
    - `statsQuery` (`{ trainer, mode = 'standard', configKey? }`)
    - `idQuery` (`{ id }`)
  - `api/trainers/sessions.js`:
    - `createSessionsHandler({ getSql, auth })`; the default export is the handler with real dependencies
    - `POST` body = session payload → `200 { id, saved: true, duplicate: boolean }`
    - `GET ?id=<uuid>` → `200 { session: { id, trainer, mode, config, configKey, profileVersion, startedAt, durationMs, correct, wrong, unanswered, score }, attempts: [{ idx, qtype, factKey, prompt, answer, response, isCorrect, timeMs, corrections }] }` (camelCase via SQL aliases, attempts ordered by idx), or `404 NOT_FOUND`
    - Invalid input → `400 VALIDATION_ERROR` with `details` = `z.flattenError(...)`
  - `api/_lib/testing.js` (test-only helpers):
    - `mockRes()`
    - `authedReq({ method, body?, query? })`
    - `TEST_AUTH`
    - `mockSql(results: any[][])`, a tagged-template mock that records queries and resolves awaited queries from `results` in order; `sql.transaction` records its queries and resolves `[[{ id }], []]`

- [ ] **Step 1: Install Zod**

Run: `npm i zod@4.6.5`

- [ ] **Step 2: Write the test helpers**

`api/_lib/testing.js`:

```js
import { sessionCookie } from './session.js';

// Test-only helpers for API handlers (not a route: lives under api/_lib).

export const TEST_AUTH = { password: 'correct-horse-battery', secret: 's'.repeat(40) };

export function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

export function authedReq({ method = 'GET', body, query = {}, authed = true } = {}) {
  const cookie = authed ? sessionCookie(TEST_AUTH).split(';')[0] : '';
  return { method, body, query, headers: { cookie } };
}

export function mockSql(results = []) {
  const queue = [...results];
  const queries = [];
  const sql = (strings, ...values) => {
    const q = {
      text: strings.join('?'),
      values,
      then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
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

- [ ] **Step 3: Write the failing tests**

`api/_lib/trainerSchemas.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { sessionPayload, statsQuery, idQuery, QTYPES } from './trainerSchemas.js';

export function zetamacPayload(overrides = {}) {
  return {
    session: {
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c',
      trainer: 'zetamac',
      mode: 'standard',
      config: { add: true, duration: 120 },
      configKey: 'a'.repeat(64),
      profileVersion: null,
      startedAt: '2026-09-14T18:00:00.000Z',
      durationMs: 120000,
      correct: 1, wrong: 0, unanswered: 0, score: 1,
      ...overrides.session,
    },
    attempts: overrides.attempts ?? [
      { idx: 0, qtype: 'z.mul', factKey: 'mul:7x83', prompt: '7 × 83', answer: '581', response: '581', isCorrect: true, timeMs: 2140, corrections: 0 },
      { idx: 1, qtype: 'z.add', factKey: 'add:2+3', prompt: '2 + 3', answer: '5', response: null, isCorrect: false, timeMs: null, corrections: 0 },
    ],
  };
}

describe('sessionPayload', () => {
  it('accepts a valid zetamac game', () => {
    expect(sessionPayload.safeParse(zetamacPayload()).success).toBe(true);
  });
  it('rejects a qtype from the other trainer', () => {
    const p = zetamacPayload();
    p.attempts[0].qtype = 'o.int.add';
    expect(sessionPayload.safeParse(p).success).toBe(false);
  });
  it('rejects idx not matching position', () => {
    const p = zetamacPayload();
    p.attempts[1].idx = 5;
    expect(sessionPayload.safeParse(p).success).toBe(false);
  });
  it('rejects totals that disagree with attempts', () => {
    expect(sessionPayload.safeParse(zetamacPayload({ session: { correct: 2, score: 2 } })).success).toBe(false);
  });
  it('requires profileVersion for optiver only, and optiver is standard mode', () => {
    const optiver = zetamacPayload({ session: { trainer: 'optiver', profileVersion: null }, attempts: [] });
    optiver.session.correct = 0;
    optiver.session.score = 0;
    expect(sessionPayload.safeParse(optiver).success).toBe(false);
    optiver.session.profileVersion = 1;
    expect(sessionPayload.safeParse(optiver).success).toBe(true);
    optiver.session.mode = 'drill';
    expect(sessionPayload.safeParse(optiver).success).toBe(false);
    expect(sessionPayload.safeParse(zetamacPayload({ session: { profileVersion: 1 } })).success).toBe(false);
  });
  it('rejects more than 1000 attempts and bad ids', () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({
      idx: i, qtype: 'z.add', factKey: null, prompt: '1 + 1', answer: '2', response: null, isCorrect: false, timeMs: null, corrections: 0,
    }));
    expect(sessionPayload.safeParse(zetamacPayload({ attempts: many, session: { correct: 0, score: 0 } })).success).toBe(false);
    expect(sessionPayload.safeParse(zetamacPayload({ session: { id: 'nope' } })).success).toBe(false);
  });
  it('lists all qtypes', () => {
    expect(QTYPES).toContain('z.div');
    expect(QTYPES).toContain('o.frac.muldiv');
    expect(QTYPES).toHaveLength(14);
  });
});

describe('queries', () => {
  it('statsQuery defaults mode to standard', () => {
    expect(statsQuery.parse({ trainer: 'optiver' })).toEqual({ trainer: 'optiver', mode: 'standard' });
    expect(statsQuery.safeParse({ trainer: 'x' }).success).toBe(false);
  });
  it('idQuery requires a uuid', () => {
    expect(idQuery.safeParse({ id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c' }).success).toBe(true);
    expect(idQuery.safeParse({ id: '1' }).success).toBe(false);
  });
});
```

`api/trainers/sessions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createSessionsHandler } from './sessions.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../_lib/testing.js';
import { zetamacPayload } from '../_lib/trainerSchemas.test.js';

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
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `npx vitest run api/_lib/trainerSchemas.test.js api/trainers/sessions.test.js`
Expected: FAIL with unresolved imports.

- [ ] **Step 5: Implement the helpers and schemas**

`api/_lib/http.js`:

```js
import { verifySession } from './session.js';

export function sendError(res, status, code, error, details) {
  return res.status(status).json(details === undefined ? { error, code } : { error, code, details });
}

/** Common preamble for private API routes. Returns the sql client, or null after responding. */
export function guard(req, res, { methods, auth, getSql }) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    return null;
  }
  if (!verifySession(req, auth())) {
    sendError(res, 401, 'UNAUTHORIZED', 'Sign in required');
    return null;
  }
  const sql = getSql();
  if (!sql) {
    sendError(res, 500, 'DB_NOT_CONFIGURED', 'Database is not configured');
    return null;
  }
  return sql;
}
```

`api/_lib/trainerSchemas.js`:

```js
import { z } from 'zod';

export const TRAINERS = ['zetamac', 'optiver'];
export const MODES = ['standard', 'custom', 'drill'];
export const QTYPES = [
  'z.add', 'z.sub', 'z.mul', 'z.div',
  'o.int.add', 'o.int.sub', 'o.int.mul', 'o.int.div',
  'o.dec.addsub', 'o.dec.mul', 'o.dec.div',
  'o.frac.of', 'o.frac.addsub', 'o.frac.muldiv',
];

const configKey = z.string().regex(/^[0-9a-f]{64}$/);
const count = z.int().min(0).max(1000);

const attempt = z.object({
  idx: z.int().min(0).max(999),
  qtype: z.enum(QTYPES),
  factKey: z.string().max(64).nullable(),
  prompt: z.string().min(1).max(64),
  answer: z.string().min(1).max(64),
  response: z.string().max(32).nullable(),
  isCorrect: z.boolean(),
  timeMs: z.int().min(0).max(3600000).nullable(),
  corrections: z.int().min(0).max(1000),
});

export const sessionPayload = z
  .object({
    session: z.object({
      id: z.uuid(),
      trainer: z.enum(TRAINERS),
      mode: z.enum(MODES),
      config: z.record(z.string(), z.unknown()),
      configKey,
      profileVersion: z.int().min(1).nullable(),
      startedAt: z.iso.datetime(),
      durationMs: z.int().min(0).max(3600000),
      correct: count,
      wrong: count,
      unanswered: count,
      score: z.int().min(-1000).max(1000),
    }),
    attempts: z.array(attempt).max(1000),
  })
  .superRefine(({ session, attempts }, ctx) => {
    const issue = (message, path) => ctx.addIssue({ code: 'custom', message, path });
    const isOptiver = session.trainer === 'optiver';
    if (isOptiver && session.mode !== 'standard') issue('Optiver games are always standard mode', ['session', 'mode']);
    if (isOptiver !== (session.profileVersion !== null)) {
      issue('profileVersion is required for optiver and must be null for zetamac', ['session', 'profileVersion']);
    }
    const prefix = isOptiver ? 'o.' : 'z.';
    attempts.forEach((a, i) => {
      if (!a.qtype.startsWith(prefix)) issue('qtype does not match trainer', ['attempts', i, 'qtype']);
      if (a.idx !== i) issue('idx must equal position', ['attempts', i, 'idx']);
    });
    if (attempts.filter((a) => a.isCorrect).length !== session.correct) {
      issue('correct does not match attempts', ['session', 'correct']);
    }
  });

export const statsQuery = z.object({
  trainer: z.enum(TRAINERS),
  mode: z.enum(MODES).default('standard'),
  configKey: configKey.optional(),
});

export const idQuery = z.object({ id: z.uuid() });
```

- [ ] **Step 6: Implement the sessions endpoint**

`api/trainers/sessions.js`:

```js
import { z } from 'zod';
import { getSql as defaultGetSql } from '../_lib/db.js';
import { authConfig } from '../_lib/session.js';
import { guard, sendError } from '../_lib/http.js';
import { sessionPayload, idQuery } from '../_lib/trainerSchemas.js';

// POST /api/trainers/sessions      save a finished game (idempotent on session.id)
// GET  /api/trainers/sessions?id=  one game with all its attempts

async function save(sql, req, res) {
  const parsed = sessionPayload.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid session payload', z.flattenError(parsed.error));
  }
  const { session: s, attempts } = parsed.data;
  const rows = attempts.map((a) => ({
    session_id: s.id,
    idx: a.idx,
    qtype: a.qtype,
    fact_key: a.factKey,
    prompt: a.prompt,
    answer: a.answer,
    response: a.response,
    is_correct: a.isCorrect,
    time_ms: a.timeMs,
    corrections: a.corrections,
  }));

  const [inserted] = await sql.transaction([
    sql`INSERT INTO sessions (id, trainer, mode, config, config_key, profile_version, started_at, duration_ms, correct, wrong, unanswered, score)
        VALUES (${s.id}, ${s.trainer}, ${s.mode}, ${JSON.stringify(s.config)}::jsonb, ${s.configKey}, ${s.profileVersion},
                ${s.startedAt}, ${s.durationMs}, ${s.correct}, ${s.wrong}, ${s.unanswered}, ${s.score})
        ON CONFLICT (id) DO NOTHING
        RETURNING id`,
    sql`INSERT INTO attempts (session_id, idx, qtype, fact_key, prompt, answer, response, is_correct, time_ms, corrections)
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS x(session_id uuid, idx int, qtype text, fact_key text, prompt text, answer text,
               response text, is_correct boolean, time_ms int, corrections int)
        ON CONFLICT (session_id, idx) DO NOTHING`,
  ]);

  return res.status(200).json({ id: s.id, saved: true, duplicate: inserted.length === 0 });
}

async function read(sql, req, res) {
  const parsed = idQuery.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'A valid game id is required', z.flattenError(parsed.error));
  }
  const { id } = parsed.data;
  const [session] = await sql`
    SELECT id, trainer, mode, config, config_key AS "configKey", profile_version AS "profileVersion",
           started_at AS "startedAt", duration_ms AS "durationMs", correct, wrong, unanswered, score
    FROM sessions WHERE id = ${id}`;
  if (!session) return sendError(res, 404, 'NOT_FOUND', 'Game not found');
  const attempts = await sql`
    SELECT idx, qtype, fact_key AS "factKey", prompt, answer, response, is_correct AS "isCorrect",
           time_ms AS "timeMs", corrections
    FROM attempts WHERE session_id = ${id} ORDER BY idx`;
  return res.status(200).json({ session, attempts });
}

export function createSessionsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET', 'POST'], auth, getSql });
    if (!sql) return undefined;
    try {
      return req.method === 'POST' ? await save(sql, req, res) : await read(sql, req, res);
    } catch (err) {
      console.error('trainers/sessions failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createSessionsHandler();
```

- [ ] **Step 6b: Keep tests and test helpers out of deployments**

Create `.vercelignore`:

```
# Tests and test-only helpers must not become serverless functions
**/*.test.js
api/_lib/testing.js
docs/
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run api/_lib/trainerSchemas.test.js api/trainers/sessions.test.js`
Expected: all tests PASS.

Also run `npm test`. Expected: every test so far passes. `api/_lib/trainerSchemas.test.js` exports a fixture, which Vitest allows.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .vercelignore api/_lib/http.js api/_lib/trainerSchemas.js api/_lib/trainerSchemas.test.js api/_lib/testing.js api/trainers/sessions.js api/trainers/sessions.test.js
git commit -m "Add validated, idempotent trainer sessions API" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

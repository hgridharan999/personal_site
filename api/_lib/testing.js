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

// Valid zetamac session payload; override `session` fields or replace `attempts`.
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

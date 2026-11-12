import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNightlyCronHandler } from './nightly-cron.js';
import { cronAuthorized } from './_lib/nightly/cronAuth.js';
import { mockRes, mockSql } from './_lib/testing.js';

// 01:30 UTC on 13 Nov 2026 is 20:30 Eastern on the 12th: the cron must use the Eastern night.
const NOW = new Date('2026-11-13T01:30:00Z');
const NIGHT = '2026-11-12';
const SECRET = 'c'.repeat(32);
const SID = '123e4567-e89b-42d3-a456-426614174000';

const story = (n) => ({ headline: `h${n}`, summary: `s${n}`, url: `https://example.com/${n}`, source: 'Example' });
const BRIEF = {
  stories: [story(0), story(1), story(2)],
  niche: { ...story(3), topic: 'mycology' },
  questions: [
    { type: 'forecast', story_index: 0, prompt: 'p0' },
    { type: 'decide', story_index: 1, prompt: 'p1' },
    { type: 'estimate', story_index: 2, prompt: 'p2' },
  ],
};

function db(routes) {
  return mockSql((text) => routes.find(([fragment]) => text.includes(fragment))?.[1] ?? []);
}

function setup(routes, { model } = {}) {
  const sql = db(routes);
  const fake = model ?? { generateBrief: vi.fn(async () => BRIEF), grade: vi.fn(), blindTake: vi.fn() };
  const handler = createNightlyCronHandler({ getSql: () => sql, model: fake, now: () => NOW });
  const call = async ({ method = 'GET', authorization } = {}) => {
    const res = mockRes();
    await handler({ method, query: {}, headers: authorization === undefined ? {} : { authorization } }, res);
    return res;
  };
  return { sql, model: fake, call };
}

const FRESH = [
  ['FROM nightly_sessions WHERE date', []],
  ['INSERT INTO nightly_sessions', [{ id: SID }]],
  ['SET stories', [{ id: SID, date: NIGHT, status: 'generated', ...BRIEF, grade_error: null }]],
];

afterEach(() => vi.unstubAllEnvs());

describe('cronAuthorized', () => {
  const req = (authorization) => ({ headers: authorization ? { authorization } : {} });
  it('is misconfigured when the secret is unset or under 16 characters', () => {
    expect(cronAuthorized(req('Bearer undefined'), undefined)).toBe('misconfigured');
    expect(cronAuthorized(req('Bearer '), '')).toBe('misconfigured');
    expect(cronAuthorized(req('Bearer abc'), 'short')).toBe('misconfigured');
    expect(cronAuthorized(req(`Bearer ${'a'.repeat(15)}`), 'a'.repeat(15))).toBe('misconfigured');
  });
  it('denies a request with no bearer before reporting config', () => {
    expect(cronAuthorized(req(), undefined)).toBe('denied');
    expect(cronAuthorized(req(), 'short')).toBe('denied');
    expect(cronAuthorized(req('Basic abc'), undefined)).toBe('denied');
  });
  it('denies a missing or wrong header and accepts the exact bearer token', () => {
    expect(cronAuthorized(req(), SECRET)).toBe('denied');
    expect(cronAuthorized(req(SECRET), SECRET)).toBe('denied');
    expect(cronAuthorized(req(`Bearer ${SECRET}x`), SECRET)).toBe('denied');
    expect(cronAuthorized(req(`Bearer ${SECRET}`), SECRET)).toBe('ok');
    expect(cronAuthorized(req(`Bearer ${'a'.repeat(16)}`), 'a'.repeat(16))).toBe('ok');
  });
  it('reads CRON_SECRET by default', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(cronAuthorized(req(`Bearer ${SECRET}`))).toBe('ok');
  });
});

describe('api/nightly-cron', () => {
  it('405 for anything but GET', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const { call } = setup(FRESH);
    const res = await call({ method: 'POST', authorization: `Bearer ${SECRET}` });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('401 without the header, and nothing runs', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const { sql, model, call } = setup(FRESH);
    const res = await call();
    expect(res.statusCode).toBe(401);
    expect(sql.queries).toHaveLength(0);
    expect(model.generateBrief).not.toHaveBeenCalled();
  });

  it('500 CRON_NOT_CONFIGURED when CRON_SECRET is unset, even for "Bearer undefined"', async () => {
    vi.stubEnv('CRON_SECRET', undefined);
    const { sql, call } = setup(FRESH);
    const res = await call({ authorization: 'Bearer undefined' });
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('CRON_NOT_CONFIGURED');
    expect(sql.queries).toHaveLength(0);
  });

  it('401, not 500, with no Authorization header even when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', undefined);
    const { sql, call } = setup(FRESH);
    const res = await call();
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(sql.queries).toHaveLength(0);
  });

  it('500 CRON_NOT_CONFIGURED when CRON_SECRET is short', async () => {
    vi.stubEnv('CRON_SECRET', 'short');
    const { call } = setup(FRESH);
    const res = await call({ authorization: 'Bearer short' });
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('CRON_NOT_CONFIGURED');
  });

  it('with the right bearer: generates tonight (Eastern night, not the UTC date)', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const { sql, model, call } = setup(FRESH);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ status: 'created', night: NIGHT, sessionId: SID });
    expect(model.generateBrief).toHaveBeenCalledTimes(1);
    expect(model.generateBrief.mock.calls[0][0].night).toBe(NIGHT);
    expect(sql.queries.find((q) => q.text.includes('INSERT INTO nightly_sessions')).values).toContain(NIGHT);
  });

  it('a second run while generating: 202 and no second model call', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const { model, call } = setup([
      ['FROM nightly_sessions WHERE date', [{ id: SID, date: NIGHT, status: 'generating' }]],
      ['INSERT INTO nightly_sessions', []],
    ]);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.statusCode).toBe(202);
    expect(res.body.status).toBe('in_progress');
    expect(model.generateBrief).not.toHaveBeenCalled();
  });

  it('when the night already has a brief: 200 exists', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const { model, call } = setup([['FROM nightly_sessions WHERE date', [{ id: SID, date: NIGHT, status: 'graded', ...BRIEF }]]]);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('exists');
    expect(model.generateBrief).not.toHaveBeenCalled();
  });

  it('when the model fails: 502 and the claim is released', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const model = { generateBrief: vi.fn(async () => { throw new Error('boom'); }) };
    const { sql, call } = setup(FRESH, { model });
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('GENERATION_FAILED');
    expect(sql.queries.some((q) => q.text.includes('DELETE FROM nightly_sessions'))).toBe(true);
    vi.restoreAllMocks();
  });
});

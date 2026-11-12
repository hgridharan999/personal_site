import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, createNightlyHandler } from './nightly.js';
import { ModelError } from './_lib/nightly/model.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from './_lib/testing.js';

// 18:00 Eastern on 12 Nov 2026, so tonight is 2026-11-12.
const NOW = new Date('2026-11-12T23:00:00Z');
const NIGHT = '2026-11-12';
const SID = '123e4567-e89b-42d3-a456-426614174000';
const GRADING_KEYS = ['score', 'feedback', 'modelTake', 'followUp', 'model_take', 'follow_up'];

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
const GRADE = { scores: [0, 1, 2].map((idx) => ({ idx, score: 3, feedback: `gap ${idx}` })), followUp: 'What did you see?' };

const sessionRow = (status, extra = {}) => ({ id: SID, date: NIGHT, status, ...BRIEF, grade_error: null, ...extra });
// Answer and take rows as the DB holds them once graded, so a leak before `graded` would show.
const ANSWER_ROWS = [0, 1, 2].map((idx) => ({
  idx, question_type: BRIEF.questions[idx].type, prompt: `p${idx}`, answer: `a${idx}`, score: 3, feedback: `gap ${idx}`,
}));
const TAKE_ROW = { story_index: 1, body: 'my take', model_take: 'blind', follow_up: 'why?', published: false, published_at: null };

function deepKeys(value) {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...deepKeys(v)]);
  return [];
}

/** mockSql whose results are picked by the first fragment the SQL text contains. */
function db(routes) {
  return mockSql((text) => {
    const hit = routes.find(([fragment]) => text.includes(fragment));
    if (!hit) return [];
    return typeof hit[1] === 'function' ? hit[1]() : hit[1];
  });
}
const issued = (sql, fragment) => sql.queries.filter((q) => q.text.includes(fragment));

const READS = (status, extra) => [
  ['FROM nightly_sessions WHERE id', [sessionRow(status, extra)]],
  ['FROM nightly_sessions WHERE date', [sessionRow(status, extra)]],
  ['FROM nightly_answers', ANSWER_ROWS],
  ['FROM nightly_takes WHERE session_id', [TAKE_ROW]],
];

function fakeModel() {
  return {
    generateBrief: vi.fn(async () => BRIEF),
    grade: vi.fn(async () => GRADE),
    blindTake: vi.fn(async () => 'blind take'),
  };
}

function setup(routes = [], { model = fakeModel(), ...opts } = {}) {
  const sql = db(routes);
  const handler = createNightlyHandler({ getSql: () => sql, auth: () => TEST_AUTH, model, now: () => NOW, ...opts });
  const call = async (action, { method = ACTIONS[action]?.method ?? 'GET', body, authed = true } = {}) => {
    const res = mockRes();
    await handler(authedReq({ method, body, query: { action }, authed }), res);
    return res;
  };
  return { sql, model, call };
}

const submitBody = (extra = {}) => ({
  sessionId: SID,
  answers: [0, 1, 2].map((idx) => ({ idx, answer: `answer ${idx}` })),
  take: { storyIndex: 1, body: 'my take' },
  ...extra,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('api/nightly: dispatch, auth and methods', () => {
  it('declares the action table', () => {
    expect(ACTIONS).toEqual({
      today: { method: 'GET', auth: true },
      generate: { method: 'POST', auth: true },
      submit: { method: 'POST', auth: true },
      grade: { method: 'POST', auth: true },
      publish: { method: 'POST', auth: true },
      notes: { method: 'GET', auth: false },
    });
  });

  for (const action of ['today', 'generate', 'submit', 'grade', 'publish']) {
    it(`${action}: 401 without a session, and no query runs`, async () => {
      const { sql, model, call } = setup(READS('generated'));
      const res = await call(action, { body: submitBody(), authed: false });
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(sql.queries).toHaveLength(0);
      expect(model.generateBrief).not.toHaveBeenCalled();
    });
  }

  it('notes: 200 without a session, with only the public columns', async () => {
    const note = { date: NIGHT, body: 'b', headline: 'h', url: 'https://example.com/1', source: 'Example', model_take: 'x', follow_up: 'y' };
    const { sql, call } = setup([['FROM nightly_takes', [note]]]);
    const res = await call('notes', { authed: false });
    expect(res.statusCode).toBe(200);
    expect(res.body.notes).toEqual([{ date: NIGHT, body: 'b', headline: 'h', url: 'https://example.com/1', source: 'Example' }]);
    for (const key of GRADING_KEYS) expect(deepKeys(res.body), key).not.toContain(key);
    const [q] = sql.queries;
    expect(q.text).toContain('date::text');
    expect(q.text).toMatch(/WHERE t\.published\b/);
    expect(q.text).not.toMatch(/model_take|follow_up/);
  });

  it('405 for the wrong method, with Allow', async () => {
    const { call } = setup();
    for (const [action, method, allow] of [['today', 'POST', 'GET'], ['generate', 'GET', 'POST'], ['notes', 'POST', 'GET'], ['grade', 'DELETE', 'POST']]) {
      const res = await call(action, { method });
      expect(res.statusCode, action).toBe(405);
      expect(res.headers.Allow, action).toBe(allow);
    }
  });

  it('404 UNKNOWN_ACTION for a missing or unknown action, including inherited names', async () => {
    const { call } = setup();
    for (const action of [undefined, 'delete', 'constructor', '__proto__', 'toString']) {
      const res = await call(action, { method: 'GET' });
      expect(res.statusCode, String(action)).toBe(404);
      expect(res.body.code).toBe('UNKNOWN_ACTION');
    }
  });

  it('500 DB_NOT_CONFIGURED without a database', async () => {
    const handler = createNightlyHandler({ getSql: () => null, auth: () => TEST_AUTH, model: fakeModel(), now: () => NOW });
    const res = mockRes();
    await handler(authedReq({ query: { action: 'today' } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('DB_NOT_CONFIGURED');
  });

  it('every action except generate and grade works without a model key; those two answer 500 MODEL_NOT_CONFIGURED', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sql = db([['FROM nightly_sessions WHERE date', []], ["status = 'grading'", [{ id: SID }]], ...READS('submitted')]);
    const handler = createNightlyHandler({ getSql: () => sql, auth: () => TEST_AUTH, now: () => NOW });
    const send = async (action, method, body) => {
      const res = mockRes();
      await handler(authedReq({ method, body, query: { action } }), res);
      return res;
    };
    expect((await send('today', 'GET')).statusCode).toBe(200);
    expect((await send('notes', 'GET')).statusCode).toBe(200);
    const gen = await send('generate', 'POST');
    expect(gen.statusCode).toBe(500);
    expect(gen.body.code).toBe('MODEL_NOT_CONFIGURED');
    expect(issued(sql, 'INSERT INTO nightly_sessions')).toHaveLength(0);
    const grade = await send('grade', 'POST', { sessionId: SID });
    expect(grade.statusCode).toBe(500);
    expect(grade.body.code).toBe('MODEL_NOT_CONFIGURED');
    expect(issued(sql, 'grade_error =')).toHaveLength(1); // the lease is handed back
  });
});

describe('api/nightly: today', () => {
  it('returns the night and null when there is no session', async () => {
    const { sql, call } = setup([['FROM nightly_sessions WHERE date', []]]);
    const res = await call('today');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ night: NIGHT, session: null });
    expect(sql.queries[0].values).toContain(NIGHT);
    expect(sql.queries[0].text).toContain('date::text');
  });

  for (const status of ['generated', 'submitted', 'grading']) {
    it(`${status}: no grading field anywhere in the JSON`, async () => {
      const { call } = setup(READS(status));
      const res = await call('today');
      expect(res.statusCode).toBe(200);
      expect(res.body.session.status).toBe(status);
      const keys = deepKeys(JSON.parse(JSON.stringify(res.body)));
      for (const key of GRADING_KEYS) expect(keys, key).not.toContain(key);
    });
  }

  it('graded: includes scores, the blind take and the follow-up', async () => {
    const { call } = setup(READS('graded'));
    const res = await call('today');
    expect(res.body.session.answers[0].score).toBe(3);
    expect(res.body.session.take.modelTake).toBe('blind');
    expect(res.body.session.take.followUp).toBe('why?');
  });
});

describe('api/nightly: generate', () => {
  it('when the claim fails: 202, and the model is not called', async () => {
    const { sql, model, call } = setup([
      ['FROM nightly_sessions WHERE date', [sessionRow('generating', { stories: null, niche: null, questions: null })]],
      ['INSERT INTO nightly_sessions', []],
    ]);
    const res = await call('generate');
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ inProgress: true });
    expect(model.generateBrief).not.toHaveBeenCalled();
    expect(issued(sql, 'INSERT INTO nightly_sessions')).toHaveLength(1);
  });

  it('claims with the stale-claim upsert, then saves the brief gated on generating: 201', async () => {
    const { sql, model, call } = setup([
      ['FROM nightly_sessions WHERE date', []],
      ['INSERT INTO nightly_sessions', [{ id: SID }]],
      ['SELECT questions FROM nightly_sessions', [{ questions: [{ type: 'case_rep' }] }]],
      ["niche->>'topic'", [{ topic: 'beekeeping' }]],
      ['SET stories', [sessionRow('generated')]],
    ]);
    const res = await call('generate');
    expect(res.statusCode).toBe(201);
    expect(res.body.session).toMatchObject({ id: SID, status: 'generated', stories: BRIEF.stories });

    const [claim] = issued(sql, 'INSERT INTO nightly_sessions');
    for (const f of ["'generating'", 'ON CONFLICT (date) DO UPDATE', "status = 'generating'", "interval '6 minutes'", 'RETURNING id']) {
      expect(claim.text).toContain(f);
    }
    expect(claim.values).toContain(NIGHT);

    const args = model.generateBrief.mock.calls[0][0];
    expect(args.night).toBe(NIGHT);
    expect(args.types).toHaveLength(3);
    expect(new Set(args.types).size).toBe(3);
    expect(args.field).not.toBe('beekeeping');
    expect(typeof args.deadline.remaining).toBe('function');
    expect(args.deadline.remaining()).toBeLessThanOrEqual(280_000);

    const [save] = issued(sql, 'SET stories');
    expect(save.text).toContain("status = 'generated'");
    expect(save.text).toMatch(/status = 'generating'/);
    expect(save.values).toContain(SID);
    expect(save.values).toContain(JSON.stringify(BRIEF.stories));
  });

  it('when the session already exists: 200 with it, no claim and no model call', async () => {
    const { sql, model, call } = setup(READS('submitted'));
    const res = await call('generate');
    expect(res.statusCode).toBe(200);
    expect(res.body.session.status).toBe('submitted');
    expect(issued(sql, 'INSERT INTO nightly_sessions')).toHaveLength(0);
    expect(model.generateBrief).not.toHaveBeenCalled();
  });

  it('when the model throws: the claim is released and the answer is 502 GENERATION_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const model = fakeModel();
    model.generateBrief.mockRejectedValue(new ModelError('BAD_URLS', 'unseen url'));
    const { sql, call } = setup([
      ['FROM nightly_sessions WHERE date', []],
      ['INSERT INTO nightly_sessions', [{ id: SID }]],
    ], { model });
    const res = await call('generate');
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('GENERATION_FAILED');
    expect(res.body.details).toEqual({ reason: 'BAD_URLS' });
    const [release] = issued(sql, 'DELETE FROM nightly_sessions');
    expect(release.text).toContain("status = 'generating'");
    expect(release.values).toContain(SID);
    expect(issued(sql, 'SET stories')).toHaveLength(0);
  });
});

describe('api/nightly: submit', () => {
  it('400 with details for an invalid body, before any query', async () => {
    const { sql, call } = setup(READS('generated'));
    const res = await call('submit', { body: submitBody({ answers: [] }) });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
    expect(sql.queries).toHaveLength(0);
  });

  it('moves generated to submitted and inserts answers and take in one CTE gated on tonight', async () => {
    let submitted = false;
    const { sql, call } = setup([
      ["status = 'submitted'", () => { submitted = true; return [{ updated: 1 }]; }],
      ['FROM nightly_sessions WHERE id', () => [sessionRow(submitted ? 'submitted' : 'generated')]],
      ['FROM nightly_answers', ANSWER_ROWS],
      ['FROM nightly_takes WHERE session_id', [TAKE_ROW]],
    ]);
    const res = await call('submit', { body: submitBody() });
    expect(res.statusCode).toBe(200);
    expect(res.body.session.status).toBe('submitted');
    expect(res.body.session.take).toEqual({ storyIndex: 1, body: 'my take' });

    const writes = issued(sql, "status = 'submitted'");
    expect(writes).toHaveLength(1);
    const [w] = writes;
    for (const f of ['WITH s AS', "status = 'generated'", 'INSERT INTO nightly_answers', 'jsonb_to_recordset', 'INSERT INTO nightly_takes', 'count(*)']) {
      expect(w.text).toContain(f);
    }
    expect(w.values).toContain(SID);
    expect(w.values).toContain(NIGHT);
    const rows = JSON.parse(w.values.find((v) => typeof v === 'string' && v.startsWith('[')));
    expect(rows[1]).toEqual({ idx: 1, question_type: 'decide', prompt: 'p1', answer: 'answer 1' });
  });

  it('submit twice: the second is 409 NOT_OPEN', async () => {
    const { call } = setup([["status = 'submitted'", [{ updated: 0 }]], ...READS('generated')]);
    const res = await call('submit', { body: submitBody() });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_OPEN');
  });

  it('an already-submitted session is 409 NOT_OPEN without a write', async () => {
    const { sql, call } = setup(READS('submitted'));
    const res = await call('submit', { body: submitBody() });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_OPEN');
    expect(issued(sql, 'INSERT INTO nightly_answers')).toHaveLength(0);
  });

  it('a closed night is 409 NIGHT_CLOSED without a write', async () => {
    const { sql, call } = setup(READS('generated', { date: '2026-11-11' }));
    const res = await call('submit', { body: submitBody() });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NIGHT_CLOSED');
    expect(issued(sql, 'INSERT INTO nightly_answers')).toHaveLength(0);
  });

  it('an unknown session is 409 NOT_OPEN', async () => {
    const { call } = setup([]);
    const res = await call('submit', { body: submitBody() });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_OPEN');
  });
});

describe('api/nightly: grade', () => {
  it('while someone else holds a fresh lease: 202, no model call', async () => {
    const { model, call } = setup([["status = 'grading'", []], ...READS('grading', { grading_started_at: NOW })]);
    const res = await call('grade', { body: { sessionId: SID } });
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ inProgress: true });
    expect(model.grade).not.toHaveBeenCalled();
  });

  it('from generated: 409 NOT_SUBMITTED', async () => {
    const { model, call } = setup([["status = 'grading'", []], ...READS('generated')]);
    const res = await call('grade', { body: { sessionId: SID } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_SUBMITTED');
    expect(model.grade).not.toHaveBeenCalled();
  });

  it('when already graded: 200 with the session', async () => {
    const { model, call } = setup([["status = 'grading'", []], ...READS('graded')]);
    const res = await call('grade', { body: { sessionId: SID } });
    expect(res.statusCode).toBe(200);
    expect(res.body.session.status).toBe('graded');
    expect(model.grade).not.toHaveBeenCalled();
  });

  it('claims (with the stale-lease rule), runs both calls, and saves in one CTE gated on grading', async () => {
    let graded = false;
    const { sql, model, call } = setup([
      ["status = 'graded'", () => { graded = true; return [{ updated: 1 }]; }],
      ["status = 'grading'", [{ id: SID }]],
      ['FROM nightly_sessions WHERE id', () => [sessionRow(graded ? 'graded' : 'grading')]],
      ['FROM nightly_answers', ANSWER_ROWS],
      ['FROM nightly_takes WHERE session_id', [TAKE_ROW]],
    ]);
    const res = await call('grade', { body: { sessionId: SID } });
    expect(res.statusCode).toBe(200);
    expect(res.body.session.status).toBe('graded');

    const [claim] = issued(sql, "status = 'grading'");
    for (const f of ["status = 'submitted'", "interval '6 minutes'", 'grading_started_at = now()']) expect(claim.text).toContain(f);

    expect(model.grade.mock.calls[0][0]).toMatchObject({
      stories: BRIEF.stories,
      questions: BRIEF.questions,
      answers: [0, 1, 2].map((idx) => ({ idx, answer: `a${idx}` })),
      take: { storyIndex: 1, body: 'my take' },
    });
    const blind = model.blindTake.mock.calls[0][0];
    expect(Object.keys(blind).sort()).toEqual(['deadline', 'story']);
    expect(blind.story).toEqual(BRIEF.stories[1]);

    const [save] = issued(sql, "status = 'graded'");
    for (const f of ['WITH s AS', "status = 'grading'", 'UPDATE nightly_answers', 'jsonb_to_recordset', 'UPDATE nightly_takes']) {
      expect(save.text).toContain(f);
    }
    expect(save.values).toContain('blind take');
    expect(save.values).toContain(GRADE.followUp);
    expect(JSON.parse(save.values.find((v) => typeof v === 'string' && v.startsWith('[')))).toEqual(GRADE.scores);
  });

  it('when the model throws: failGrading is issued and the answer is 502 GRADING_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const model = fakeModel();
    model.grade.mockRejectedValue(new ModelError('TIMEOUT', 'model call timed out'));
    const { sql, call } = setup([["status = 'grading'", [{ id: SID }]], ...READS('grading')], { model });
    const res = await call('grade', { body: { sessionId: SID } });
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('GRADING_FAILED');
    const [fail] = issued(sql, 'grade_error =');
    expect(fail.text).toContain("status = 'submitted'");
    expect(fail.text).toContain("status = 'grading'");
    expect(fail.values).toContain(SID);
    expect(fail.values.some((v) => typeof v === 'string' && v.includes('TIMEOUT'))).toBe(true);
    expect(issued(sql, "status = 'graded'")).toHaveLength(0);
  });

  it('400 for a bad session id', async () => {
    const { call } = setup();
    const res = await call('grade', { body: { sessionId: 'nope' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('api/nightly: publish', () => {
  it('from submitted: 409 NOT_PUBLISHABLE', async () => {
    const { call } = setup([['SET published = true', []], ...READS('submitted')]);
    const res = await call('publish', { body: { sessionId: SID } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_PUBLISHABLE');
  });

  it('from graded: 200, gated on graded and not yet published', async () => {
    const { sql, call } = setup([['SET published = true', [{ session_id: SID }]], ...READS('graded')]);
    const res = await call('publish', { body: { sessionId: SID } });
    expect(res.statusCode).toBe(200);
    expect(res.body.session.status).toBe('graded');
    const [p] = issued(sql, 'SET published = true');
    expect(p.text).toContain("status = 'graded'");
    expect(p.text).toContain('NOT k.published');
    expect(p.text).toContain('published_at = now()');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNightlyHandler } from './nightly.js';
import { ModelError } from './_lib/nightly/model.js';
import { sprintProblems } from './_lib/nightly/sprint.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from './_lib/testing.js';

// 18:00 Eastern on 13 Nov 2026, so tonight is 2026-11-13.
const NOW = new Date('2026-11-13T23:00:00Z');
const NIGHT = '2026-11-13';
const METHODS = { games: 'GET', puzzles: 'POST', solve: 'POST', log: 'POST' };

const FLAW = {
  flaw_key: 'survivorship', setting: 'a startup', argument: 'We only study winners.',
  choices: ['A', 'B', 'C', 'D'], answer_index: 2, explanation: 'Because.',
};
const PUZZLES_ROW = { night: NIGHT, flaw: FLAW };

/** mockSql whose results are picked by the first fragment the SQL text contains. */
function db(routes) {
  return mockSql((text) => {
    const hit = routes.find(([fragment]) => text.includes(fragment));
    if (!hit) return [];
    return typeof hit[1] === 'function' ? hit[1]() : hit[1];
  });
}
const issued = (sql, fragment) => sql.queries.filter((q) => q.text.includes(fragment));
const detailOf = (query) => JSON.parse(query.values.find((v) => typeof v === 'string' && v.startsWith('{')));

function fakeModel() {
  return { writeFlaw: vi.fn(async () => ({ argument: 'An argument.', explanation: 'An explanation.' })) };
}

function setup(routes = [], { model = fakeModel() } = {}) {
  const sql = db(routes);
  const handler = createNightlyHandler({ getSql: () => sql, auth: () => TEST_AUTH, model, now: () => NOW });
  const call = async (action, { method = METHODS[action], body, authed = true } = {}) => {
    const res = mockRes();
    await handler(authedReq({ method, body, query: { action }, authed }), res);
    return res;
  };
  return { sql, model, call };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('games actions: auth and methods', () => {
  for (const action of Object.keys(METHODS)) {
    it(`${action}: 401 without a session`, async () => {
      const { sql, call } = setup();
      const res = await call(action, { authed: false, body: {} });
      expect(res.statusCode).toBe(401);
      expect(sql.queries).toHaveLength(0);
    });
    it(`${action}: 405 on the wrong method`, async () => {
      const { call } = setup();
      const res = await call(action, { method: METHODS[action] === 'GET' ? 'POST' : 'GET', body: {} });
      expect(res.statusCode).toBe(405);
    });
  }
});

describe('games', () => {
  it('returns the payload with no flaw on a fresh night', async () => {
    const { call } = setup();
    const res = await call('games');
    expect(res.statusCode).toBe(200);
    expect(res.body.games.night).toBe(NIGHT);
    expect(res.body.games.puzzles.flaw).toBeNull();
  });
});

describe('puzzles', () => {
  it('writes the flaw once and hides the answer', async () => {
    let inserted = false;
    const { model, call } = setup([
      ['INSERT INTO nightly_puzzles', () => { inserted = true; return []; }],
      ['FROM nightly_puzzles WHERE night', () => (inserted ? [PUZZLES_ROW] : [])],
    ]);
    const res = await call('puzzles', { body: {} });
    expect(res.statusCode).toBe(200);
    expect(model.writeFlaw).toHaveBeenCalledTimes(1);
    expect(res.body.games.puzzles.flaw.argument).toBe(FLAW.argument);
    expect(JSON.stringify(res.body)).not.toContain('answerIndex');
    expect(JSON.stringify(res.body)).not.toContain('answer_index');
  });

  it('502 PUZZLES_FAILED with the reason, and nothing inserted', async () => {
    const model = { writeFlaw: vi.fn(async () => { throw new ModelError('REFUSAL', 'no'); }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sql, call } = setup([], { model });
    const res = await call('puzzles', { body: {} });
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('PUZZLES_FAILED');
    expect(res.body.details.reason).toBe('REFUSAL');
    expect(issued(sql, 'INSERT INTO nightly_puzzles')).toHaveLength(0);
  });

  it('makes no model call when tonight has a row', async () => {
    const { model, call } = setup([['FROM nightly_puzzles WHERE night', [PUZZLES_ROW]]]);
    const res = await call('puzzles', { body: {} });
    expect(res.statusCode).toBe(200);
    expect(model.writeFlaw).not.toHaveBeenCalled();
  });
});

describe('solve', () => {
  const sprintBody = (answers, extra = {}) => ({ puzzle: 'sprint', night: NIGHT, answer: { answers, seconds: 42 }, ...extra });
  const rightAnswers = () => sprintProblems(NIGHT).map((p) => p.answer);

  it('scores a perfect sprint 5 and stores seconds, correct and answers', async () => {
    const { sql, call } = setup([['INSERT INTO nightly_game_results', [{ game: 'puzzle_sprint' }]]]);
    const answers = rightAnswers();
    const res = await call('solve', { body: sprintBody(answers) });
    expect(res.statusCode).toBe(200);
    expect(res.body.games).toBeDefined();
    const [insert] = issued(sql, 'INSERT INTO nightly_game_results');
    expect(insert.values).toContain('puzzle_sprint');
    expect(insert.values).toContain(5);
    expect(detailOf(insert)).toEqual({ seconds: 42, correct: [true, true, true, true, true], answers });
  });

  for (const [choice, score] of [[2, 1], [0, 0]]) {
    it(`scores a flaw choice of ${choice} as ${score}`, async () => {
      const { sql, call } = setup([
        ['FROM nightly_puzzles WHERE night', [PUZZLES_ROW]],
        ['INSERT INTO nightly_game_results', [{ game: 'puzzle_flaw' }]],
      ]);
      const res = await call('solve', { body: { puzzle: 'flaw', night: NIGHT, answer: { choice } } });
      expect(res.statusCode).toBe(200);
      const [insert] = issued(sql, 'INSERT INTO nightly_game_results');
      expect(insert.values).toContain('puzzle_flaw');
      expect(insert.values).toContain(score);
      expect(detailOf(insert)).toEqual({ choice });
    });
  }

  it('409 ALREADY_SOLVED when the insert conflicts', async () => {
    const { call } = setup([['INSERT INTO nightly_game_results', []]]);
    const res = await call('solve', { body: sprintBody(rightAnswers()) });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ALREADY_SOLVED');
  });

  it('409 NIGHT_CLOSED for another night', async () => {
    const { sql, call } = setup();
    const res = await call('solve', { body: sprintBody(rightAnswers(), { night: '2026-11-12' }) });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NIGHT_CLOSED');
    expect(issued(sql, 'INSERT')).toHaveLength(0);
  });

  it('409 NO_PUZZLES for a flaw answer with no row', async () => {
    const { sql, call } = setup();
    const res = await call('solve', { body: { puzzle: 'flaw', night: NIGHT, answer: { choice: 1 } } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NO_PUZZLES');
    expect(issued(sql, 'INSERT')).toHaveLength(0);
  });

  it('400 VALIDATION_ERROR for a malformed body', async () => {
    const { call } = setup();
    const res = await call('solve', { body: { puzzle: 'sprint', night: NIGHT, answer: { answers: [1], seconds: 3 } } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('log', () => {
  for (const [game, score] of [['krillion', 540], ['fermi', 1.94]]) {
    it(`upserts ${game} ${score}`, async () => {
      const { sql, call } = setup();
      const res = await call('log', { body: { night: NIGHT, game, score } });
      expect(res.statusCode).toBe(200);
      expect(res.body.games).toBeDefined();
      const [up] = issued(sql, 'ON CONFLICT (night, game) DO UPDATE');
      expect(up.values).toContain(game);
      expect(up.values).toContain(score);
    });
  }

  it('400 for a score with too many decimals', async () => {
    const { call } = setup();
    const res = await call('log', { body: { night: NIGHT, game: 'krillion', score: 540.5 } });
    expect(res.statusCode).toBe(400);
  });

  it('409 NIGHT_CLOSED on a night mismatch', async () => {
    const { sql, call } = setup();
    const res = await call('log', { body: { night: '2026-11-12', game: 'krillion', score: 540 } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NIGHT_CLOSED');
    expect(issued(sql, 'INSERT')).toHaveLength(0);
  });
});

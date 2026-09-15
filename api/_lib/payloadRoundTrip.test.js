import { describe, it, expect } from 'vitest';
import { sessionPayload } from './trainerSchemas.js';
import { mulberry32 } from '../../src/private/trainers/core/rng.js';
import { makeZetamacGenerator, ZETAMAC_DEFAULTS } from '../../src/private/trainers/zetamac/generator.js';
import {
  startProblem, handleInput, handleDeleteKey, unfinishedAttempt,
} from '../../src/private/trainers/zetamac/tracker.js';
import { buildZetamacPayload } from '../../src/private/trainers/zetamac/payload.js';
import { generateOptiverTest } from '../../src/private/trainers/optiver/generator.js';
import { PROFILE_V1 } from '../../src/private/trainers/optiver/profile-v1.js';
import { gradeResponse, buildOptiverAttempts } from '../../src/private/trainers/optiver/grade.js';
import { buildOptiverPayload } from '../../src/private/trainers/optiver/payload.js';

// Real client-built games must always pass the server schema: a payload the
// server rejects is marked failed in the outbox and is never saved.

const ID = '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c';
const STARTED_AT = '2026-09-14T18:00:00.000Z';

function expectValid(payload) {
  const result = sessionPayload.safeParse(payload);
  expect(result.error?.issues ?? []).toEqual([]);
  expect(result.success).toBe(true);
}

function playZetamac({ solved, leftover }) {
  const next = makeZetamacGenerator(ZETAMAC_DEFAULTS, mulberry32(1));
  const attempts = [];
  let now = 0;
  for (let idx = 0; idx < solved; idx += 1) {
    const state = startProblem(next(), idx, now);
    now += 1500;
    const { attempt } = handleInput(state, String(state.problem.answer), now);
    attempts.push(attempt);
  }
  const last = startProblem(next(), solved, now);
  attempts.push(unfinishedAttempt(last, leftover));
  return attempts;
}

describe('client payloads round-trip through sessionPayload', () => {
  it('zetamac standard game with a 40-character leftover at the buzzer', async () => {
    const attempts = playZetamac({ solved: 15, leftover: '9'.repeat(40) });
    const payload = await buildZetamacPayload({ id: ID, options: { ...ZETAMAC_DEFAULTS }, mode: 'standard', startedAt: STARTED_AT, attempts });
    expect(payload.session.correct).toBe(15);
    expect(payload.attempts).toHaveLength(16);
    expectValid(payload);
  });

  it('zetamac game with zero solved problems', async () => {
    const attempts = playZetamac({ solved: 0, leftover: '12' });
    const payload = await buildZetamacPayload({ id: ID, options: { ...ZETAMAC_DEFAULTS }, mode: 'standard', startedAt: STARTED_AT, attempts });
    expect(payload.attempts).toHaveLength(1);
    expectValid(payload);
  });

  it('zetamac game with 1500 delete presses on one problem (corrections clamp)', async () => {
    const next = makeZetamacGenerator(ZETAMAC_DEFAULTS, mulberry32(1));
    let state = startProblem(next(), 0, 0);
    for (let i = 0; i < 1500; i += 1) state = handleDeleteKey(state);
    const { attempt } = handleInput(state, String(state.problem.answer), 1500);
    expect(attempt.corrections).toBe(1000);
    const payload = await buildZetamacPayload({
      id: ID, options: { ...ZETAMAC_DEFAULTS }, mode: 'standard', startedAt: STARTED_AT, attempts: [attempt],
    });
    expectValid(payload);
  });

  it('optiver test with 30 answers (some wrong) and the rest unreached', async () => {
    const questions = generateOptiverTest(PROFILE_V1, mulberry32(7));
    const answers = questions.slice(0, 30).map((q, i) => {
      const graded = gradeResponse(q, i % 4 === 0 ? `${q.answerText}1` : q.answerText);
      expect(graded.valid).toBe(true);
      return { response: graded.response, isCorrect: graded.isCorrect, timeMs: 5000 + i };
    });
    const attempts = buildOptiverAttempts(questions, answers);
    const payload = await buildOptiverPayload({ id: ID, startedAt: STARTED_AT, durationMs: 480000, attempts });
    expect(payload.session.wrong).toBeGreaterThan(0);
    expect(payload.session.correct + payload.session.wrong).toBe(30);
    expect(payload.session.unanswered).toBe(50);
    expectValid(payload);
  });

  it('optiver test with zero answers', async () => {
    const questions = generateOptiverTest(PROFILE_V1, mulberry32(7));
    const attempts = buildOptiverAttempts(questions, []);
    const payload = await buildOptiverPayload({ id: ID, startedAt: STARTED_AT, durationMs: 480000, attempts });
    expect(payload.session.score).toBe(0);
    expectValid(payload);
  });
});

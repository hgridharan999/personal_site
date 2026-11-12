import { z } from 'zod';
import { getSql as defaultGetSql } from './_lib/db.js';
import { authConfig } from './_lib/session.js';
import { guard, sendError } from './_lib/http.js';
import { nightDate } from './_lib/nightly/dates.js';
import { isModelMissing, lazyModel, REQUEST_BUDGET_MS, runGenerate } from './_lib/nightly/generate.js';
import { createDeadline, ModelError } from './_lib/nightly/model.js';
import * as q from './_lib/nightly/queries.js';
import { Question, SessionIdBody, Story, SubmitBody } from './_lib/nightly/schemas.js';
import { noteView, sessionView } from './_lib/nightly/views.js';

// /api/nightly?action=  today (GET), generate, submit, grade, publish (POST), notes (GET, public).
// One action table decides method and auth for every action, so auth can't be skipped by accident.
export const ACTIONS = {
  today: { method: 'GET', auth: true },
  generate: { method: 'POST', auth: true },
  submit: { method: 'POST', auth: true },
  grade: { method: 'POST', auth: true },
  publish: { method: 'POST', auth: true },
  notes: { method: 'GET', auth: false },
};

const StoredBrief = z.object({ stories: Story.array().length(3), questions: Question.array().length(3) });

/** The session as the page may see it; answers and the take are read only once something was written. */
async function viewOf(sql, row) {
  if (!row) return null;
  if (row.status === 'generating' || row.status === 'generated') return sessionView(row, [], null);
  const { answers, take } = await q.getAnswersAndTake(sql, row.id);
  return sessionView(row, answers, take);
}

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data;
  sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', z.flattenError(parsed.error));
  return null;
}

const errorText = (err) => {
  const text = err instanceof ModelError ? `${err.code}: ${err.message}` : 'unexpected error while grading';
  return text.slice(0, 500);
};

async function today(ctx) {
  const night = nightDate(ctx.now());
  const row = await q.getSessionByDate(ctx.sql, night);
  return ctx.res.status(200).json({ night, session: await viewOf(ctx.sql, row) });
}

async function generate(ctx) {
  const { sql, res } = ctx;
  const model = ctx.getModel();
  if (isModelMissing(model)) return sendError(res, 500, 'MODEL_NOT_CONFIGURED', 'The model is not configured');
  let result;
  try {
    result = await runGenerate({ sql, model, now: ctx.now, deadline: ctx.deadline() });
  } catch (err) {
    console.error('nightly generate failed:', err instanceof ModelError ? `${err.code}: ${err.message}` : err);
    const details = err instanceof ModelError ? { reason: err.code } : undefined;
    return sendError(res, 502, 'GENERATION_FAILED', 'The brief could not be generated', details);
  }
  if (result.status === 'in_progress') return res.status(202).json({ inProgress: true });
  const session = await viewOf(sql, result.session);
  return res.status(result.status === 'created' ? 201 : 200).json({ session });
}

async function submit(ctx) {
  const { sql, req, res } = ctx;
  const body = parseBody(SubmitBody, req, res);
  if (!body) return undefined;
  const row = await q.getSessionById(sql, body.sessionId);
  const night = nightDate(ctx.now());
  if (row && row.date !== night) return sendError(res, 409, 'NIGHT_CLOSED', 'This night has closed');
  if (!row || row.status !== 'generated') return sendError(res, 409, 'NOT_OPEN', 'This session is not open for answers');

  const { questions } = StoredBrief.parse(row);
  const prompts = questions.map((x, idx) => ({ idx, questionType: x.type, prompt: x.prompt }));
  const updated = await q.submit(sql, { sessionId: row.id, night, answers: body.answers, take: body.take, prompts });
  if (!updated) return sendError(res, 409, 'NOT_OPEN', 'This session is not open for answers');
  return res.status(200).json({ session: await viewOf(sql, await q.getSessionById(sql, row.id)) });
}

/** grade without the lease: graded → the session, someone grading → 202, anything else → 409. */
async function gradeUnclaimed(ctx, id) {
  const row = await q.getSessionById(ctx.sql, id);
  if (row?.status === 'graded') return ctx.res.status(200).json({ session: await viewOf(ctx.sql, row) });
  // `submitted` here means a lease holder just failed between our claim and this read; let the page re-read.
  if (row?.status === 'grading' || row?.status === 'submitted') return ctx.res.status(202).json({ inProgress: true });
  return sendError(ctx.res, 409, 'NOT_SUBMITTED', 'This session has nothing to grade');
}

async function runGrade(ctx, model, id) {
  const { sql } = ctx;
  const row = await q.getSessionById(sql, id);
  const { stories, questions } = StoredBrief.parse(row);
  const { answers, take } = await q.getAnswersAndTake(sql, id);
  if (!take) throw new Error('the session has no take to grade');
  const deadline = ctx.deadline();
  const [result, blind] = await Promise.all([
    model.grade({
      stories,
      questions,
      answers: answers.map((a) => ({ idx: a.idx, answer: a.answer })),
      take: { storyIndex: take.story_index, body: take.body },
      deadline,
    }),
    model.blindTake({ story: stories[take.story_index], deadline }),
  ]);
  return q.saveGrade(sql, id, result, blind);
}

async function grade(ctx) {
  const { sql, req, res } = ctx;
  const body = parseBody(SessionIdBody, req, res);
  if (!body) return undefined;
  const id = body.sessionId;
  if (!(await q.claimGrading(sql, id))) return gradeUnclaimed(ctx, id);

  const model = ctx.getModel();
  if (isModelMissing(model)) {
    await q.failGrading(sql, id, 'MODEL_NOT_CONFIGURED: the model is not configured');
    return sendError(res, 500, 'MODEL_NOT_CONFIGURED', 'The model is not configured');
  }
  let saved;
  try {
    saved = await runGrade(ctx, model, id);
  } catch (err) {
    console.error('nightly grade failed:', err instanceof ModelError ? err.code : err);
    try {
      await q.failGrading(sql, id, errorText(err));
    } catch (failErr) {
      console.error('nightly: recording the grade failure failed:', failErr);
    }
    return sendError(res, 502, 'GRADING_FAILED', 'Grading did not finish');
  }
  if (!saved) return gradeUnclaimed(ctx, id); // the lease was taken over meanwhile
  return res.status(200).json({ session: await viewOf(sql, await q.getSessionById(sql, id)) });
}

async function publish(ctx) {
  const { sql, req, res } = ctx;
  const body = parseBody(SessionIdBody, req, res);
  if (!body) return undefined;
  if (!(await q.publish(sql, body.sessionId))) {
    return sendError(res, 409, 'NOT_PUBLISHABLE', 'Only a graded, unpublished take can be published');
  }
  return res.status(200).json({ session: await viewOf(sql, await q.getSessionById(sql, body.sessionId)) });
}

async function notes(ctx) {
  const rows = await q.listNotes(ctx.sql);
  ctx.res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return ctx.res.status(200).json({ notes: rows.map(noteView) });
}

const HANDLERS = { today, generate, submit, grade, publish, notes };

const MODEL_ACTIONS = new Set(['generate', 'grade']);

export function createNightlyHandler({ getSql = defaultGetSql, auth = authConfig, model, now = () => new Date() } = {}) {
  const getModel = lazyModel(model);

  return async function handler(req, res) {
    const name = req.query?.action;
    const action = typeof name === 'string' && Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : null;
    if (!action) {
      res.setHeader('Cache-Control', 'no-store');
      return sendError(res, 404, 'UNKNOWN_ACTION', 'Unknown action');
    }
    const sql = guard(req, res, { methods: [action.method], auth, getSql, requireAuth: action.auth });
    if (!sql) return undefined;
    // One time budget per request, started as the request arrives.
    const deadline = MODEL_ACTIONS.has(name) ? createDeadline(REQUEST_BUDGET_MS) : null;
    const ctx = { sql, req, res, now, getModel, deadline: () => deadline };
    try {
      return await HANDLERS[name](ctx);
    } catch (err) {
      console.error(`nightly ${name} failed:`, err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createNightlyHandler();

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

import { getSql as defaultGetSql } from './_lib/db.js';
import { sendError } from './_lib/http.js';
import { cronAuthorized } from './_lib/nightly/cronAuth.js';
import { isModelMissing, lazyModel, REQUEST_BUDGET_MS, runGenerate } from './_lib/nightly/generate.js';
import { createDeadline, ModelError } from './_lib/nightly/model.js';

// GET /api/nightly-cron: Vercel cron only (vercel.json, 01:00 UTC). Generates tonight's brief, using
// the Eastern night, never the UTC date. Hobby may fire twice; the claim makes the second run a no-op.

const STATUS_CODES = { created: 201, exists: 200, in_progress: 202 };

export function createNightlyCronHandler({ getSql = defaultGetSql, model, now = () => new Date() } = {}) {
  const getModel = lazyModel(model);

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    }
    const auth = cronAuthorized(req);
    if (auth === 'misconfigured') return sendError(res, 500, 'CRON_NOT_CONFIGURED', 'CRON_SECRET is missing or too short');
    if (auth !== 'ok') return sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized');

    const sql = getSql();
    if (!sql) return sendError(res, 500, 'DB_NOT_CONFIGURED', 'Database is not configured');
    const ready = getModel();
    if (isModelMissing(ready)) return sendError(res, 500, 'MODEL_NOT_CONFIGURED', 'The model is not configured');

    const deadline = createDeadline(REQUEST_BUDGET_MS);
    try {
      const result = await runGenerate({ sql, model: ready, now, deadline });
      return res.status(STATUS_CODES[result.status]).json({
        status: result.status,
        night: result.night,
        sessionId: result.session?.id ?? null,
      });
    } catch (err) {
      console.error('nightly-cron failed:', err instanceof ModelError ? `${err.code}: ${err.message}` : err);
      const details = err instanceof ModelError ? { reason: err.code } : undefined;
      return sendError(res, 502, 'GENERATION_FAILED', 'The brief could not be generated', details);
    }
  };
}

export default createNightlyCronHandler();

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
  // Newest config per (config_key, mode) via DISTINCT ON, joined to per-group
  // counts, so only one config document per group is ever loaded.
  const configs = await sql`
    SELECT latest."configKey", latest.mode, totals.games, totals."lastPlayed",
           latest."profileVersion", latest.config
    FROM (
      SELECT DISTINCT ON (config_key, mode)
             config_key AS "configKey", mode, profile_version AS "profileVersion", config
      FROM sessions WHERE trainer = ${trainer}
      ORDER BY config_key, mode, started_at DESC
    ) latest
    JOIN (
      SELECT config_key, mode, count(*)::int AS games, max(started_at) AS "lastPlayed"
      FROM sessions WHERE trainer = ${trainer}
      GROUP BY config_key, mode
    ) totals ON totals.config_key = latest."configKey" AND totals.mode = latest.mode
    ORDER BY totals."lastPlayed" DESC`;
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

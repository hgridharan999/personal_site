import { getSql as defaultGetSql } from '../_lib/db.js';
import { authConfig } from '../_lib/session.js';
import { guard, sendError } from '../_lib/http.js';
import { rankWeakFacts, DRILL_UNLOCK_GAMES, DRILL_RECENT_GAMES, DRILL_POOL_SIZE } from '../../src/private/trainers/core/facts.js';

// GET /api/trainers/drill — weakest Zetamac facts from the most recent standard games (spec §4.4).

export function createDrillHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET'], auth, getSql });
    if (!sql) return undefined;
    try {
      const [[{ games }], rows] = await Promise.all([
        sql`SELECT count(*)::int AS games FROM sessions WHERE trainer = 'zetamac' AND mode = 'standard'`,
        sql`WITH recent AS (
              SELECT id FROM sessions WHERE trainer = 'zetamac' AND mode = 'standard'
              ORDER BY started_at DESC LIMIT ${DRILL_RECENT_GAMES}
            )
            SELECT a.fact_key AS "factKey", a.qtype, count(*)::int AS n,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY a.time_ms)::float8 AS "medianMs",
                   avg(a.corrections)::float8 AS "correctionsRate"
            FROM attempts a JOIN recent r ON r.id = a.session_id
            WHERE a.time_ms IS NOT NULL AND a.fact_key IS NOT NULL
            GROUP BY a.fact_key, a.qtype HAVING count(*) >= 2`,
      ]);
      const unlocked = games >= DRILL_UNLOCK_GAMES;
      return res.status(200).json({
        standardGames: games,
        unlocked,
        facts: unlocked ? rankWeakFacts(rows, DRILL_POOL_SIZE) : [],
      });
    } catch (err) {
      console.error('trainers/drill failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createDrillHandler();

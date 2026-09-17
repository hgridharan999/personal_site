import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { pokerStatsQuery } from '../../_lib/pokerSchemas.js';
import {
  LEAK_EXAMPLES, LEAK_MIN_DECISIONS, LEAK_UNLOCK_HANDS, shapeLeaks, shapeTrend, pickFocus, shapeSpotHands,
} from '../../_lib/pokerStatsShape.js';
import { accumulateProfile } from '../../../src/private/trainers/poker/bots/profileStats.js';
import { emptyTendencies, accumulateTendencies, shapeTendencies } from '../../../src/private/trainers/poker/leaks/tendencies.js';
import { spotLabel } from '../../../src/private/trainers/poker/leaks/spotCopy.js';

// GET /api/trainers/poker/stats          leak tracker: summary, tendencies, leaks, trend, focus (spec §7.4)
// GET /api/trainers/poker/stats?spot=    the latest hands with a decision in one spot (the focus link)
// Amounts in rows are integer units (1 unit = 0.5 BB); rates in the response are BB.
// Every query is bounded, and the four stats queries run in parallel, to stay well inside the
// function time limit with thousands of hands. api/_lib/pokerBundle.test.js proves the ../../../src
// imports load in plain Node.

export const TENDENCY_MAX_HANDS = 2000;
export const LEAK_WINDOW_HANDS = 10000;
export const LEAK_LIMIT = 20;
export const TREND_SESSIONS = 50;
export const SPOT_HANDS_LIMIT = 50;

const EMPTY_SUMMARY = Object.freeze({ hands: 0, sessions: 0, gradedHands: 0, decisions: 0, confidentDecisions: 0 });

// Graded hands: hands in the window from the earliest hand with any decision onward that
// are themselves graded, i.e. have at least one decision or needed none (hero_actions = 0).
// A hand with hero actions but no decision yet (grading timed out, not yet re-graded) does
// not count, so it neither unlocks leaks early nor dilutes BB/100.
const summaryQuery = (sql) => sql`
  WITH recent AS (
    SELECT id, played_at, hero_actions FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT ${LEAK_WINDOW_HANDS}
  ), decided AS (
    SELECT d.confident, d.hand_id, r.played_at FROM poker_decisions d JOIN recent r ON r.id = d.hand_id
  ), graded AS (
    SELECT r.id FROM recent r
    WHERE r.played_at >= (SELECT min(played_at) FROM decided)
      AND (r.hero_actions = 0 OR EXISTS (SELECT 1 FROM decided d WHERE d.hand_id = r.id))
  )
  SELECT (SELECT count(*) FROM poker_hands)::int AS hands,
         (SELECT count(*) FROM poker_sessions WHERE hands > 0)::int AS sessions,
         (SELECT count(*) FROM graded)::int AS "gradedHands",
         (SELECT count(*) FROM decided)::int AS decisions,
         (SELECT count(*) FROM decided WHERE confident)::int AS "confidentDecisions"`;

// Confident decisions only, per spot. Examples are the costliest hands (loss > 0) in that spot.
const leaksQuery = (sql) => sql`
  WITH recent AS (
    SELECT id FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT ${LEAK_WINDOW_HANDS}
  ), confident AS (
    SELECT d.spot, d.hand_id, d.action, d.ev_loss, d.grade
    FROM poker_decisions d JOIN recent r ON r.id = d.hand_id
    WHERE d.confident
  ), per_hand AS (
    -- ev_loss is real (float4); summing as numeric keeps the total exact instead of
    -- accumulating float4 rounding noise (e.g. 1.100000023841858) before it's exposed below.
    SELECT spot, hand_id, count(*)::int AS n, sum(ev_loss::numeric) AS loss,
           count(*) FILTER (WHERE grade IN ('mistake', 'blunder'))::int AS mistakes
    FROM confident GROUP BY spot, hand_id
  ), by_action AS (
    SELECT DISTINCT ON (spot) spot, action
    FROM (SELECT spot, action, sum(ev_loss) AS loss FROM confident GROUP BY spot, action) a
    ORDER BY spot, loss DESC, action
  )
  SELECT p.spot, sum(p.n)::int AS decisions, count(*)::int AS hands, sum(p.mistakes)::int AS mistakes,
         round(COALESCE(sum(p.loss), 0), 2)::float8 AS "evLoss", b.action AS "costliestAction",
         COALESCE(
           array_to_json((array_agg(p.hand_id::text ORDER BY p.loss DESC, p.hand_id) FILTER (WHERE p.loss > 0))[1:${LEAK_EXAMPLES}::int]),
           '[]'::json
         ) AS examples
  FROM per_hand p JOIN by_action b ON b.spot = p.spot
  GROUP BY p.spot, b.action
  HAVING sum(p.n) >= ${LEAK_MIN_DECISIONS}::int
  ORDER BY "evLoss" DESC, p.spot
  LIMIT ${LEAK_LIMIT}`;

// All graded decisions (confident or not), matching the session review's EV lost per 100 decisions.
const trendQuery = (sql) => sql`
  WITH s AS (
    SELECT id, started_at, hands, net, allin_adj_net FROM poker_sessions
    WHERE hands > 0 ORDER BY started_at DESC, id DESC LIMIT ${TREND_SESSIONS}
  )
  SELECT s.id, s.started_at AS "startedAt", s.hands, s.net, s.allin_adj_net::float8 AS "allinAdjNet",
         d.decisions, d.ev_loss AS "evLoss"
  FROM s CROSS JOIN LATERAL (
    SELECT count(pd.hand_id)::int AS decisions, round(COALESCE(sum(pd.ev_loss::numeric), 0), 2)::float8 AS ev_loss
    FROM poker_hands h JOIN poker_decisions pd ON pd.hand_id = h.id
    WHERE h.session_id = s.id
  ) d
  ORDER BY s.started_at, s.id`;

const handsQuery = (sql) => sql`
  SELECT hero_seat AS "heroSeat", events FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT ${TENDENCY_MAX_HANDS}`;

async function loadStats(sql, accumulate) {
  const [summaryRows, leakRows, trendRows, handRows] = await Promise.all([
    summaryQuery(sql), leaksQuery(sql), trendQuery(sql), handsQuery(sql),
  ]);
  const summary = { ...(summaryRows[0] ?? EMPTY_SUMMARY), unlockHands: LEAK_UNLOCK_HANDS, minSpotDecisions: LEAK_MIN_DECISIONS };
  let acc = emptyTendencies();
  for (let i = handRows.length - 1; i >= 0; i -= 1) {
    acc = accumulateTendencies(acc, handRows[i].heroSeat, handRows[i].events, accumulate);
  }
  const leaks = shapeLeaks(leakRows, summary.gradedHands);
  return { summary, tendencies: shapeTendencies(acc), leaks, trend: shapeTrend(trendRows), focus: pickFocus(leaks) };
}

async function loadSpotHands(sql, spot) {
  const rows = await sql`
    SELECT h.id AS "handId", h.session_id AS "sessionId", h.hand_no AS "handNo", h.played_at AS "playedAt",
           h.hero_net AS "heroNet", x.decisions, x."evLoss", x.severity, x.confident
    FROM (
      SELECT d.hand_id, count(*)::int AS decisions, round(COALESCE(sum(d.ev_loss::numeric), 0), 2)::float8 AS "evLoss",
             max(CASE d.grade WHEN 'blunder' THEN 3 WHEN 'mistake' THEN 2 WHEN 'inaccuracy' THEN 1 ELSE 0 END)::int AS severity,
             bool_and(d.confident) AS confident
      FROM poker_decisions d WHERE d.spot = ${spot} GROUP BY d.hand_id
    ) x JOIN poker_hands h ON h.id = x.hand_id
    ORDER BY h.played_at DESC, h.id DESC
    LIMIT ${SPOT_HANDS_LIMIT}`;
  return { spot, label: spotLabel(spot), hands: shapeSpotHands(rows) };
}

export function createPokerStatsHandler({ getSql = defaultGetSql, auth = authConfig, accumulate = accumulateProfile } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET'], auth, getSql });
    if (!sql) return undefined;
    const parsed = pokerStatsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stats query', z.flattenError(parsed.error));
    }
    try {
      const { spot } = parsed.data;
      const body = spot === undefined ? await loadStats(sql, accumulate) : await loadSpotHands(sql, spot);
      return res.status(200).json(body);
    } catch (err) {
      console.error('trainers/poker/stats failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerStatsHandler();

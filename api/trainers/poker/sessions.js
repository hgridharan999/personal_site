import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { idQuery } from '../../_lib/trainerSchemas.js';
import {
  pokerSessionOpen, pokerSessionClose, openSessionsQuery, pokerReviewQuery, recentSessionsQuery,
} from '../../_lib/pokerSchemas.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';
import {
  REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT, shapeReviewHand, shapeSummary, shapeOpponents,
} from '../../_lib/pokerReview.js';
import { ANALYSIS_VERSION } from '../../../src/private/trainers/poker/analysis/version.js';

// POST  /api/trainers/poker/sessions                  open a session (idempotent on id)
// PATCH /api/trainers/poker/sessions?id=              close it: { endedAt } (null = stale close at the last hand)
// GET   /api/trainers/poker/sessions?id=&afterHandNo= review page: summary, costliest, opponents, 300 hand summaries
// GET   /api/trainers/poker/sessions?status=open      sessions never closed (stale-session cleanup)
// GET   /api/trainers/poker/sessions?status=recent    latest sessions with hands (lobby)
// Amounts are integer units (1 unit = 0.5 BB). Event logs are served one hand at a time by GET hands?id=.

export const OPEN_SESSIONS_LIMIT = 20;

const invalid = (res, message, error) => sendError(res, 400, 'VALIDATION_ERROR', message, z.flattenError(error));

async function open(sql, req, res) {
  const parsed = pokerSessionOpen.safeParse(req.body);
  if (!parsed.success) return invalid(res, 'Invalid session payload', parsed.error);
  const s = parsed.data;
  const rows = await sql`
    INSERT INTO poker_sessions (id, bot_version, table_mode, lineup, hero_seat, started_at)
    VALUES (${s.id}, ${s.botVersion}, ${s.tableMode}, ${JSON.stringify(s.lineup)}::jsonb, ${s.heroSeat}, ${s.startedAt})
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  return res.status(200).json({ id: s.id, saved: true, duplicate: rows.length === 0 });
}

async function close(sql, req, res) {
  const query = idQuery.safeParse(req.query ?? {});
  if (!query.success) return invalid(res, 'A valid session id is required', query.error);
  const body = pokerSessionClose.safeParse(req.body ?? {});
  if (!body.success) return invalid(res, 'Invalid close payload', body.error);
  const { id } = query.data;
  const { endedAt } = body.data;

  // hands/net/allin_adj_net are already kept current by POST hands. Closing sets the end
  // time (an explicit time wins; null keeps an earlier end, else the last hand's start)
  // and counts rebuys: hands that start above the previous hand's ending stack.
  const [row] = await sql`
    WITH h AS (
      SELECT played_at, hero_start_stack,
             lag(hero_start_stack + hero_net) OVER (ORDER BY hand_no) AS prev_end
      FROM poker_hands WHERE session_id = ${id}
    ), agg AS (
      SELECT max(played_at) AS last_at,
             (count(*) FILTER (WHERE prev_end IS NOT NULL AND hero_start_stack > prev_end))::int AS rebuys
      FROM h
    )
    UPDATE poker_sessions s
    SET ended_at = COALESCE(${endedAt}::timestamptz, s.ended_at, agg.last_at, s.started_at),
        rebuys = agg.rebuys
    FROM agg
    WHERE s.id = ${id}
    RETURNING s.id, s.ended_at AS "endedAt", s.hands, s.net, s.allin_adj_net::float8 AS "allinAdjNet", s.rebuys`;
  if (!row) return sendSessionNotFound(res, [id]);
  return res.status(200).json({ ...row, closed: true });
}

async function read(sql, req, res) {
  const parsed = pokerReviewQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'A valid session id is required', parsed.error);
  const { id, afterHandNo } = parsed.data;
  const [session] = await sql`
    SELECT id, bot_version AS "botVersion", table_mode AS "tableMode", lineup, hero_seat AS "heroSeat",
           started_at AS "startedAt", ended_at AS "endedAt", hands, net,
           allin_adj_net::float8 AS "allinAdjNet", rebuys
    FROM poker_sessions WHERE id = ${id}`;
  if (!session) return sendError(res, 404, 'NOT_FOUND', 'Session not found');

  const [handRows, summaryRows, costliest, opponentRows] = await Promise.all([
    sql`
      SELECT h.id, h.hand_no AS "handNo", h.played_at AS "playedAt", h.hero_seat AS "heroSeat", h.events->0 AS start,
             h.hole_cards AS "holeCards", h.board, h.pot, h.hero_net AS "heroNet", h.hero_allin_ev::float8 AS "heroAllinEv",
             h.showdown, h.hero_actions AS "heroActions",
             d.decisions, d.ev_loss AS "evLoss", d.severity, d.confident, d.version
      FROM poker_hands h
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS decisions, round(COALESCE(sum(x.ev_loss), 0)::numeric, 2)::float8 AS ev_loss,
               max(CASE x.grade WHEN 'blunder' THEN 3 WHEN 'mistake' THEN 2 WHEN 'inaccuracy' THEN 1 ELSE 0 END)::int AS severity,
               bool_and(x.confident) AS confident, max(x.analysis_version)::int AS version
        FROM poker_decisions x WHERE x.hand_id = h.id
      ) d
      WHERE h.session_id = ${id} AND h.hand_no > ${afterHandNo}
      ORDER BY h.hand_no
      LIMIT ${REVIEW_PAGE_HANDS + 1}`,
    sql`
      SELECT (SELECT count(*) FROM poker_hands u
              WHERE u.session_id = ${id} AND u.hero_actions > 0
                AND COALESCE((SELECT max(v.analysis_version) FROM poker_decisions v WHERE v.hand_id = u.id), 0) < ${ANALYSIS_VERSION}
             )::int AS "ungradedHands",
             count(d.hand_id)::int AS decisions,
             round(COALESCE(sum(d.ev_loss), 0)::numeric, 2)::float8 AS "evLoss",
             count(DISTINCT d.hand_id) FILTER (WHERE d.analysis_version = ${ANALYSIS_VERSION})::int AS "gradedHands",
             count(*) FILTER (WHERE d.grade = 'good')::int AS good,
             count(*) FILTER (WHERE d.grade = 'inaccuracy')::int AS inaccuracy,
             count(*) FILTER (WHERE d.grade = 'mistake')::int AS mistake,
             count(*) FILTER (WHERE d.grade = 'blunder')::int AS blunder,
             count(*) FILTER (WHERE NOT d.confident)::int AS debatable
      FROM poker_hands h JOIN poker_decisions d ON d.hand_id = h.id
      WHERE h.session_id = ${id}`,
    sql`
      SELECT d.hand_id AS "handId", h.hand_no AS "handNo", d.idx, d.street, d.position, d.spot, d.action, d.size, d.pot,
             d.to_call AS "toCall", d.recommended, d.ev_loss AS "evLoss", d.grade, d.confident
      FROM poker_decisions d JOIN poker_hands h ON h.id = d.hand_id
      WHERE h.session_id = ${id} AND d.ev_loss > 0
      ORDER BY d.ev_loss DESC, h.hand_no, d.idx
      LIMIT ${COSTLIEST_LIMIT}`,
    sql`
      SELECT (e->>'seat')::int AS seat, e->>'personaId' AS "personaId", min(h.hand_no)::int AS "firstHand"
      FROM poker_hands h CROSS JOIN LATERAL jsonb_array_elements(h.lineup) e
      WHERE h.session_id = ${id}
      GROUP BY 1, 2
      ORDER BY 1, 3`,
  ]);
  const page = handRows.slice(0, REVIEW_PAGE_HANDS).map(shapeReviewHand);
  return res.status(200).json({
    session,
    summary: shapeSummary(session, summaryRows[0]),
    costliest,
    opponents: shapeOpponents(opponentRows, session.lineup),
    hands: page,
    nextAfterHandNo: handRows.length > REVIEW_PAGE_HANDS ? page[page.length - 1].handNo : null,
  });
}

async function listOpen(sql, req, res) {
  const parsed = openSessionsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'status must be open or recent', parsed.error);
  const sessions = await sql`
    SELECT s.id, s.started_at AS "startedAt", s.hands,
           GREATEST(s.started_at, max(h.played_at)) AS "lastActivityAt"
    FROM poker_sessions s LEFT JOIN poker_hands h ON h.session_id = s.id
    WHERE s.ended_at IS NULL
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ${OPEN_SESSIONS_LIMIT}`;
  return res.status(200).json({ sessions });
}

async function listRecent(sql, req, res) {
  const parsed = recentSessionsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'status must be open or recent', parsed.error);
  const sessions = await sql`
    SELECT id, started_at AS "startedAt", ended_at AS "endedAt", table_mode AS "tableMode", hands, net,
           allin_adj_net::float8 AS "allinAdjNet"
    FROM poker_sessions
    WHERE hands > 0
    ORDER BY started_at DESC, id DESC
    LIMIT ${RECENT_SESSIONS_LIMIT}`;
  return res.status(200).json({ sessions });
}

export function createPokerSessionsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET', 'POST', 'PATCH'], auth, getSql });
    if (!sql) return undefined;
    try {
      if (req.method === 'POST') return await open(sql, req, res);
      if (req.method === 'PATCH') return await close(sql, req, res);
      const status = req.query?.status;
      if (status === 'recent') return await listRecent(sql, req, res);
      if (status !== undefined) return await listOpen(sql, req, res);
      return await read(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/sessions failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerSessionsHandler();

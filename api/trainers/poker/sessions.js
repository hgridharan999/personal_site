import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { idQuery } from '../../_lib/trainerSchemas.js';
import { pokerSessionOpen, pokerSessionClose, openSessionsQuery } from '../../_lib/pokerSchemas.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';

// POST  /api/trainers/poker/sessions              open a session (idempotent on id)
// PATCH /api/trainers/poker/sessions?id=          close it: { endedAt } (null = stale close at the last hand)
// GET   /api/trainers/poker/sessions?id=          one session with its hands and decisions (review)
// GET   /api/trainers/poker/sessions?status=open  sessions never closed (stale-session cleanup)
// Amounts are integer units (1 unit = 0.5 BB).

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
  const parsed = idQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'A valid session id is required', parsed.error);
  const { id } = parsed.data;
  const [session] = await sql`
    SELECT id, bot_version AS "botVersion", table_mode AS "tableMode", lineup, hero_seat AS "heroSeat",
           started_at AS "startedAt", ended_at AS "endedAt", hands, net,
           allin_adj_net::float8 AS "allinAdjNet", rebuys
    FROM poker_sessions WHERE id = ${id}`;
  if (!session) return sendError(res, 404, 'NOT_FOUND', 'Session not found');
  const [hands, decisions] = await Promise.all([
    sql`
      SELECT id, hand_no AS "handNo", played_at AS "playedAt", button_seat AS "buttonSeat", hero_seat AS "heroSeat",
             hero_start_stack AS "heroStartStack", lineup, hole_cards AS "holeCards", board, events, pot,
             hero_net AS "heroNet", hero_allin_ev::float8 AS "heroAllinEv", showdown
      FROM poker_hands WHERE session_id = ${id} ORDER BY hand_no`,
    sql`
      SELECT d.hand_id AS "handId", d.idx, d.street, d.position, d.spot, d.action, d.size, d.pot,
             d.to_call AS "toCall", d.equity, d.needed_equity AS "neededEquity", d.recommended,
             d.ev_loss AS "evLoss", d.grade, d.confident, d.analysis_version AS "analysisVersion"
      FROM poker_decisions d JOIN poker_hands h ON h.id = d.hand_id
      WHERE h.session_id = ${id} ORDER BY h.hand_no, d.idx`,
  ]);
  return res.status(200).json({ session, hands, decisions });
}

async function listOpen(sql, req, res) {
  const parsed = openSessionsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'status must be open', parsed.error);
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

export function createPokerSessionsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET', 'POST', 'PATCH'], auth, getSql });
    if (!sql) return undefined;
    try {
      if (req.method === 'POST') return await open(sql, req, res);
      if (req.method === 'PATCH') return await close(sql, req, res);
      return req.query?.status !== undefined ? await listOpen(sql, req, res) : await read(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/sessions failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerSessionsHandler();

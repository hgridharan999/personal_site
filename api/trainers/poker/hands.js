import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { handsBatch, handIdQuery, ungradedHandsQuery, handGradesBatch, decisionProblems } from '../../_lib/pokerSchemas.js';
import { replayHandRecord } from '../../_lib/pokerReplay.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';

// POST  /api/trainers/poker/hands  { hands: [{ hand, decisions?, heroAllinEv? }] }  at most 50 hands, 40 decisions each
// PATCH /api/trainers/poker/hands  { grades: [{ handId, analysisVersion, decisions, heroAllinEv }] }  re-grade, at most 20
// GET   /api/trainers/poker/hands?id=                                        one hand with events and decisions (replayer)
// GET   /api/trainers/poker/hands?ungraded=1&sessionId=&belowVersion=&afterHandNo=&limit=   hands to re-grade
// Amounts are integer units (1 unit = 0.5 BB); EVs are fractional units.

const invalid = (res, message, error) => sendError(res, 400, 'VALIDATION_ERROR', message, z.flattenError(error));
const idList = (ids) => JSON.stringify(ids);

function handRow({ hand, heroAllinEv }) {
  const { facts } = replayHandRecord(hand); // already validated by handsBatch, so facts is set
  return {
    id: hand.id,
    session_id: hand.sessionId,
    hand_no: hand.handNo,
    played_at: hand.playedAt,
    button_seat: hand.buttonSeat,
    hero_seat: hand.heroSeat,
    hero_start_stack: facts.heroStartStack,
    hero_actions: facts.heroActions,
    lineup: hand.lineup,
    hole_cards: facts.holeCards,
    board: facts.board,
    events: hand.events,
    pot: hand.pot,
    hero_net: hand.heroNet,
    hero_allin_ev: heroAllinEv,
    showdown: hand.showdown,
  };
}

function decisionRows({ hand, decisions }) {
  return decisions.map((d) => ({
    hand_id: hand.id,
    idx: d.idx,
    street: d.street,
    position: d.position,
    spot: d.spot,
    action: d.action,
    size: d.size,
    pot: d.pot,
    to_call: d.toCall,
    equity: d.equity,
    needed_equity: d.neededEquity,
    recommended: d.recommended,
    ev_loss: d.evLoss,
    grade: d.grade,
    confident: d.confident,
    analysis_version: d.analysisVersion,
  }));
}

async function save(sql, req, res) {
  const parsed = handsBatch.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid hands payload', z.flattenError(parsed.error));
  }
  const { hands } = parsed.data;

  // Hands can reach the server before their session row (spec §6.3). Reject the whole batch
  // so the outbox retries it once the session is saved.
  const sessionIds = [...new Set(hands.map((item) => item.hand.sessionId))];
  const found = await sql`
    SELECT id, hero_seat AS "heroSeat" FROM poker_sessions
    WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(sessionIds)}::jsonb))`;
  const known = new Set(found.map((r) => r.id));
  const missing = sessionIds.filter((id) => !known.has(id));
  if (missing.length > 0) return sendSessionNotFound(res, missing);

  // A hand's heroSeat must match the seat the session was opened with; the table doesn't
  // change seats mid-session.
  const heroSeatBySession = new Map(found.map((r) => [r.id, r.heroSeat]));
  const mismatched = hands
    .filter((item) => item.hand.heroSeat !== heroSeatBySession.get(item.hand.sessionId))
    .map((item) => item.hand.id);
  if (mismatched.length > 0) {
    return sendError(res, 409, 'HERO_SEAT_MISMATCH', "heroSeat does not match the session's hero seat", { handIds: mismatched });
  }

  // One statement, so it is atomic. Conflicts on id or (session_id, hand_no) insert nothing,
  // and decisions and session totals only follow the hands this statement actually inserted.
  const [{ inserted }] = await sql`
    WITH ins AS (
      INSERT INTO poker_hands (id, session_id, hand_no, played_at, button_seat, hero_seat, hero_start_stack,
                               hero_actions, lineup, hole_cards, board, events, pot, hero_net, hero_allin_ev, showdown)
      SELECT x.id, x.session_id, x.hand_no, x.played_at, x.button_seat, x.hero_seat, x.hero_start_stack,
             x.hero_actions, x.lineup, x.hole_cards, x.board, x.events, x.pot, x.hero_net, x.hero_allin_ev, x.showdown
      FROM jsonb_to_recordset(${JSON.stringify(hands.map(handRow))}::jsonb)
        AS x(id uuid, session_id uuid, hand_no int, played_at timestamptz, button_seat int, hero_seat int,
             hero_start_stack int, hero_actions int, lineup jsonb, hole_cards jsonb, board text, events jsonb,
             pot int, hero_net int, hero_allin_ev numeric, showdown boolean)
      ON CONFLICT DO NOTHING
      RETURNING id, session_id, hero_net, hero_allin_ev, played_at
    ), d AS (
      INSERT INTO poker_decisions (hand_id, idx, street, position, spot, action, size, pot, to_call, equity,
                                   needed_equity, recommended, ev_loss, grade, confident, analysis_version)
      SELECT y.hand_id, y.idx, y.street, y.position, y.spot, y.action, y.size, y.pot, y.to_call, y.equity,
             y.needed_equity, y.recommended, y.ev_loss, y.grade, y.confident, y.analysis_version
      FROM jsonb_to_recordset(${JSON.stringify(hands.flatMap(decisionRows))}::jsonb)
        AS y(hand_id uuid, idx int, street text, position text, spot text, action text, size int, pot int,
             to_call int, equity real, needed_equity real, recommended jsonb, ev_loss real, grade text,
             confident boolean, analysis_version int)
      JOIN ins ON ins.id = y.hand_id
    ), totals AS (
      -- A hand saved after its session was closed moves ended_at forward; an open session stays NULL.
      UPDATE poker_sessions s
      SET hands = s.hands + t.n, net = s.net + t.net, allin_adj_net = s.allin_adj_net + t.adj,
          ended_at = CASE WHEN s.ended_at IS NULL THEN NULL ELSE GREATEST(s.ended_at, t.last_played_at) END
      FROM (
        SELECT session_id, count(*)::int AS n, sum(hero_net)::int AS net,
               sum(COALESCE(hero_allin_ev, hero_net)) AS adj, max(played_at) AS last_played_at
        FROM ins GROUP BY session_id
      ) t
      WHERE s.id = t.session_id
    )
    SELECT count(*)::int AS inserted FROM ins`;

  if (inserted < hands.length) {
    const conflicts = await findHandNoConflicts(sql, hands);
    if (conflicts.length > 0) {
      return sendError(res, 409, 'HAND_NO_CONFLICT', 'handNo is already used by another hand in this session', { handIds: conflicts });
    }
  }
  return res.status(200).json({ saved: true, inserted, duplicate: hands.length - inserted });
}

// Hands the insert skipped are true duplicates only if their id is stored. A hand whose id is
// absent but whose (session_id, hand_no) is taken collided with a different hand. This read
// runs only when some hand was skipped, as its own statement so its snapshot also sees rows a
// concurrent request committed while the insert ran (CTEs in the insert share one snapshot).
async function findHandNoConflicts(sql, hands) {
  const keys = hands.map(({ hand }) => ({ id: hand.id, session_id: hand.sessionId, hand_no: hand.handNo }));
  const rows = await sql`
    SELECT x.id FROM jsonb_to_recordset(${JSON.stringify(keys)}::jsonb) AS x(id uuid, session_id uuid, hand_no int)
    WHERE NOT EXISTS (SELECT 1 FROM poker_hands p WHERE p.id = x.id)
      AND EXISTS (SELECT 1 FROM poker_hands p WHERE p.session_id = x.session_id AND p.hand_no = x.hand_no)`;
  const conflicting = new Set(rows.map((r) => r.id));
  return keys.map((k) => k.id).filter((id) => conflicting.has(id));
}

async function readHand(sql, req, res) {
  const parsed = handIdQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'A valid hand id is required', parsed.error);
  const { id } = parsed.data;
  const [rows, decisions] = await Promise.all([
    sql`
      SELECT h.id, h.session_id AS "sessionId", h.hand_no AS "handNo", h.played_at AS "playedAt",
             h.button_seat AS "buttonSeat", h.hero_seat AS "heroSeat", h.lineup, h.events, h.pot,
             h.hero_net AS "heroNet", h.hero_allin_ev::float8 AS "heroAllinEv", h.showdown, h.hero_actions AS "heroActions",
             (SELECT p.id FROM poker_hands p WHERE p.session_id = h.session_id AND p.hand_no < h.hand_no
               ORDER BY p.hand_no DESC LIMIT 1) AS "prevHandId",
             (SELECT n.id FROM poker_hands n WHERE n.session_id = h.session_id AND n.hand_no > h.hand_no
               ORDER BY n.hand_no LIMIT 1) AS "nextHandId"
      FROM poker_hands h WHERE h.id = ${id}`,
    sql`
      SELECT idx, street, position, spot, action, size, pot, to_call AS "toCall", equity, needed_equity AS "neededEquity",
             recommended, ev_loss AS "evLoss", grade, confident, analysis_version AS "analysisVersion"
      FROM poker_decisions WHERE hand_id = ${id} ORDER BY idx`,
  ]);
  if (!rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Hand not found');
  return res.status(200).json({ hand: rows[0], decisions });
}

async function listUngraded(sql, req, res) {
  const parsed = ungradedHandsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'Invalid ungraded hands query', parsed.error);
  const { sessionId, belowVersion, afterHandNo, limit } = parsed.data;
  const rows = await sql`
    SELECT h.id, h.hand_no AS "handNo", h.hero_seat AS "heroSeat", h.lineup, h.events
    FROM poker_hands h
    WHERE h.session_id = ${sessionId} AND h.hand_no > ${afterHandNo} AND h.hero_actions > 0
      AND COALESCE((SELECT max(d.analysis_version) FROM poker_decisions d WHERE d.hand_id = h.id), 0) < ${belowVersion}
    ORDER BY h.hand_no
    LIMIT ${limit + 1}`;
  const hands = rows.slice(0, limit);
  const nextAfterHandNo = rows.length > limit ? hands[hands.length - 1].handNo : null;
  return res.status(200).json({ hands, nextAfterHandNo });
}

// Re-grade (Phase 5). Statement 1 locks the hands, so statement 2 (a new snapshot in READ COMMITTED) sees any
// concurrent re-grade: the version guard and the allin_adj_net delta are then race-free, and a replay is a no-op.
async function saveGrades(sql, req, res) {
  const parsed = handGradesBatch.safeParse(req.body);
  if (!parsed.success) return invalid(res, 'Invalid grades payload', parsed.error);
  const { grades } = parsed.data;
  const ids = grades.map((g) => g.handId);
  const stored = await sql`
    SELECT id, hero_seat AS "heroSeat", events FROM poker_hands
    WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${idList(ids)}::jsonb))`;
  const byId = new Map(stored.map((row) => [row.id, row]));

  const problems = [];
  grades.forEach((grade, i) => {
    const row = byId.get(grade.handId);
    if (!row) return;
    for (const { index, message } of decisionProblems(grade.decisions, row.events, row.heroSeat)) {
      problems.push({ path: ['grades', i, 'decisions', index, 'idx'], message });
    }
  });
  if (problems.length > 0) return sendError(res, 400, 'VALIDATION_ERROR', 'Decisions do not match the stored hands', { problems });

  const present = grades.filter((g) => byId.has(g.handId));
  const missing = ids.filter((id) => !byId.has(id));
  if (present.length === 0) return res.status(200).json({ updated: [], skipped: [], missing });

  const presentIds = present.map((g) => g.handId);
  const rows = present.map((g) => ({
    hand_id: g.handId,
    analysis_version: g.analysisVersion,
    hero_allin_ev: g.heroAllinEv,
    decisions: decisionRows({ hand: { id: g.handId }, decisions: g.decisions }),
  }));
  const [, updatedRows] = await sql.transaction([
    sql`
      SELECT id FROM poker_hands
      WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${idList(presentIds)}::jsonb))
      ORDER BY id FOR UPDATE`,
    sql`
      WITH input AS (
        -- hero_allin_ev is rounded to the same numeric(10,2) as poker_hands.hero_allin_ev right here,
        -- so target.new_ev below already matches what hand_ev stores; the session_adj delta is then
        -- exactly the sum of the per-hand changes, never off by the last-digit rounding an unbounded
        -- scale numeric column would let through.
        SELECT g.hand_id, g.analysis_version, g.hero_allin_ev, g.decisions
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS g(hand_id uuid, analysis_version int, hero_allin_ev numeric(10,2), decisions jsonb)
      ), target AS (
        SELECT h.id, h.session_id, h.hero_net, h.hero_allin_ev AS old_ev, i.hero_allin_ev AS new_ev, i.decisions
        FROM input i JOIN poker_hands h ON h.id = i.hand_id
        WHERE COALESCE((SELECT max(d.analysis_version) FROM poker_decisions d WHERE d.hand_id = h.id), 0) < i.analysis_version
      ), fresh AS (
        SELECT t.id AS hand_id, y.idx, y.street, y.position, y.spot, y.action, y.size, y.pot, y.to_call, y.equity,
               y.needed_equity, y.recommended, y.ev_loss, y.grade, y.confident, y.analysis_version
        FROM target t
        CROSS JOIN LATERAL jsonb_to_recordset(t.decisions)
          AS y(idx int, street text, position text, spot text, action text, size int, pot int, to_call int, equity real,
               needed_equity real, recommended jsonb, ev_loss real, grade text, confident boolean, analysis_version int)
      ), removed AS (
        DELETE FROM poker_decisions d USING target t
        WHERE d.hand_id = t.id AND NOT EXISTS (SELECT 1 FROM fresh f WHERE f.hand_id = d.hand_id AND f.idx = d.idx)
        RETURNING d.hand_id
      ), upserted AS (
        INSERT INTO poker_decisions (hand_id, idx, street, position, spot, action, size, pot, to_call, equity,
                                     needed_equity, recommended, ev_loss, grade, confident, analysis_version)
        SELECT hand_id, idx, street, position, spot, action, size, pot, to_call, equity,
               needed_equity, recommended, ev_loss, grade, confident, analysis_version
        FROM fresh
        ON CONFLICT (hand_id, idx) DO UPDATE SET
          street = EXCLUDED.street, position = EXCLUDED.position, spot = EXCLUDED.spot, action = EXCLUDED.action,
          size = EXCLUDED.size, pot = EXCLUDED.pot, to_call = EXCLUDED.to_call, equity = EXCLUDED.equity,
          needed_equity = EXCLUDED.needed_equity, recommended = EXCLUDED.recommended, ev_loss = EXCLUDED.ev_loss,
          grade = EXCLUDED.grade, confident = EXCLUDED.confident, analysis_version = EXCLUDED.analysis_version
        RETURNING hand_id
      ), hand_ev AS (
        UPDATE poker_hands h SET hero_allin_ev = t.new_ev FROM target t WHERE h.id = t.id RETURNING h.id
      ), session_adj AS (
        -- One batch can touch hands from more than one session; ORDER BY session_id below locks
        -- those sessions in id order so this UPDATE can't deadlock against another concurrent
        -- re-grade batch that locks the same two sessions in the opposite order. Unlikely in
        -- practice, since the UI always lists ungraded hands (and so builds a batch) for one
        -- session at a time, but the ORDER BY is free insurance.
        UPDATE poker_sessions s
        SET allin_adj_net = s.allin_adj_net + x.delta
        FROM (
          SELECT session_id, sum(COALESCE(new_ev, hero_net) - COALESCE(old_ev, hero_net)) AS delta
          FROM target GROUP BY session_id
          ORDER BY session_id
        ) x
        WHERE s.id = x.session_id
        RETURNING s.id
      )
      SELECT t.id FROM target t ORDER BY t.id`,
  ]);
  const updated = updatedRows.map((row) => row.id);
  const updatedSet = new Set(updated);
  return res.status(200).json({ updated, skipped: presentIds.filter((id) => !updatedSet.has(id)), missing });
}

export function createPokerHandsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET', 'POST', 'PATCH'], auth, getSql });
    if (!sql) return undefined;
    try {
      if (req.method === 'POST') return await save(sql, req, res);
      if (req.method === 'PATCH') return await saveGrades(sql, req, res);
      return req.query?.ungraded !== undefined ? await listUngraded(sql, req, res) : await readHand(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/hands failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerHandsHandler();

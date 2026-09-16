import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { handsBatch } from '../../_lib/pokerSchemas.js';
import { replayHandRecord } from '../../_lib/pokerReplay.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';

// POST /api/trainers/poker/hands  { hands: [{ hand, decisions?, heroAllinEv? }] }
// At most 50 hands and 40 decisions per hand. Amounts are integer units (1 unit = 0.5 BB).

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

export function createPokerHandsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['POST'], auth, getSql });
    if (!sql) return undefined;
    try {
      return await save(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/hands failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerHandsHandler();

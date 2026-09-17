import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';
import { accumulateProfile } from '../../../src/private/trainers/poker/bots/profileStats.js';

// GET /api/trainers/poker/profile — the hero's tendency profile (spec §6.4). It uses the same
// accumulateProfile the bots use (contracts §3.2), folded oldest first over the most recent
// hands that hold the latest PROFILE_DECISIONS hero decisions (hero act events; the hand
// that crosses the limit is included), capped at PROFILE_MAX_HANDS hands.
// Vercel bundles the ../../../src imports by tracing them; api/_lib/pokerBundle.test.js
// proves they load in plain Node.

export const PROFILE_DECISIONS = 2000;
export const PROFILE_MAX_HANDS = 2000;

export function createPokerProfileHandler({ getSql = defaultGetSql, auth = authConfig, accumulate = accumulateProfile } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET'], auth, getSql });
    if (!sql) return undefined;
    try {
      const rows = await sql`
        WITH recent AS (
          SELECT id, played_at,
                 sum(hero_actions) OVER (ORDER BY played_at DESC, id DESC ROWS UNBOUNDED PRECEDING) AS running
          FROM poker_hands
          ORDER BY played_at DESC, id DESC
          LIMIT ${PROFILE_MAX_HANDS}
        )
        SELECT h.hero_seat AS "heroSeat", h.events, h.hero_actions AS "heroActions"
        FROM recent r JOIN poker_hands h ON h.id = r.id
        WHERE r.running - h.hero_actions < ${PROFILE_DECISIONS}
        ORDER BY r.played_at, r.id`;
      const profile = rows.reduce((acc, r) => accumulate(acc, r.heroSeat, r.events), emptyProfile());
      const decisions = rows.reduce((sum, r) => sum + r.heroActions, 0);
      return res.status(200).json({ profile, hands: rows.length, decisions });
    } catch (err) {
      console.error('trainers/poker/profile failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerProfileHandler();

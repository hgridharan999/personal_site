-- db/migrations/003_poker_stats.sql
-- Leak tracker indexes (spec §7.4, Phase 6).
-- poker_decisions_hand_cover: leaks and trend join decisions per hand and read only these columns,
--   so the aggregates are index-only scans.
-- poker_decisions_spot_hand: GET stats?spot= groups one spot's decisions by hand, index-only.
--   It covers every use of the old single-column spot index, which is dropped.
CREATE INDEX IF NOT EXISTS poker_decisions_hand_cover ON poker_decisions (hand_id) INCLUDE (spot, action, ev_loss, grade, confident);
CREATE INDEX IF NOT EXISTS poker_decisions_spot_hand ON poker_decisions (spot, hand_id) INCLUDE (ev_loss, grade, confident);
DROP INDEX IF EXISTS poker_decisions_spot;

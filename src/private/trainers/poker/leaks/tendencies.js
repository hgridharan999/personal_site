// src/private/trainers/poker/leaks/tendencies.js
// Hero tendencies for the leak tracker (spec §7.4): Phase 3's accumulateProfile (the one stat definition,
// contracts §3.2) folded overall and into the hero's position for each hand, then paired with target
// ranges. Pure and plain-Node ESM, because api/trainers/poker/stats.js imports it.
import { applyEvent } from '../engine/handState.js';
import { emptyProfile, PROFILE_STATS } from '../bots/contract.js';
import { accumulateProfile } from '../bots/profileStats.js';
import { positionsOf } from '../bots/situation.js';
import { POSITIONS, TENDENCY_MIN_N, targetFor, flagFor } from '../data/targets.js';

/** The hero's position label in this hand, or null when the log has no start event or no such seat. */
export function heroPosition(events, heroSeat) {
  const start = Array.isArray(events) ? events[0] : null;
  if (!start || start.type !== 'start') return null;
  try {
    return positionsOf(applyEvent(null, start))[heroSeat] ?? null;
  } catch (err) {
    // Stored hands were replayed by POST hands, so a bad start event means a corrupt row.
    // Skip its position split rather than failing the whole stats request.
    console.warn('heroPosition: unreadable start event', err);
    return null;
  }
}

export function emptyTendencies() {
  return { overall: emptyProfile(), byPosition: {} };
}

/** Folds one completed hand in. Returns `acc` itself when accumulateProfile does not count the hand. */
export function accumulateTendencies(acc, heroSeat, events, accumulate = accumulateProfile) {
  const overall = accumulate(acc.overall, heroSeat, events);
  if (overall === acc.overall) return acc;
  const position = heroPosition(events, heroSeat);
  if (!position) return { overall, byPosition: acc.byPosition };
  const current = acc.byPosition[position] ?? emptyProfile();
  return { overall, byPosition: { ...acc.byPosition, [position]: accumulate(current, heroSeat, events) } };
}

const cell = ({ value, n }, target) => ({ value, n, target, flag: flagFor(value, n, target) });

/** The `tendencies` block of GET /api/trainers/poker/stats. */
export function shapeTendencies(acc) {
  const positions = POSITIONS.filter((position) => acc.byPosition[position]);
  return {
    hands: acc.overall.hands,
    minSample: TENDENCY_MIN_N,
    handsByPosition: Object.fromEntries(positions.map((p) => [p, acc.byPosition[p].hands])),
    stats: PROFILE_STATS.map((key) => ({
      key,
      overall: cell(acc.overall.stats[key], targetFor(key)),
      byPosition: Object.fromEntries(positions.map((p) => [p, cell(acc.byPosition[p].stats[key], targetFor(key, p))])),
    })),
  };
}

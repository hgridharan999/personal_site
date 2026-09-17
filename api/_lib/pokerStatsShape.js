// api/_lib/pokerStatsShape.js
// Shapes GET /api/trainers/poker/stats rows into the leak tracker payload (spec §7.4).
// Rows arrive in integer units (1 unit = 0.5 BB). Rates leave as BB; raw evLoss/heroNet stay in units.
import { spotLabel, focusCopy } from '../../src/private/trainers/poker/leaks/spotCopy.js';
import { SEVERITY_GRADES } from './pokerReview.js';

export const LEAK_MIN_DECISIONS = 15;
export const LEAK_EXAMPLES = 5;
export const LEAK_UNLOCK_HANDS = 200;

const toBb = (units) => units / 2;
/** BB per 100 of `count`, or null when there is nothing to divide by. */
const per100 = (units, count) => (count > 0 ? (toBb(units) / count) * 100 : null);

export function shapeLeaks(rows, gradedHands) {
  return rows
    // A spot needs the minimum decisions and > 0 confident EV lost: zero-loss spots
    // can't be a leak (or the focus, which is always leaks[0]).
    .filter((r) => r.decisions >= LEAK_MIN_DECISIONS && r.evLoss > 0)
    .map((r) => ({
      spot: r.spot,
      label: spotLabel(r.spot),
      decisions: r.decisions,
      hands: r.hands,
      mistakes: r.mistakes,
      evLoss: r.evLoss,
      bbPer100: per100(r.evLoss, gradedHands),
      bbPerDecision: toBb(r.evLoss) / r.decisions,
      costliestAction: r.costliestAction ?? null,
      examples: (r.examples ?? []).slice(0, LEAK_EXAMPLES),
    }))
    .sort((a, b) => b.evLoss - a.evLoss || a.spot.localeCompare(b.spot));
}

export function shapeTrend(rows) {
  return rows.map((r) => ({
    sessionId: r.id,
    startedAt: r.startedAt,
    hands: r.hands,
    netBbPer100: per100(r.net, r.hands),
    allinAdjBbPer100: per100(r.allinAdjNet, r.hands),
    decisions: r.decisions,
    evLostPer100Decisions: per100(r.evLoss, r.decisions),
  }));
}

/** The top leak with plain-language copy, or null. `leaks` must already be ranked by shapeLeaks. */
export function pickFocus(leaks) {
  const top = leaks[0];
  if (!top) return null;
  const { title, body } = focusCopy(top.spot, { costliestAction: top.costliestAction });
  return { spot: top.spot, label: top.label, title, body, bbPer100: top.bbPer100, decisions: top.decisions, examples: top.examples };
}

export function shapeSpotHands(rows) {
  return rows.map(({ severity, ...hand }) => ({ ...hand, worstGrade: SEVERITY_GRADES[severity] ?? 'good' }));
}

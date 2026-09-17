// Shapes the session review payload (spec §7.2). Hand rows carry the start event only (for the hero position)
// and every seat's hole cards only so the hero's can be picked out; neither leaves this module.
import { applyEvent } from '../../src/private/trainers/poker/engine/handState.js';
import { positionsOf } from '../../src/private/trainers/poker/bots/situation.js';
import { ANALYSIS_VERSION } from '../../src/private/trainers/poker/analysis/version.js';

export const REVIEW_PAGE_HANDS = 300;
export const RECENT_SESSIONS_LIMIT = 20;
export const COSTLIEST_LIMIT = 5;
export const SEVERITY_GRADES = Object.freeze(['good', 'inaccuracy', 'mistake', 'blunder']);

/** 'UTG'|'HJ'|'CO'|'BTN'|'SB'|'BB' for the hero from a stored start event, or null. */
export function heroPosition(start, heroSeat) {
  try {
    return positionsOf(applyEvent(null, start))[heroSeat] ?? null;
  } catch {
    return null;
  }
}

export function shapeReviewHand(row) {
  const hero = Array.isArray(row.holeCards) ? row.holeCards.find((h) => h.seat === row.heroSeat) : null;
  return {
    id: row.id,
    handNo: row.handNo,
    playedAt: row.playedAt,
    position: heroPosition(row.start, row.heroSeat),
    heroCards: hero ? hero.cards : null,
    board: row.board,
    pot: row.pot,
    heroNet: row.heroNet,
    heroAllinEv: row.heroAllinEv,
    showdown: row.showdown,
    decisions: row.decisions ?? 0,
    evLoss: row.evLoss ?? 0,
    worstGrade: row.severity === null || row.severity === undefined ? null : SEVERITY_GRADES[row.severity],
    confident: row.confident ?? null,
    needsGrading: row.heroActions > 0 && (row.version ?? 0) < ANALYSIS_VERSION,
  };
}

export function shapeSummary(session, row = {}) {
  const r = row ?? {};
  return {
    hands: session.hands,
    net: session.net,
    allinAdjNet: session.allinAdjNet,
    decisions: r.decisions ?? 0,
    evLoss: r.evLoss ?? 0,
    gradedHands: r.gradedHands ?? 0,
    ungradedHands: r.ungradedHands ?? 0,
    grades: { good: r.good ?? 0, inaccuracy: r.inaccuracy ?? 0, mistake: r.mistake ?? 0, blunder: r.blunder ?? 0 },
    debatable: r.debatable ?? 0,
  };
}

/** Personas per seat in order of first appearance; the session lineup when no hand is stored yet. */
export function shapeOpponents(rows, sessionLineup) {
  const source = rows.length > 0 ? rows : (sessionLineup ?? []);
  const bySeat = new Map();
  for (const { seat, personaId } of source) {
    if (!bySeat.has(seat)) bySeat.set(seat, []);
    const list = bySeat.get(seat);
    if (!list.includes(personaId)) list.push(personaId);
  }
  return [...bySeat].sort(([a], [b]) => a - b).map(([seat, personaIds]) => ({ seat, personaIds }));
}

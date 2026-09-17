// Pure display data for the session review (spec §7.2) and the lobby's recent sessions (spec §8.2).
import { formatBb, formatNetBb, cardText } from '../../lib/format.js';
import { parseCards } from '../../engine/cards.js';
import { getPersona } from '../../bots/personas.js';
import { formatDay } from '../../../core/format.js';
import { spotLabel } from '../../analysis/spots.js';
import { optionKey } from '../../analysis/options.js';
import { optionLabel } from '../../analysis/explain.js';

export const BIG_POT_UNITS = 60; // 30 BB
export const POSITIONS = Object.freeze(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
export const GRADE_LABELS = Object.freeze({ good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' });
export const DEFAULT_FILTERS = Object.freeze({ mistakesOnly: false, bigPots: false, showdowns: false, position: 'all' });

export const sessionHref = (id) => `/me/poker/session/${encodeURIComponent(id)}`;
export const handHref = (id, idx = null) => `/me/poker/hand/${encodeURIComponent(id)}${idx === null || idx === undefined ? '' : `?d=${idx}`}`;
export const bbText = (units) => `${formatBb(units)} BB`;
export const netText = (units) => `${formatNetBb(units)} BB`;
export const cardsText = (text) => (text ? parseCards(text).map(cardText).join(' ') : '—');

/** BB lost per 100 graded decisions, confident or not (contracts §4.1, matches the Phase 6 trend). */
export const evLostPer100Decisions = (evLoss, decisions) => (decisions > 0 ? (evLoss / 2 / decisions) * 100 : null);

export function gradeText(grade, confident) {
  if (!grade) return 'Not graded';
  return confident === false ? `${GRADE_LABELS[grade]} (debatable)` : GRADE_LABELS[grade];
}

export function summaryView(summary) {
  const rate = evLostPer100Decisions(summary.evLoss, summary.decisions);
  return {
    tiles: [
      { key: 'hands', label: 'Hands', value: String(summary.hands) },
      { key: 'net', label: 'Net', value: netText(summary.net) },
      { key: 'allinAdj', label: 'All-in adjusted', value: netText(summary.allinAdjNet) },
      { key: 'evLost', label: 'EV lost / 100 decisions', value: rate === null ? '—' : `${rate.toFixed(1)} BB` },
    ],
    grades: Object.keys(GRADE_LABELS).map((grade) => ({ grade, label: GRADE_LABELS[grade], count: summary.grades[grade] })),
    decisions: summary.decisions,
    debatable: summary.debatable,
    ungradedHands: summary.ungradedHands,
  };
}

export function costliestView(costliest) {
  return costliest.map((d) => ({
    key: `${d.handId}:${d.idx}`,
    href: handHref(d.handId, d.idx),
    title: `Hand ${d.handNo} · ${spotLabel(d.spot)}`,
    actionText: `You: ${optionLabel(optionKey(d.action, d.size))} · Best: ${optionLabel(optionKey(d.recommended.action, d.recommended.size))}`,
    lossText: bbText(d.evLoss),
    gradeText: gradeText(d.grade, d.confident),
  }));
}

export function matchesFilters(hand, filters) {
  if (filters.mistakesOnly && hand.worstGrade !== 'mistake' && hand.worstGrade !== 'blunder') return false;
  if (filters.bigPots && !(hand.pot > BIG_POT_UNITS)) return false;
  if (filters.showdowns && !hand.showdown) return false;
  if (filters.position !== 'all' && hand.position !== filters.position) return false;
  return true;
}

export function positionsIn(hands) {
  const present = new Set(hands.map((h) => h.position));
  return POSITIONS.filter((p) => present.has(p));
}

function gradeCell(hand) {
  if (hand.needsGrading) return 'Grading pending';
  if (hand.decisions === 0) return 'No decisions';
  return gradeText(hand.worstGrade, hand.confident);
}

export function handRowView(hand) {
  return {
    key: hand.id,
    href: handHref(hand.id),
    handNo: hand.handNo,
    position: hand.position ?? '—',
    cards: cardsText(hand.heroCards),
    board: cardsText(hand.board),
    pot: bbText(hand.pot),
    net: netText(hand.heroNet),
    grade: gradeCell(hand),
    loss: hand.decisions > 0 ? bbText(hand.evLoss) : '—',
    showdown: hand.showdown,
  };
}

function personaEntry(personaId) {
  try {
    const p = getPersona(personaId);
    return { personaId, name: p.name, tag: p.tag, style: p.style };
  } catch {
    return { personaId, name: personaId, tag: '???', style: 'unknown style' };
  }
}

export const opponentsView = (opponents) => opponents.map(({ seat, personaIds }) => ({ seat, entries: personaIds.map(personaEntry) }));

export const recentSessionView = (s) => ({
  key: s.id, href: sessionHref(s.id), when: formatDay(s.startedAt), detail: `${s.hands} hands · ${netText(s.net)}`, open: s.endedAt === null,
});

/** Appends a later review page: newest summary and cursor, all hands so far. */
export const mergePages = (acc, page) => ({ ...page, hands: [...acc.hands, ...page.hands] });

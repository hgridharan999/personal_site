// Pure view models for the Stats tab (spec §7.4). Each panel is 'locked' (needs reviewed sessions),
// 'empty' (not enough data yet) or 'ready', with every display string computed here so the
// components only render. Input is the GET /api/trainers/poker/stats body.
import { POSITIONS } from '../../data/targets.js';
import { formatNetBb } from '../../lib/format.js';
import { formatDay } from '../../../core/format.js';
import { handHref, GRADE_LABELS as GRADE_TEXT } from '../review/reviewView.js';

export { handHref, GRADE_TEXT };

export const UNLOCK_MESSAGE = 'Play and review sessions to unlock';
export const OVERALL = 'overall';

export const STAT_LABELS = {
  vpip: 'VPIP',
  pfr: 'PFR',
  threeBet: '3-bet',
  foldTo3Bet: 'Fold to 3-bet',
  cbetFlop: 'C-bet flop',
  cbetTurn: 'C-bet turn',
  foldToCbetFlop: 'Fold to flop c-bet',
  foldToCbetTurn: 'Fold to turn c-bet',
  checkRaise: 'Check-raise',
  wtsd: 'Went to showdown',
  wsd: 'Won at showdown',
  aggFreq: 'Aggression',
  foldToRiverBet: 'Fold to river bet',
  riverBetFreq: 'River bet',
};

export const FLAG_TEXT = { below: 'Below range', in: 'In range', above: 'Above range' };
export const FLAG_ICON = { below: '▼', in: '●', above: '▲' };

const MINUS = '−';
const pct = (v) => `${Math.round(v * 100)}%`;

export const formatPct = (v) => (v === null || v === undefined ? '—' : pct(v));
export const formatRange = (target) => (target ? `${Math.round(target[0] * 100)}–${pct(target[1])}` : '—');
export const formatLossBb = (units) => `${(units / 2).toFixed(1)} BB`;

/** Signed BB with one decimal: "+8.0", "−12.5", "0.0", or "—" for null. */
export function formatRate(bb) {
  if (bb === null || bb === undefined) return '—';
  const text = Math.abs(bb).toFixed(1);
  if (text === '0.0') return text;
  return bb > 0 ? `+${text}` : `${MINUS}${text}`;
}

export const spotHref = (spot) => `/me/poker?tab=stats&spot=${encodeURIComponent(spot)}`;

const exampleLinks = (ids) => ids.map((id, i) => ({ id, label: `Hand ${i + 1}`, href: handHref(id) }));

function statusText(c, minSample) {
  if (c.flag) return `${FLAG_ICON[c.flag]} ${FLAG_TEXT[c.flag]}`;
  if (c.n === 0) return 'No spots yet';
  return `Need ${minSample} spots`;
}

export function tendenciesView(data, position = OVERALL) {
  const t = data.tendencies;
  if (t.hands === 0) return { state: 'empty', message: 'No saved hands yet. Play a session to see your tendencies.' };
  const positions = [OVERALL, ...POSITIONS.filter((p) => (t.handsByPosition[p] ?? 0) > 0)];
  const selected = positions.includes(position) ? position : OVERALL;
  const rows = t.stats.map((s) => {
    const c = selected === OVERALL ? s.overall : s.byPosition[selected];
    return {
      key: s.key,
      label: STAT_LABELS[s.key] ?? s.key,
      value: c.value,
      n: c.n,
      target: c.target,
      flag: c.flag,
      valueText: formatPct(c.value),
      rangeText: formatRange(c.target),
      statusText: statusText(c, t.minSample),
      lowSample: c.n < t.minSample,
    };
  });
  const hands = selected === OVERALL ? t.hands : t.handsByPosition[selected];
  return { state: 'ready', positions, position: selected, hands, minSample: t.minSample, rows };
}

/** The locked message for leaks and focus, or null once they can show. */
export function leaksLock(summary) {
  if (summary.decisions === 0) return `${UNLOCK_MESSAGE} leaks.`;
  if (summary.gradedHands < summary.unlockHands) {
    return `Play about ${summary.unlockHands} hands to unlock leaks (${summary.gradedHands} reviewed so far).`;
  }
  return null;
}

export function leaksView(data) {
  const locked = leaksLock(data.summary);
  if (locked) return { state: 'locked', message: locked };
  if (data.leaks.length === 0) {
    return { state: 'empty', message: `No spot has ${data.summary.minSpotDecisions} confident decisions yet. Keep playing and reviewing.` };
  }
  return {
    state: 'ready',
    items: data.leaks.map((l) => ({
      key: l.spot,
      label: l.label,
      value: l.bbPer100,
      display: `${l.bbPer100.toFixed(1)} BB/100`,
      hint: `${l.decisions} decisions · ${l.mistakes} mistakes or blunders`,
      href: spotHref(l.spot),
      decisions: l.decisions,
      mistakes: l.mistakes,
      perDecisionText: `${l.bbPerDecision.toFixed(2)} BB`,
      examples: exampleLinks(l.examples),
    })),
  };
}

const sessionTitle = (s, i, text) => `Session ${i + 1} · ${formatDay(s.startedAt)}: ${text}`;
const evLostText = (v) => (v === null ? '—' : v.toFixed(1));

export function trendView(data) {
  if (data.summary.decisions === 0 || data.trend.length === 0) {
    return { state: 'locked', message: `${UNLOCK_MESSAGE} your trend.` };
  }
  const { trend } = data;
  return {
    state: 'ready',
    sessions: trend.length,
    net: trend.map((s, i) => ({ x: i + 1, y: s.netBbPer100, title: sessionTitle(s, i, `${formatRate(s.netBbPer100)} BB/100`) })),
    allinAdj: trend.map((s, i) => ({ x: i + 1, y: s.allinAdjBbPer100 })),
    evLost: trend.map((s, i) => {
      const v = s.evLostPer100Decisions;
      const text = v === null ? 'not reviewed' : `${v.toFixed(1)} BB per 100 decisions`;
      return { x: i + 1, y: v, title: sessionTitle(s, i, text) };
    }),
    hasEvLost: trend.some((s) => s.evLostPer100Decisions !== null),
    rows: trend.map((s, i) => ({
      key: s.sessionId,
      index: i + 1,
      day: formatDay(s.startedAt),
      hands: s.hands,
      netText: formatRate(s.netBbPer100),
      allinAdjText: formatRate(s.allinAdjBbPer100),
      evLostText: evLostText(s.evLostPer100Decisions),
    })),
  };
}

export function focusView(data) {
  const locked = leaksLock(data.summary);
  if (locked) return { state: 'locked', message: locked };
  const f = data.focus;
  if (!f) return { state: 'empty', message: 'No leak stands out yet. Keep playing and reviewing.' };
  return {
    state: 'ready',
    spot: f.spot,
    label: f.label,
    title: f.title,
    body: f.body,
    rateText: `${f.bbPer100.toFixed(1)} BB/100`,
    decisions: f.decisions,
    href: spotHref(f.spot),
    examples: exampleLinks(f.examples),
  };
}

export function spotHandsView(data) {
  const base = { spot: data.spot, label: data.label };
  if (data.hands.length === 0) return { state: 'empty', ...base, message: 'No hands in this spot yet.' };
  return {
    state: 'ready',
    ...base,
    rows: data.hands.map((h) => {
      const grade = GRADE_TEXT[h.worstGrade] ?? h.worstGrade;
      return {
        key: h.handId,
        href: handHref(h.handId),
        day: formatDay(h.playedAt),
        handNo: h.handNo,
        decisions: h.decisions,
        evLossText: formatLossBb(h.evLoss),
        gradeText: h.confident ? grade : `${grade} (debatable)`,
        netText: `${formatNetBb(h.heroNet)} BB`,
      };
    }),
  };
}

/** SVG geometry for a tendency meter: the target band and a marker `mark` wide, clamped inside `width`. */
export function meterGeometry(value, target, width, mark = 4) {
  const x = (v) => Math.min(width, Math.max(0, v * width));
  const band = target ? { x: x(target[0]), width: x(target[1]) - x(target[0]) } : null;
  const marker = value === null || value === undefined
    ? null
    : { x: Math.min(width - mark, Math.max(0, x(value) - mark / 2)) };
  return { band, marker };
}

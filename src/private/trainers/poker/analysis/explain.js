// src/private/trainers/poker/analysis/explain.js
// Template explanations with real numbers, keyed by spot family and error type (spec §7.1). Rendered from the
// stored DecisionRecord at display time, so wording can change without re-grading.
import { formatBb } from '../lib/format.js';
import { parseSpot } from './spots.js';
import { optionKey, parseOptionKey } from './options.js';

export const SPOT_FAMILIES = Object.freeze([
  'open', 'vs_limp', 'vs_open', 'squeeze', 'vs_3bet', 'vs_4bet', 'cbet', 'no_bet', 'facing_bet', 'facing_raise', 'other',
]);
export const ERROR_TYPES = Object.freeze(['chart', 'best', 'overfold', 'loose_call', 'too_passive', 'too_aggressive', 'sizing']);

const pct = (x) => `${Math.round(x * 100)}%`;
const bb = (units) => `${formatBb(units)} BB`;
const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const aggressive = (action) => action === 'bet' || action === 'raise';

/** Signed EV in BB with a real minus sign; tiny negatives read as 0.0. */
export function formatEv(units) {
  const text = formatBb(Math.abs(units));
  return units < 0 && text !== '0.0' ? `−${text} BB` : `${text} BB`;
}

export function spotFamily(spot) {
  const parsed = parseSpot(spot);
  return parsed && SPOT_FAMILIES.includes(parsed.situation) ? parsed.situation : 'other';
}

export function optionLabel(key) {
  const { action, size } = parseOptionKey(key);
  if (action === 'bet') return `Bet ${bb(size)}`;
  if (action === 'raise') return `Raise to ${bb(size)}`;
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** @returns {'chart'|'best'|'overfold'|'loose_call'|'too_passive'|'too_aggressive'|'sizing'} */
export function errorType(d) {
  const best = d.recommended;
  if (d.street === 'preflop' && Object.keys(best.evByOption).length === 0) return 'chart';
  if (d.evLoss === 0 || (d.action === best.action && (d.size ?? null) === (best.size ?? null))) return 'best';
  if (d.action === 'fold') return 'overfold';
  if (aggressive(d.action) && aggressive(best.action)) return 'sizing';
  if (aggressive(d.action)) return 'too_aggressive';
  if (d.action === 'call' && best.action === 'fold') return 'loose_call';
  if (aggressive(best.action)) return 'too_passive';
  return 'too_aggressive';
}

// Spot context is neutral wording, not phrased from one side of the action: pf.vs_3bet (spots.js) is also
// worn by a cold caller facing a raise-plus-3bet who never raised themself, so "your raise was 3-bet" would
// be wrong for them. See task-8-report.md for the deviation from the brief's wording.
const CONTEXT = {
  open: 'The action folded to you preflop.',
  vs_limp: 'Someone limped in front of you.',
  vs_open: 'You faced an open raise.',
  squeeze: 'You faced a raise and at least one call.',
  vs_3bet: 'You faced a 3-bet.',
  vs_4bet: 'You faced a 4-bet.',
  cbet: 'You made the last raise on the previous street.',
  no_bet: 'Nobody had bet yet.',
  facing_bet: 'You faced a bet.',
  facing_raise: 'You faced a raise.',
  other: '',
};

function leadSentence(d) {
  switch (d.action) {
    case 'fold':
      return d.toCall > 0 ? `You folded to ${bb(d.toCall)} with ${bb(d.pot)} in the pot.` : 'You folded.';
    case 'check':
      return `You checked with ${bb(d.pot)} in the pot.`;
    case 'call':
      return `You called ${bb(d.toCall)} into ${bb(d.pot)}.`;
    case 'bet':
      return `You bet ${bb(d.size)} into ${bb(d.pot)}.`;
    default:
      return `You raised to ${bb(d.size)} with ${bb(d.pot)} in the pot.`;
  }
}

function equitySentence(d) {
  if (d.equity === null || d.equity === undefined) return '';
  if (d.neededEquity !== null && d.neededEquity !== undefined) {
    return `You needed ${pct(d.neededEquity)} equity and had about ${pct(d.equity)} against their likely range.`;
  }
  return `Your equity against their likely range was about ${pct(d.equity)}.`;
}

const VERDICT = {
  chart: (d, x) => (x.chart
    ? `The preflop chart plays your hand this way ${pct(x.chart.chosenFreq)} of the time, so it is a sound choice.`
    : 'This matches the preflop chart.'),
  best: (d, x) => (x.chosenEv === null ? 'That was the best option.' : `That was the best option, worth about ${formatEv(x.chosenEv)}.`),
  overfold: (d, x) => `${x.bestLabel} was worth about ${formatEv(x.bestEv)}, so folding cost about ${bb(d.evLoss)}.`,
  loose_call: (d) => `Folding loses nothing; calling cost about ${bb(d.evLoss)}.`,
  too_passive: (d, x) => `${x.bestLabel} was worth about ${formatEv(x.bestEv)} against ${formatEv(x.chosenEv)} for ${lower(x.chosenLabel)}, about ${bb(d.evLoss)} more.`,
  too_aggressive: (d, x) => `${x.bestLabel} was worth about ${formatEv(x.bestEv)}; ${lower(x.chosenLabel)} was worth ${formatEv(x.chosenEv)} and cost about ${bb(d.evLoss)}.`,
  sizing: (d, x) => `${x.bestLabel} was worth about ${bb(d.evLoss)} more than ${lower(x.chosenLabel)}.`,
};

// Spot-specific wording where the family changes the lesson.
const OVERRIDES = {
  'vs_3bet.overfold': (d, x) => `Folding to 3-bets too often is easy to exploit: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)}, so folding cost about ${bb(d.evLoss)}.`,
  'open.too_passive': (d, x) => `Open with a raise: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)} against ${formatEv(x.chosenEv)} for ${lower(x.chosenLabel)}, about ${bb(d.evLoss)} more.`,
  'cbet.too_passive': (d, x) => `As the last raiser you can often keep betting: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)} against ${formatEv(x.chosenEv)} for ${lower(x.chosenLabel)}, about ${bb(d.evLoss)} more.`,
  'cbet.too_aggressive': (d, x) => `Not every board is worth a continuation bet: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)}, and ${lower(x.chosenLabel)} cost about ${bb(d.evLoss)}.`,
  'facing_bet.overfold': (d, x) => `Folding too often to bets is easy to exploit: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)}, so folding cost about ${bb(d.evLoss)}.`,
  'facing_raise.loose_call': (d) => `Raises are usually strong. Folding loses nothing; calling cost about ${bb(d.evLoss)}.`,
};

/**
 * @param {object} d DecisionRecord
 * @param {{ chart?:{ chosenFreq:number }|null }} [extras] chartCheck output for chart-graded preflop decisions
 */
export function explainDecision(d, { chart = null } = {}) {
  const family = spotFamily(d.spot);
  const type = errorType(d);
  const evByOption = d.recommended.evByOption;
  const chosenKey = optionKey(d.action, d.size);
  const bestKey = optionKey(d.recommended.action, d.recommended.size);
  const x = {
    chart,
    chosenEv: Object.hasOwn(evByOption, chosenKey) ? evByOption[chosenKey] : null,
    bestEv: Object.hasOwn(evByOption, bestKey) ? evByOption[bestKey] : 0,
    chosenLabel: optionLabel(chosenKey),
    bestLabel: optionLabel(bestKey),
  };
  const verdict = (OVERRIDES[`${family}.${type}`] ?? VERDICT[type])(d, x);
  const debatable = d.confident ? '' : 'The simulation could not clearly separate the top options, so treat this grade as debatable.';
  return [CONTEXT[family], leadSentence(d), equitySentence(d), verdict, debatable].filter(Boolean).join(' ');
}

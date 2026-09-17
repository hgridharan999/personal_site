// src/private/trainers/poker/analysis/preflopCheck.js
// Spec §7.1 preflop: an action the chart takes at least 20% of the time is good. The charts carry no EV
// table (Phase 3), so anything else is graded by rollouts. Uses the unscaled chart: the hero is graded
// against sound play, not against a persona's width.
import { classOf } from '../bots/handClass.js';
import { hasChart, chartFreqs } from '../bots/charts.js';
import { chartKeyFor } from '../bots/situation.js';
import { raiseSize } from '../bots/preflop.js';
import { legalize } from '../bots/legalize.js';
import { resolveDials } from '../bots/dials.js';

export const CHART_GOOD_FREQ = 0.2;
const DEFAULT_DIALS = resolveDials({});

/** Phase 3's standard raise-to for this preflop spot, or null when raising is not legal. */
export function standardRaiseTo(point) {
  if (!point.preflop || !point.legal.canRaise) return null;
  const size = raiseSize(point.preflop, point.view, DEFAULT_DIALS, point.view.bb);
  return Number.isFinite(size) ? size : point.legal.maxRaiseTo;
}

/** Chart frequencies for the hero's hand at a preflop decision point, or null when not applicable. */
export function chartCheck(point) {
  if (!point.preflop) return null;
  let key;
  try {
    key = chartKeyFor(point.preflop, hasChart);
  } catch {
    return null;
  }
  const { legal, view, event } = point;
  const hero = view.players.find((p) => p.seat === event.seat);
  const { raise, call } = chartFreqs(key, classOf(hero.hole[0], hero.hole[1]));
  const fold = Math.max(0, 1 - raise - call);
  const freqOf = {
    bet: raise,
    raise,
    call: legal.canCheck ? 0 : call,
    check: legal.canCheck ? 1 - raise : 0,
    fold: legal.canCheck ? 0 : fold,
  };
  const chosenFreq = freqOf[event.action] ?? 0;
  let intended;
  if (raise >= call && raise >= fold) intended = { action: 'raise', amount: standardRaiseTo(point) ?? legal.minRaiseTo };
  else intended = { action: call >= fold ? 'call' : 'fold' };
  const choice = legalize(intended, legal);
  return {
    key,
    freqs: { raise, call, fold },
    chosenFreq,
    ok: chosenFreq >= CHART_GOOD_FREQ,
    recommended: { action: choice.action, size: choice.amount ?? null },
  };
}

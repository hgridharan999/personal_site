import { describe, it, expect } from 'vitest';
import { formatDay } from '../../../core/format.js';
import {
  UNLOCK_MESSAGE, formatPct, formatRange, formatRate, formatLossBb, spotHref, handHref,
  tendenciesView, leaksLock, leaksView, trendView, focusView, spotHandsView, meterGeometry,
} from './statsView.js';

const summary = (o = {}) => ({
  hands: 400, sessions: 2, gradedHands: 300, decisions: 900, confidentDecisions: 800, unlockHands: 200, minSpotDecisions: 15, ...o,
});
const cell = (value, n, target, flag) => ({ value, n, target, flag });
const TREND = [
  { sessionId: 's1', startedAt: '2026-09-10T18:00:00.000Z', hands: 150, netBbPer100: -12.5, allinAdjBbPer100: -4, decisions: 0, evLostPer100Decisions: null },
  { sessionId: 's2', startedAt: '2026-09-12T18:00:00.000Z', hands: 250, netBbPer100: 8, allinAdjBbPer100: 3.5, decisions: 600, evLostPer100Decisions: 41.5 },
];
const LEAK = {
  spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', decisions: 20, hands: 18, mistakes: 4,
  evLoss: 60, bbPer100: 10, bbPerDecision: 1.5, costliestAction: 'call', examples: ['h1', 'h2'],
};

function payload(o = {}) {
  return {
    summary: summary(o.summary),
    tendencies: o.tendencies ?? {
      hands: 400,
      minSample: 30,
      handsByPosition: { BTN: 70, BB: 66 },
      stats: [
        { key: 'vpip', overall: cell(0.31, 380, [0.22, 0.28], 'above'), byPosition: { BTN: cell(0.45, 70, [0.38, 0.5], 'in'), BB: cell(0.5, 12, [0.3, 0.42], null) } },
        { key: 'foldTo3Bet', overall: cell(null, 0, [0.45, 0.6], null), byPosition: { BTN: cell(null, 0, [0.45, 0.6], null), BB: cell(null, 0, [0.45, 0.6], null) } },
      ],
    },
    leaks: o.leaks ?? [LEAK],
    trend: o.trend ?? TREND,
    focus: o.focus === undefined
      ? { spot: LEAK.spot, label: LEAK.label, title: 'Facing a bet', body: 'Body.', bbPer100: 10, decisions: 20, examples: ['h1', 'h2'] }
      : o.focus,
  };
}

describe('formatting', () => {
  it('formats percentages, ranges, signed rates and losses', () => {
    expect(formatPct(0.314)).toBe('31%');
    expect(formatPct(null)).toBe('—');
    expect(formatRange([0.22, 0.28])).toBe('22–28%');
    expect(formatRange(null)).toBe('—');
    expect(formatRate(8)).toBe('+8.0');
    expect(formatRate(-12.5)).toBe('−12.5');
    expect(formatRate(-0.04)).toBe('0.0');
    expect(formatRate(null)).toBe('—');
    expect(formatLossBb(5)).toBe('2.5 BB');
    expect(spotHref('river.facing_bet.oop')).toBe('/me/poker?tab=stats&spot=river.facing_bet.oop');
    expect(handHref('h 1')).toBe('/me/poker/hand/h%201');
  });
});

describe('tendenciesView', () => {
  it('is empty until a hand is saved', () => {
    const view = tendenciesView(payload({ tendencies: { hands: 0, minSample: 30, handsByPosition: {}, stats: [] } }));
    expect(view).toEqual({ state: 'empty', message: 'No saved hands yet. Play a session to see your tendencies.' });
  });

  it('shows overall rows with flags and sample hints', () => {
    const view = tendenciesView(payload());
    expect(view).toMatchObject({ state: 'ready', positions: ['overall', 'BTN', 'BB'], position: 'overall', hands: 400, minSample: 30 });
    expect(view.rows[0]).toEqual({
      key: 'vpip', label: 'VPIP', value: 0.31, n: 380, target: [0.22, 0.28], flag: 'above',
      valueText: '31%', rangeText: '22–28%', statusText: '▲ Above range', lowSample: false,
    });
    expect(view.rows[1]).toMatchObject({ label: 'Fold to 3-bet', valueText: '—', statusText: 'No spots yet', lowSample: true });
  });

  it('switches to a position and falls back to overall for an unknown one', () => {
    const bb = tendenciesView(payload(), 'BB');
    expect(bb.hands).toBe(66);
    expect(bb.rows[0]).toMatchObject({ valueText: '50%', rangeText: '30–42%', statusText: 'Need 30 spots', lowSample: true });
    expect(tendenciesView(payload(), 'BTN').rows[0].statusText).toBe('● In range');
    expect(tendenciesView(payload(), 'UTG').position).toBe('overall');
  });
});

describe('leaksView and leaksLock', () => {
  it('locks before any review, then until enough graded hands', () => {
    expect(leaksLock(summary({ decisions: 0, gradedHands: 0 }))).toBe(`${UNLOCK_MESSAGE} leaks.`);
    expect(leaksView(payload({ summary: { gradedHands: 120 } }))).toEqual({
      state: 'locked', message: 'Play about 200 hands to unlock leaks (120 reviewed so far).',
    });
    expect(leaksLock(summary())).toBeNull();
  });

  it('is empty when no spot has enough confident decisions', () => {
    expect(leaksView(payload({ leaks: [] }))).toEqual({
      state: 'empty', message: 'No spot has 15 confident decisions yet. Keep playing and reviewing.',
    });
  });

  it('builds bar list items with links', () => {
    expect(leaksView(payload())).toEqual({
      state: 'ready',
      items: [{
        key: 'river.facing_bet.oop', label: LEAK.label, value: 10, display: '10.0 BB/100',
        hint: '20 decisions · 4 mistakes or blunders', href: '/me/poker?tab=stats&spot=river.facing_bet.oop',
        decisions: 20, mistakes: 4, perDecisionText: '1.50 BB',
        examples: [
          { id: 'h1', label: 'Hand 1', href: '/me/poker/hand/h1' },
          { id: 'h2', label: 'Hand 2', href: '/me/poker/hand/h2' },
        ],
      }],
    });
  });
});

describe('trendView', () => {
  it('locks before any review or without sessions', () => {
    const locked = { state: 'locked', message: `${UNLOCK_MESSAGE} your trend.` };
    expect(trendView(payload({ summary: { decisions: 0 } }))).toEqual(locked);
    expect(trendView(payload({ trend: [] }))).toEqual(locked);
  });

  it('builds both charts and a table', () => {
    const view = trendView(payload());
    expect(view.state).toBe('ready');
    expect(view.sessions).toBe(2);
    expect(view.net).toEqual([
      { x: 1, y: -12.5, title: `Session 1 · ${formatDay(TREND[0].startedAt)}: −12.5 BB/100` },
      { x: 2, y: 8, title: `Session 2 · ${formatDay(TREND[1].startedAt)}: +8.0 BB/100` },
    ]);
    expect(view.allinAdj).toEqual([{ x: 1, y: -4 }, { x: 2, y: 3.5 }]);
    expect(view.evLost).toEqual([
      { x: 1, y: null, title: `Session 1 · ${formatDay(TREND[0].startedAt)}: not reviewed` },
      { x: 2, y: 41.5, title: `Session 2 · ${formatDay(TREND[1].startedAt)}: 41.5 BB per 100 decisions` },
    ]);
    expect(view.hasEvLost).toBe(true);
    expect(view.rows[1]).toEqual({
      key: 's2', index: 2, day: formatDay(TREND[1].startedAt), hands: 250, netText: '+8.0', allinAdjText: '+3.5', evLostText: '41.5',
    });
    expect(view.rows[0].evLostText).toBe('—');
  });
});

describe('focusView', () => {
  it('follows the leak lock, then shows the top leak', () => {
    expect(focusView(payload({ summary: { decisions: 0 } }))).toEqual({ state: 'locked', message: `${UNLOCK_MESSAGE} leaks.` });
    expect(focusView(payload({ focus: null }))).toEqual({ state: 'empty', message: 'No leak stands out yet. Keep playing and reviewing.' });
    expect(focusView(payload())).toEqual({
      state: 'ready', spot: LEAK.spot, label: LEAK.label, title: 'Facing a bet', body: 'Body.', rateText: '10.0 BB/100', decisions: 20,
      href: '/me/poker?tab=stats&spot=river.facing_bet.oop',
      examples: [
        { id: 'h1', label: 'Hand 1', href: '/me/poker/hand/h1' },
        { id: 'h2', label: 'Hand 2', href: '/me/poker/hand/h2' },
      ],
    });
  });
});

describe('spotHandsView', () => {
  it('lists hands with grades, marking debatable ones', () => {
    const hand = { handId: 'h9', sessionId: 's2', handNo: 14, playedAt: '2026-09-12T18:30:00.000Z', heroNet: -13, decisions: 1, evLoss: 5, worstGrade: 'mistake', confident: false };
    expect(spotHandsView({ spot: 'pf.open', label: 'Preflop · first in', hands: [] })).toEqual({
      state: 'empty', spot: 'pf.open', label: 'Preflop · first in', message: 'No hands in this spot yet.',
    });
    expect(spotHandsView({ spot: 'pf.open', label: 'Preflop · first in', hands: [hand, { ...hand, handId: 'h8', confident: true, worstGrade: 'good', heroNet: 4 }] })).toEqual({
      state: 'ready', spot: 'pf.open', label: 'Preflop · first in',
      rows: [
        { key: 'h9', href: '/me/poker/hand/h9', day: formatDay(hand.playedAt), handNo: 14, decisions: 1, evLossText: '2.5 BB', gradeText: 'Mistake (debatable)', netText: '−6.5 BB' },
        { key: 'h8', href: '/me/poker/hand/h8', day: formatDay(hand.playedAt), handNo: 14, decisions: 1, evLossText: '2.5 BB', gradeText: 'Good', netText: '+2.0 BB' },
      ],
    });
  });
});

describe('meterGeometry', () => {
  it('places the band and a clamped marker', () => {
    const g = meterGeometry(0.31, [0.22, 0.28], 120);
    expect(g.band.x).toBeCloseTo(26.4, 6);
    expect(g.band.width).toBeCloseTo(7.2, 6);
    expect(g.marker.x).toBeCloseTo(35.2, 6);
    expect(meterGeometry(1, [0.2, 0.3], 120).marker.x).toBe(116);
    expect(meterGeometry(0, [0.2, 0.3], 120).marker.x).toBe(0);
    expect(meterGeometry(null, null, 120)).toEqual({ band: null, marker: null });
  });
});

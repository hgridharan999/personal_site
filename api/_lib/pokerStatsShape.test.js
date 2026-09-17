// api/_lib/pokerStatsShape.test.js
import { describe, it, expect } from 'vitest';
import {
  LEAK_MIN_DECISIONS, LEAK_EXAMPLES, LEAK_UNLOCK_HANDS, shapeLeaks, shapeTrend, pickFocus, shapeSpotHands,
} from './pokerStatsShape.js';
import { focusCopy } from '../../src/private/trainers/poker/leaks/spotCopy.js';

const leakRow = (overrides) => ({
  spot: 'pf.open', decisions: 40, hands: 40, mistakes: 2, evLoss: 30, costliestAction: 'raise', examples: [], ...overrides,
});

describe('constants', () => {
  it('match spec §7.4', () => {
    expect(LEAK_MIN_DECISIONS).toBe(15);
    expect(LEAK_EXAMPLES).toBe(5);
    expect(LEAK_UNLOCK_HANDS).toBe(200);
  });
});

describe('shapeLeaks', () => {
  it('converts units to BB per 100 graded hands and ranks by EV lost', () => {
    const rows = [
      leakRow(),
      leakRow({ spot: 'river.facing_bet.oop', decisions: 20, hands: 18, mistakes: 4, evLoss: 60, costliestAction: 'call', examples: ['h1', 'h2'] }),
      leakRow({ spot: 'turn.no_bet', decisions: 14, evLoss: 500 }),
    ];
    expect(shapeLeaks(rows, 300)).toEqual([
      {
        spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', decisions: 20, hands: 18, mistakes: 4,
        evLoss: 60, bbPer100: 10, bbPerDecision: 1.5, costliestAction: 'call', examples: ['h1', 'h2'],
      },
      {
        spot: 'pf.open', label: 'Preflop · first in', decisions: 40, hands: 40, mistakes: 2,
        evLoss: 30, bbPer100: 5, bbPerDecision: 0.375, costliestAction: 'raise', examples: [],
      },
    ]);
  });

  it('breaks ties by spot, caps examples and tolerates missing fields', () => {
    const rows = [
      leakRow({ spot: 'turn.cbet', costliestAction: undefined, examples: null }),
      leakRow({ spot: 'flop.cbet', examples: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    ];
    const leaks = shapeLeaks(rows, 100);
    expect(leaks.map((l) => l.spot)).toEqual(['flop.cbet', 'turn.cbet']);
    expect(leaks[0].examples).toHaveLength(5);
    expect(leaks[1]).toMatchObject({ costliestAction: null, examples: [] });
    expect(shapeLeaks(rows, 0)[0].bbPer100).toBeNull();
  });

  it('drops a spot with zero confident EV lost, even with enough decisions', () => {
    const rows = [leakRow({ spot: 'pf.open', evLoss: 0 }), leakRow({ spot: 'river.facing_bet.oop', evLoss: 60 })];
    expect(shapeLeaks(rows, 300).map((l) => l.spot)).toEqual(['river.facing_bet.oop']);
  });
});

describe('shapeTrend', () => {
  it('gives BB/100 per session and EV lost per 100 decisions', () => {
    const rows = [
      { id: 's1', startedAt: '2026-09-10T18:00:00.000Z', hands: 100, net: 50, allinAdjNet: 20.5, decisions: 0, evLoss: 0 },
      { id: 's2', startedAt: '2026-09-12T18:00:00.000Z', hands: 250, net: -80, allinAdjNet: -10, decisions: 400, evLoss: 332 },
    ];
    expect(shapeTrend(rows)).toEqual([
      { sessionId: 's1', startedAt: '2026-09-10T18:00:00.000Z', hands: 100, netBbPer100: 25, allinAdjBbPer100: 10.25, decisions: 0, evLostPer100Decisions: null },
      { sessionId: 's2', startedAt: '2026-09-12T18:00:00.000Z', hands: 250, netBbPer100: -16, allinAdjBbPer100: -2, decisions: 400, evLostPer100Decisions: 41.5 },
    ]);
  });
});

describe('pickFocus', () => {
  it('is null without leaks and describes the top leak otherwise', () => {
    expect(pickFocus([])).toBeNull();
    const leaks = shapeLeaks([leakRow({ spot: 'river.facing_bet.oop', decisions: 20, evLoss: 60, costliestAction: 'call', examples: ['h1'] })], 300);
    const { title, body } = focusCopy('river.facing_bet.oop', { costliestAction: 'call' });
    expect(pickFocus(leaks)).toEqual({
      spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', title, body, bbPer100: 10, decisions: 20, examples: ['h1'],
    });
  });
});

describe('shapeSpotHands', () => {
  it('maps severity to the worst grade', () => {
    const row = { handId: 'h1', sessionId: 's1', handNo: 3, playedAt: '2026-09-12T18:03:00.000Z', heroNet: -13, decisions: 2, evLoss: 7.5, confident: false };
    expect(shapeSpotHands([0, 1, 2, 3].map((severity) => ({ ...row, severity }))).map((h) => h.worstGrade))
      .toEqual(['good', 'inaccuracy', 'mistake', 'blunder']);
    expect(shapeSpotHands([{ ...row, severity: 2 }])[0]).toEqual({ ...row, worstGrade: 'mistake' });
  });
});

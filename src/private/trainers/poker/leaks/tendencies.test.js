import { describe, it, expect, vi } from 'vitest';
import { PROFILE_STATS } from '../bots/contract.js';
import { buildLog } from '../bots/testHands.js';
import { heroPosition, emptyTendencies, accumulateTendencies, shapeTendencies } from './tendencies.js';
import { heroPosition as serverHeroPosition } from '../../../../../api/_lib/pokerReview.js';

// Default table: button 5, so SB 0, BB 1, UTG 2, HJ 3, CO 4, BTN 5. Seat 2 opens and wins the blinds.
const utgOpen = () => buildLog(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1']);
// Button 0, so SB 1, BB 2, UTG 3, HJ 4, CO 5, BTN 0. Seat 2 (the big blind) folds to a small-blind raise.
const bbFold = () => buildLog(['f 3', 'f 4', 'f 5', 'f 0', 'r 1 6', 'f 2'], { button: 0 });

describe('heroPosition', () => {
  it('reads the hero position from the start event', () => {
    expect(heroPosition(utgOpen(), 2)).toBe('UTG');
    expect(heroPosition(utgOpen(), 5)).toBe('BTN');
    expect(heroPosition(bbFold(), 2)).toBe('BB');
  });

  it('is null for a seat not dealt in or a log without a start event', () => {
    expect(heroPosition(utgOpen(), 7)).toBeNull();
    expect(heroPosition([], 0)).toBeNull();
    expect(heroPosition([{ type: 'act', seat: 0, action: 'fold' }], 0)).toBeNull();
  });

  it('agrees with the server-side heroPosition (api/_lib/pokerReview.js) on 6-handed, 3-handed and heads-up hands', () => {
    const threeHanded = buildLog(['r 2 5', 'f 0', 'f 1'], { holes: ['2c3d', '7h2s', 'AhAs'], button: 2 });
    const headsUp = buildLog(['r 0 5', 'f 1'], { holes: ['2c3d', '7h2s'], button: 0 });
    const cases = [
      [utgOpen(), 2],
      [utgOpen(), 5],
      [bbFold(), 2],
      [threeHanded, 0],
      [threeHanded, 1],
      [threeHanded, 2],
      [headsUp, 0],
      [headsUp, 1],
    ];
    for (const [events, seat] of cases) {
      expect(heroPosition(events, seat)).toBe(serverHeroPosition(events[0], seat));
    }
  });
});

describe('accumulateTendencies', () => {
  it('folds each hand overall and into the hero position', () => {
    let acc = emptyTendencies();
    acc = accumulateTendencies(acc, 2, utgOpen());
    acc = accumulateTendencies(acc, 2, bbFold());
    expect(acc.overall.hands).toBe(2);
    expect(acc.overall.stats.vpip).toEqual({ value: 0.5, n: 2 });
    expect(Object.keys(acc.byPosition).sort()).toEqual(['BB', 'UTG']);
    expect(acc.byPosition.UTG.stats.vpip).toEqual({ value: 1, n: 1 });
    expect(acc.byPosition.BB.stats.vpip).toEqual({ value: 0, n: 1 });
  });

  it('returns the same object for a hand that does not count, and never mutates', () => {
    const acc = accumulateTendencies(emptyTendencies(), 2, utgOpen());
    const before = JSON.stringify(acc);
    expect(accumulateTendencies(acc, 2, buildLog(['r 2 5', 'f 3']))).toBe(acc);
    accumulateTendencies(acc, 2, bbFold());
    expect(JSON.stringify(acc)).toBe(before);
  });

  it('uses the injected accumulator overall and for the position', () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const events = utgOpen();
    const acc = accumulateTendencies(emptyTendencies(), 2, events, accumulate);
    expect(accumulate).toHaveBeenCalledTimes(2);
    expect(accumulate.mock.calls[1][1]).toBe(2);
    expect(accumulate.mock.calls[1][2]).toBe(events);
    expect(acc.byPosition.UTG.hands).toBe(1);
  });
});

describe('shapeTendencies', () => {
  it('shapes an empty profile', () => {
    const t = shapeTendencies(emptyTendencies());
    expect(t.hands).toBe(0);
    expect(t.minSample).toBe(30);
    expect(t.handsByPosition).toEqual({});
    expect(t.stats.map((s) => s.key)).toEqual(PROFILE_STATS);
    expect(t.stats[0]).toEqual({ key: 'vpip', overall: { value: null, n: 0, target: [0.22, 0.28], flag: null }, byPosition: {} });
  });

  it('attaches positional targets and flags only with enough samples', () => {
    let acc = emptyTendencies();
    acc = accumulateTendencies(acc, 2, bbFold());
    for (let i = 0; i < 30; i += 1) acc = accumulateTendencies(acc, 2, utgOpen());
    const t = shapeTendencies(acc);
    expect(t.hands).toBe(31);
    expect(t.handsByPosition).toEqual({ UTG: 30, BB: 1 });
    const vpip = t.stats.find((s) => s.key === 'vpip');
    expect(vpip.overall.flag).toBe('above');
    expect(Object.keys(vpip.byPosition)).toEqual(['UTG', 'BB']);
    expect(vpip.byPosition.UTG).toEqual({ value: 1, n: 30, target: [0.14, 0.19], flag: 'above' });
    expect(vpip.byPosition.BB).toEqual({ value: 0, n: 1, target: [0.3, 0.42], flag: null });
    const foldTo3Bet = t.stats.find((s) => s.key === 'foldTo3Bet');
    expect(foldTo3Bet.byPosition.UTG).toEqual({ value: null, n: 0, target: [0.45, 0.6], flag: null });
  });
});

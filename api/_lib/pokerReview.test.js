import { describe, it, expect } from 'vitest';
import { pokerHandRecord } from './pokerTesting.js';
import {
  REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT, SEVERITY_GRADES, heroPosition, shapeReviewHand, shapeSummary, shapeOpponents,
} from './pokerReview.js';

describe('review shaping', () => {
  it('keeps the documented limits', () => {
    expect([REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT]).toEqual([300, 20, 5]);
    expect(SEVERITY_GRADES).toEqual(['good', 'inaccuracy', 'mistake', 'blunder']);
  });

  it('computes the hero position from the start event', () => {
    const start = pokerHandRecord({ button: 0 }).events[0];
    expect(heroPosition(start, 0)).toBe('BTN');
    expect(heroPosition(start, 1)).toBe('SB');
    expect(heroPosition({ type: 'start' }, 0)).toBeNull();
  });

  it('computes positions for a 5-handed table', () => {
    const start = pokerHandRecord({ button: 0, seatIds: [0, 1, 2, 3, 4] }).events[0];
    expect(heroPosition(start, 0)).toBe('BTN');
    expect(heroPosition(start, 1)).toBe('SB');
    expect(heroPosition(start, 2)).toBe('BB');
    expect(heroPosition(start, 3)).toBe('HJ');
    expect(heroPosition(start, 4)).toBe('CO');
  });

  it('computes positions for a 3-handed table (no middle positions)', () => {
    const start = pokerHandRecord({ button: 0, seatIds: [0, 1, 2] }).events[0];
    expect(heroPosition(start, 0)).toBe('BTN');
    expect(heroPosition(start, 1)).toBe('SB');
    expect(heroPosition(start, 2)).toBe('BB');
  });

  it('computes positions heads-up (the button is the small blind)', () => {
    const start = pokerHandRecord({ button: 0, seatIds: [0, 1] }).events[0];
    expect(heroPosition(start, 0)).toBe('SB');
    expect(heroPosition(start, 1)).toBe('BB');
  });

  it('shapes a hand row with hero cards only, the worst grade and whether it needs grading', () => {
    const start = pokerHandRecord({ button: 3 }).events[0];
    const row = {
      id: 'h1', handNo: 4, playedAt: '2026-09-16T18:04:00.000Z', heroSeat: 0, start,
      holeCards: [{ seat: 0, cards: 'AhKs' }, { seat: 1, cards: '2c2d' }], board: 'Qh7d2s', pot: 64, heroNet: -30,
      heroAllinEv: null, showdown: true, heroActions: 3, decisions: 3, evLoss: 7.5, severity: 2, confident: false, version: 1,
    };
    expect(shapeReviewHand(row)).toEqual({
      id: 'h1', handNo: 4, playedAt: '2026-09-16T18:04:00.000Z', position: 'UTG', heroCards: 'AhKs', board: 'Qh7d2s', pot: 64,
      heroNet: -30, heroAllinEv: null, showdown: true, decisions: 3, evLoss: 7.5, worstGrade: 'mistake', confident: false, needsGrading: false,
    });
    expect(shapeReviewHand({ ...row, decisions: 0, evLoss: 0, severity: null, confident: null, version: null })).toMatchObject({
      worstGrade: null, confident: null, needsGrading: true,
    });
    expect(shapeReviewHand({ ...row, heroActions: 0, severity: null, version: null }).needsGrading).toBe(false);
  });

  it('fills summary defaults and groups opponents by seat in order of appearance', () => {
    const session = { hands: 12, net: -20, allinAdjNet: -4.5, lineup: [{ seat: 2, personaId: 'moss' }] };
    expect(shapeSummary(session, undefined)).toEqual({
      hands: 12, net: -20, allinAdjNet: -4.5, decisions: 0, evLoss: 0, gradedHands: 0, ungradedHands: 0,
      grades: { good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }, debatable: 0,
    });
    const rows = [
      { seat: 3, personaId: 'viper' }, { seat: 1, personaId: 'rook' }, { seat: 1, personaId: 'ink' }, { seat: 1, personaId: 'rook' },
    ];
    expect(shapeOpponents(rows, session.lineup)).toEqual([{ seat: 1, personaIds: ['rook', 'ink'] }, { seat: 3, personaIds: ['viper'] }]);
    expect(shapeOpponents([], session.lineup)).toEqual([{ seat: 2, personaIds: ['moss'] }]);
  });
});

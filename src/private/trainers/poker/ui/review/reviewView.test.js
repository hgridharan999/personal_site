import { describe, it, expect } from 'vitest';
import { formatDay } from '../../../core/format.js';
import { getPersona } from '../../bots/personas.js';
import {
  BIG_POT_UNITS, POSITIONS, DEFAULT_FILTERS, sessionHref, handHref, bbText, netText, cardsText, evLostPer100Decisions, gradeText,
  summaryView, costliestView, matchesFilters, positionsIn, handRowView, opponentsView, recentSessionView, mergePages,
} from './reviewView.js';

const reviewHand = (o = {}) => ({
  id: 'h1', handNo: 3, playedAt: '2026-09-16T18:03:00.000Z', position: 'BTN', heroCards: 'AhKs', board: 'Qh7d2s', pot: 64,
  heroNet: -30, heroAllinEv: null, showdown: true, decisions: 2, evLoss: 7, worstGrade: 'mistake', confident: true, needsGrading: false, ...o,
});

describe('formatting helpers', () => {
  it('formats links, money, cards, grades and the EV rate', () => {
    expect([BIG_POT_UNITS, POSITIONS]).toEqual([60, ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']]);
    expect(DEFAULT_FILTERS).toEqual({ mistakesOnly: false, bigPots: false, showdowns: false, position: 'all' });
    expect(sessionHref('s 1')).toBe('/me/poker/session/s%201');
    expect(handHref('h1')).toBe('/me/poker/hand/h1');
    expect(handHref('h1', 12)).toBe('/me/poker/hand/h1?d=12');
    expect(bbText(9)).toBe('4.5 BB');
    expect(netText(-7)).toBe('−3.5 BB');
    expect(cardsText('AhKs')).toBe('A♥ K♠');
    expect(cardsText('')).toBe('—');
    expect(evLostPer100Decisions(9, 4)).toBe(112.5);
    expect(evLostPer100Decisions(0, 0)).toBeNull();
    expect(gradeText('blunder', true)).toBe('Blunder');
    expect(gradeText('mistake', false)).toBe('Mistake (debatable)');
    expect(gradeText(null, null)).toBe('Not graded');
  });
});

describe('summaryView', () => {
  it('builds the tiles and grade counts', () => {
    const view = summaryView({
      hands: 40, net: 25, allinAdjNet: 7, decisions: 4, evLoss: 9, gradedHands: 3, ungradedHands: 2,
      grades: { good: 2, inaccuracy: 1, mistake: 1, blunder: 0 }, debatable: 1,
    });
    expect(view.tiles).toEqual([
      { key: 'hands', label: 'Hands', value: '40' },
      { key: 'net', label: 'Net', value: '+12.5 BB' },
      { key: 'allinAdj', label: 'All-in adjusted', value: '+3.5 BB' },
      { key: 'evLost', label: 'EV lost / 100 decisions', value: '112.5 BB' },
    ]);
    expect(view.grades).toEqual([
      { grade: 'good', label: 'Good', count: 2 }, { grade: 'inaccuracy', label: 'Inaccuracy', count: 1 },
      { grade: 'mistake', label: 'Mistake', count: 1 }, { grade: 'blunder', label: 'Blunder', count: 0 },
    ]);
    expect([view.decisions, view.debatable, view.ungradedHands]).toEqual([4, 1, 2]);
    expect(summaryView({ hands: 1, net: 0, allinAdjNet: 0, decisions: 0, evLoss: 0, gradedHands: 0, ungradedHands: 1, grades: { good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }, debatable: 0 }).tiles[3].value).toBe('—');
  });
});

describe('costliestView', () => {
  it('links each decision to its step in the replayer', () => {
    const d = {
      handId: 'h2', handNo: 7, idx: 15, street: 'river', position: 'BB', spot: 'river.facing_bet.oop', action: 'call', size: null,
      pot: 60, toCall: 48, recommended: { action: 'fold', size: null, evByOption: {} }, evLoss: 10.2, grade: 'blunder', confident: false,
    };
    expect(costliestView([d])).toEqual([{
      key: 'h2:15', href: '/me/poker/hand/h2?d=15', title: 'Hand 7 · River · facing a bet · out of position',
      actionText: 'You: Call · Best: Fold', lossText: '5.1 BB', gradeText: 'Blunder (debatable)',
    }]);
  });
});

describe('hand list', () => {
  it('filters by mistakes, big pots, showdowns and position', () => {
    const hands = [
      reviewHand(),
      reviewHand({ id: 'h2', worstGrade: 'good', pot: 20, showdown: false, position: 'BB' }),
      reviewHand({ id: 'h3', worstGrade: 'blunder', pot: 60, position: 'BB' }),
    ];
    const ids = (filters) => hands.filter((h) => matchesFilters(h, { ...DEFAULT_FILTERS, ...filters })).map((h) => h.id);
    expect(ids({})).toEqual(['h1', 'h2', 'h3']);
    expect(ids({ mistakesOnly: true })).toEqual(['h1', 'h3']);
    expect(ids({ bigPots: true })).toEqual(['h1']);
    expect(ids({ showdowns: true })).toEqual(['h1', 'h3']);
    expect(ids({ position: 'BB' })).toEqual(['h2', 'h3']);
    expect(positionsIn(hands)).toEqual(['BTN', 'BB']);
  });

  it('builds rows with grade, pending and ungraded states', () => {
    expect(handRowView(reviewHand())).toEqual({
      key: 'h1', href: '/me/poker/hand/h1', handNo: 3, position: 'BTN', cards: 'A♥ K♠', board: 'Q♥ 7♦ 2♠', pot: '32.0 BB',
      net: '−15.0 BB', grade: 'Mistake', loss: '3.5 BB', showdown: true,
    });
    expect(handRowView(reviewHand({ needsGrading: true, decisions: 0, worstGrade: null })).grade).toBe('Grading pending');
    expect(handRowView(reviewHand({ decisions: 0, worstGrade: null, position: null })))
      .toMatchObject({ grade: 'No decisions', loss: '—', position: '—' });
  });
});

describe('opponents, recent sessions and pages', () => {
  it('names personas with their revealed style, and unknown ids plainly', () => {
    const moss = getPersona('moss');
    expect(opponentsView([{ seat: 1, personaIds: ['moss', 'ghost'] }])).toEqual([{
      seat: 1,
      entries: [
        { personaId: 'moss', name: moss.name, tag: moss.tag, style: moss.style },
        { personaId: 'ghost', name: 'ghost', tag: '???', style: 'unknown style' },
      ],
    }]);
  });

  it('describes a recent session and merges review pages', () => {
    const s = { id: 's1', startedAt: '2026-09-16T18:00:00.000Z', endedAt: null, tableMode: 'random', hands: 12, net: 9, allinAdjNet: 9 };
    expect(recentSessionView(s)).toEqual({ key: 's1', href: '/me/poker/session/s1', when: formatDay(s.startedAt), detail: '12 hands · +4.5 BB', open: true });
    const first = { summary: { hands: 2 }, hands: [reviewHand()], nextAfterHandNo: 3 };
    const next = { summary: { hands: 3 }, hands: [reviewHand({ id: 'h4', handNo: 4 })], nextAfterHandNo: null };
    expect(mergePages(first, next)).toEqual({ summary: { hands: 3 }, hands: [reviewHand(), reviewHand({ id: 'h4', handNo: 4 })], nextAfterHandNo: null });
  });
});

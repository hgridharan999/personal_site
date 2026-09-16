import { describe, it, expect } from 'vitest';
import { parseCards } from '../engine/cards.js';
import { reduceHand } from '../engine/handState.js';
import { logLines, resultLines } from './actionLog.js';

const names = ['You', 'Moss', 'Viper'];
const opts = { nameOf: (seat) => names[seat], heroSeat: 0 };
const c = (text) => parseCards(text);

// Seat 0 (hero) is the button, seat 1 SB, seat 2 BB.
const showdownHand = [
  { type: 'start', seats: [0, 1, 2].map((seat) => ({ seat, stack: 200 })), button: 0, sb: 1, bb: 2 },
  { type: 'hole', seat: 0, cards: c('AhAd') },
  { type: 'hole', seat: 1, cards: c('KhKd') },
  { type: 'hole', seat: 2, cards: c('2c7s') },
  { type: 'act', seat: 0, action: 'raise', amount: 6 },
  { type: 'act', seat: 1, action: 'call' },
  { type: 'act', seat: 2, action: 'fold' },
  { type: 'board', cards: c('AsKc3d') },
  { type: 'act', seat: 1, action: 'check' },
  { type: 'act', seat: 0, action: 'bet', amount: 10 },
  { type: 'act', seat: 1, action: 'call' },
  { type: 'board', cards: c('4h') },
  { type: 'act', seat: 1, action: 'check' },
  { type: 'act', seat: 0, action: 'check' },
  { type: 'board', cards: c('9c') },
  { type: 'act', seat: 1, action: 'check' },
  { type: 'act', seat: 0, action: 'check' },
];

describe('logLines', () => {
  it('narrates a hand from blinds to showdown', () => {
    expect(logLines(showdownHand, opts)).toEqual([
      'Moss posts 0.5 BB',
      'Viper posts 1.0 BB',
      'You are dealt A♥ A♦',
      'You raise to 3.0 BB',
      'Moss calls 2.5 BB',
      'Viper folds',
      'Flop: A♠ K♣ 3♦',
      'Moss checks',
      'You bet 5.0 BB',
      'Moss calls 5.0 BB',
      'Turn: A♠ K♣ 3♦ 4♥',
      'Moss checks',
      'You check',
      'River: A♠ K♣ 3♦ 4♥ 9♣',
      'Moss checks',
      'You check',
      'You show A♥ A♦',
      'Moss shows K♥ K♦',
      'You win 17.0 BB with three of a kind',
    ]);
  });

  it("never mentions a bot's hole cards before they are shown", () => {
    const lines = logLines(showdownHand.slice(0, -1), opts).join('\n');
    expect(lines).not.toContain('K♥');
    expect(lines).not.toContain('7♠');
  });

  it('marks all-in calls and describes a hand won without a showdown', () => {
    const events = [
      { type: 'start', seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 5 }], button: 0, sb: 1, bb: 2 },
      { type: 'hole', seat: 0, cards: c('AhAd') },
      { type: 'hole', seat: 1, cards: c('KhKd') },
      { type: 'act', seat: 0, action: 'raise', amount: 20 },
      { type: 'act', seat: 1, action: 'call' },
    ];
    expect(logLines(events, opts)).toContain('Moss calls 1.5 BB (all-in)');

    const folded = [
      ...showdownHand.slice(0, 4),
      { type: 'act', seat: 0, action: 'raise', amount: 6 },
      { type: 'act', seat: 1, action: 'fold' },
      { type: 'act', seat: 2, action: 'fold' },
    ];
    expect(logLines(folded, opts).slice(-3)).toEqual(['Moss folds', 'Viper folds', 'You win 2.5 BB']);
  });
});

describe('resultLines', () => {
  it('is empty until the hand completes', () => {
    expect(resultLines(reduceHand(showdownHand.slice(0, 6)), opts)).toEqual([]);
    expect(resultLines(null, opts)).toEqual([]);
  });
});

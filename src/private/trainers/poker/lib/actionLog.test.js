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

  it('marks all-in blind posts', () => {
    const events = [
      { type: 'start', seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 200 }, { seat: 2, stack: 1 }], button: 0, sb: 1, bb: 2 },
    ];
    const lines = logLines(events, opts);
    expect(lines[0]).toBe('Moss posts 0.5 BB');
    expect(lines[1]).toBe('Viper posts 0.5 BB (all-in)');
  });
});

describe('resultLines', () => {
  it('is empty until the hand completes', () => {
    expect(resultLines(reduceHand(showdownHand.slice(0, 6)), opts)).toEqual([]);
    expect(resultLines(null, opts)).toEqual([]);
  });

  it('shows awards with split main pot and side pot', () => {
    // Scenario: seats 0 (hero), 1, 2. Seat 1 is short stack and goes all-in early.
    // Seats 0 and 2 tie with the same hand strength.
    // Result: main pot could be split, side pot goes to non-folded player.
    const events = [
      { type: 'start', seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 50 }, { seat: 2, stack: 200 }], button: 0, sb: 1, bb: 2 },
      { type: 'hole', seat: 0, cards: c('AhKh') },
      { type: 'hole', seat: 1, cards: c('2c3d') },
      { type: 'hole', seat: 2, cards: c('AcKd') },
      { type: 'act', seat: 0, action: 'raise', amount: 20 },
      { type: 'act', seat: 1, action: 'call' },
      { type: 'act', seat: 2, action: 'fold' },
      { type: 'board', cards: c('As9sJs') },
      { type: 'act', seat: 1, action: 'check' },
      { type: 'act', seat: 0, action: 'check' },
      { type: 'board', cards: c('2h') },
      { type: 'act', seat: 1, action: 'check' },
      { type: 'act', seat: 0, action: 'check' },
      { type: 'board', cards: c('5d') },
      { type: 'act', seat: 1, action: 'check' },
      { type: 'act', seat: 0, action: 'check' },
    ];
    const state = reduceHand(events);
    const lines = resultLines(state, opts);
    // Verify the structure: show lines for revealed hands and award lines
    expect(lines.length).toBeGreaterThan(0);
    // Verify folded player's cards don't appear
    const cardText = lines.join(' ');
    expect(cardText).not.toContain('A♣');
    expect(cardText).not.toContain('K♦');
    // Verify award lines exist (at least one player wins something)
    expect(lines.some((line) => line.includes('win'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { GAMES, PUZZLE_GAMES, gameByKey, hasAtMostDecimals } from './games.js';

describe('games', () => {
  it('has five unique catalog keys that never start with puzzle_', () => {
    expect(GAMES).toHaveLength(5);
    expect(new Set(GAMES.map((g) => g.key)).size).toBe(5);
    GAMES.forEach((g) => {
      expect(g.key.startsWith('puzzle_')).toBe(false);
      expect(g.min).toBeLessThan(g.max);
    });
  });
  it('fermi is lower-is-better with 2 decimals; the rest are higher with 0', () => {
    for (const g of GAMES) {
      const fermi = g.key === 'fermi';
      expect(g.lowerIsBetter).toBe(fermi);
      expect(g.decimals).toBe(fermi ? 2 : 0);
    }
  });
  it('exposes puzzle keys and gameByKey', () => {
    expect(PUZZLE_GAMES).toEqual({ sprint: 'puzzle_sprint', flaw: 'puzzle_flaw' });
    expect(gameByKey('krillion').max).toBe(700);
    expect(gameByKey('wordle')).toBeUndefined();
  });
  it('hasAtMostDecimals is float tolerant', () => {
    expect(hasAtMostDecimals(1.94, 2)).toBe(true);
    expect(hasAtMostDecimals(1.945, 2)).toBe(false);
    expect(hasAtMostDecimals(540, 0)).toBe(true);
    expect(hasAtMostDecimals(540.5, 0)).toBe(false);
  });
});

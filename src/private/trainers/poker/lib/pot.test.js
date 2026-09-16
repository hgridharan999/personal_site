import { describe, it, expect } from 'vitest';
import { potTotal } from './pot.js';

describe('potTotal', () => {
  it('sums every chip each player has put into the hand', () => {
    expect(potTotal({ players: [{ total: 3 }, { total: 0 }, { total: 12 }] })).toBe(15);
    expect(potTotal({ players: [] })).toBe(0);
  });
});

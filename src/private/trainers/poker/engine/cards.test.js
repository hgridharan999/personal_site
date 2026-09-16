import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import {
  RANKS, SUITS, rankOf, suitOf, parseCard, parseCards, cardToString, cardsToString, newDeck, shuffle,
} from './cards.js';

describe('cards', () => {
  it('encodes rank * 4 + suit', () => {
    expect(parseCard('2c')).toBe(0);
    expect(parseCard('Th')).toBe(34);
    expect(parseCard('As')).toBe(51);
    expect(rankOf(parseCard('Kd'))).toBe(11);
    expect(suitOf(parseCard('Kd'))).toBe(1);
  });

  it('round-trips every card', () => {
    for (const r of RANKS) {
      for (const s of SUITS) expect(cardToString(parseCard(r + s))).toBe(r + s);
    }
  });

  it('parses and formats card strings', () => {
    expect(parseCards('AhKs')).toEqual([50, 47]);
    expect(cardsToString([50, 47])).toBe('AhKs');
    expect(parseCards('')).toEqual([]);
  });

  it('rejects malformed cards', () => {
    expect(() => parseCard('1h')).toThrow();
    expect(() => parseCard('Ax')).toThrow();
    expect(() => parseCard('Ahh')).toThrow();
    expect(() => parseCards('AhK')).toThrow();
  });

  it('shuffles deterministically without mutating the input', () => {
    const deck = newDeck();
    const a = shuffle(deck, mulberry32(9));
    const b = shuffle(deck, mulberry32(9));
    expect(a).toEqual(b);
    expect(deck).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect([...a].sort((x, y) => x - y)).toEqual(deck);
    expect(a).not.toEqual(deck);
  });
});

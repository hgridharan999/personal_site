import { describe, it, expect } from 'vitest';
import { parseCard } from '../engine/cards.js';
import {
  formatBb, formatBbLabel, formatNetBb, formatBbInput, parseBbInput, cardLabel, cardText, isRedCard,
} from './format.js';
import { SEAT_COUNT, HERO_SEAT, BOT_SEATS, SB, BB, BUY_IN, REBUY_BELOW } from './constants.js';

describe('table constants', () => {
  it('match the spec: 6-max, 0.5/1 BB blinds, 100 BB buy-in, rebuy under 40 BB', () => {
    expect(SEAT_COUNT).toBe(6);
    expect(HERO_SEAT).toBe(0);
    expect(BOT_SEATS).toEqual([1, 2, 3, 4, 5]);
    expect([SB, BB, BUY_IN, REBUY_BELOW]).toEqual([1, 2, 200, 80]);
  });
});

describe('BB formatting', () => {
  it('shows units as BB with one decimal', () => {
    expect(formatBb(200)).toBe('100.0');
    expect(formatBb(1)).toBe('0.5');
    expect(formatBb(0)).toBe('0.0');
    expect(formatBbLabel(7)).toBe('3.5 BB');
  });

  it('signs net results', () => {
    expect(formatNetBb(25)).toBe('+12.5');
    expect(formatNetBb(-6)).toBe('−3.0');
    expect(formatNetBb(0)).toBe('0.0');
  });

  it('round-trips the size input', () => {
    expect(formatBbInput(24)).toBe('12');
    expect(formatBbInput(25)).toBe('12.5');
    expect(parseBbInput('12')).toBe(24);
    expect(parseBbInput(' 12.5 ')).toBe(25);
    expect(parseBbInput('.5')).toBe(1);
    expect(parseBbInput('3.')).toBe(6);
    expect(parseBbInput('0.3')).toBe(1);
    expect(parseBbInput('0.2')).toBe(0);
  });

  it('rejects text that is not a plain positive number', () => {
    for (const bad of ['', 'abc', '-2', '1e3', '1.2.3', null, undefined]) expect(parseBbInput(bad)).toBeNull();
  });
});

describe('card text', () => {
  it('names cards for screen readers', () => {
    expect(cardLabel(parseCard('Ah'))).toBe('Ace of hearts');
    expect(cardLabel(parseCard('Tc'))).toBe('Ten of clubs');
    expect(cardLabel(parseCard('2s'))).toBe('Two of spades');
  });

  it('writes short card text with suit symbols', () => {
    expect(cardText(parseCard('Ah'))).toBe('A♥');
    expect(cardText(parseCard('Tc'))).toBe('10♣');
    expect(cardText(parseCard('9d'))).toBe('9♦');
    expect(cardText(parseCard('Ks'))).toBe('K♠');
  });

  it('colors diamonds and hearts red', () => {
    expect(isRedCard(parseCard('Ad'))).toBe(true);
    expect(isRedCard(parseCard('Ah'))).toBe(true);
    expect(isRedCard(parseCard('Ac'))).toBe(false);
    expect(isRedCard(parseCard('As'))).toBe(false);
  });
});

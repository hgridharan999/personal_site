// src/private/trainers/poker/bots/texture.test.js
import { describe, it, expect } from 'vitest';
import { parseCards } from '../engine/cards.js';
import { CATEGORY } from '../engine/evaluator.js';
import { boardTexture, handFeatures } from './texture.js';

describe('boardTexture', () => {
  it('scores a dry rainbow board low and a connected two-tone board high', () => {
    const dry = boardTexture(parseCards('Kh7d2c'));
    expect(dry).toMatchObject({ paired: false, monotone: false, twoTone: false, maxSuit: 1 });
    expect(dry.wetness).toBeLessThan(0.3);
    const wet = boardTexture(parseCards('9h8hTc'));
    expect(wet.twoTone).toBe(true);
    expect(wet.wetness).toBeGreaterThan(0.7);
    expect(wet.highRank).toBe(8); // T
  });

  it('detects paired and monotone boards', () => {
    expect(boardTexture(parseCards('8s8d3c')).paired).toBe(true);
    const mono = boardTexture(parseCards('Ks9s4s'));
    expect(mono.monotone).toBe(true);
    expect(mono.wetness).toBeGreaterThanOrEqual(0.5);
  });

  it('counts wheel windows', () => {
    expect(boardTexture(parseCards('As2d3c')).straightWindows).toBeGreaterThanOrEqual(1);
  });
});

describe('handFeatures', () => {
  it('finds flush draws and straight draws that use a hole card', () => {
    expect(handFeatures(parseCards('Ah5h'), parseCards('Kh8h2c'))).toMatchObject({ flushDraw: true, straightDraw: null, category: CATEGORY.HIGH_CARD });
    expect(handFeatures(parseCards('9c8d'), parseCards('7h6s2c')).straightDraw).toBe('oesd');
    expect(handFeatures(parseCards('9c8d'), parseCards('6h5s2c')).straightDraw).toBe('gutshot');
    expect(handFeatures(parseCards('Ad2c'), parseCards('3h4sKc')).straightDraw).toBe('gutshot');
  });

  it('ignores draws on the board alone, on the river, and once a straight is made', () => {
    expect(handFeatures(parseCards('2c2d'), parseCards('9h8h7h6h')).flushDraw).toBe(false);
    expect(handFeatures(parseCards('Ah5h'), parseCards('Kh8h2c3d4s'))).toMatchObject({ flushDraw: false, straightDraw: null });
    expect(handFeatures(parseCards('9c8d'), parseCards('7h6sTc')).straightDraw).toBeNull();
    expect(handFeatures(parseCards('9c8d'), parseCards('7h6sTc')).category).toBe(CATEGORY.STRAIGHT);
  });
});

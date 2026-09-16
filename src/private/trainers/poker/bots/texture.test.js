// src/private/trainers/poker/bots/texture.test.js
import { describe, it, expect } from 'vitest';
import { parseCards } from '../engine/cards.js';
import { CATEGORY } from '../engine/evaluator.js';
import { comboOf } from './handClass.js';
import { boardTexture, handFeatures, comboDraws } from './texture.js';

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

  it('classifies by the number of distinct ranks that complete the straight, not the number of overlapping windows', () => {
    // 6s5s on 9c8dTh: only a 7 completes a straight (5,6,7,8,9 and 6,7,8,9,T both need the same 7) - a gutshot.
    expect(handFeatures(parseCards('6s5s'), parseCards('9c8dTh')).straightDraw).toBe('gutshot');
    // 9s6s on 8c7d2h: needs a 5 or a T - two distinct ranks, a genuine open-ended draw.
    expect(handFeatures(parseCards('9s6s'), parseCards('8c7d2h')).straightDraw).toBe('oesd');
    // 9s5s on 8c7d2h: only a 6 completes it - a gutshot.
    expect(handFeatures(parseCards('9s5s'), parseCards('8c7d2h')).straightDraw).toBe('gutshot');
    // Ts8s on Qc9d6h: needs a J or a 7 - two distinct ranks, a double gutter counted as oesd.
    expect(handFeatures(parseCards('Ts8s'), parseCards('Qc9d6h')).straightDraw).toBe('oesd');
    // As2s on 3c4dKh: needs a 5 for the wheel - a gutshot.
    expect(handFeatures(parseCards('As2s'), parseCards('3c4dKh')).straightDraw).toBe('gutshot');
    // Ks2s on 9h8h7h: the board's own run doesn't involve either hole card - no straight draw at all.
    expect(handFeatures(parseCards('Ks2s'), parseCards('9h8h7h')).straightDraw).toBeNull();
  });
});

describe('comboDraws', () => {
  it('flags an oesd combo, but not a gutshot combo or a non-draw combo, on the same board', () => {
    const board = parseCards('7h6s2c');
    const draws = comboDraws(board);
    // 9c8d on 7h6s2c needs a 5 or a T - open-ended.
    const [nineC, eightD] = parseCards('9c8d');
    expect(draws[comboOf(nineC, eightD)]).toBe(1);
    // 9c5d on 7h6s2c needs only an 8 - a gutshot, not flagged.
    const [nineC2, fiveD] = parseCards('9c5d');
    expect(draws[comboOf(nineC2, fiveD)]).toBe(0);
    // KcQd on 7h6s2c has no flush or straight draw at all.
    const [kingC, queenD] = parseCards('KcQd');
    expect(draws[comboOf(kingC, queenD)]).toBe(0);
  });
});

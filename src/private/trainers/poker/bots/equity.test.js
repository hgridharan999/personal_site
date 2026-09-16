import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCards } from '../engine/cards.js';
import { evaluate } from '../engine/evaluator.js';
import { COMBO_COUNT, comboOf, CLASS_COMBOS, parseClass } from './handClass.js';
import { equityVsRanges } from './equity.js';

/** A range holding exactly the given combos (e.g. 'KdKc'). */
function rangeOf(...hands) {
  const r = new Float32Array(COMBO_COUNT);
  for (const h of hands) r[comboOf(...parseCards(h))] = 1;
  return r;
}

const uniform = () => new Float32Array(COMBO_COUNT).fill(1);

// Exact heads-up equity on the flop by enumerating all turn and river cards.
function exactFlopEquity(hero, villain, flop) {
  const dead = new Set([...hero, ...villain, ...flop]);
  const live = Array.from({ length: 52 }, (_, c) => c).filter((c) => !dead.has(c));
  let share = 0;
  let n = 0;
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const board = [...flop, live[i], live[j]];
      const a = evaluate([...hero, ...board]);
      const b = evaluate([...villain, ...board]);
      share += a > b ? 1 : a === b ? 0.5 : 0;
      n += 1;
    }
  }
  return share / n;
}

describe('equityVsRanges', () => {
  it('AhAs vs KdKc preflop is about 81%', () => {
    const { equity, stderr } = equityVsRanges({
      hole: parseCards('AhAs'), board: [], ranges: [rangeOf('KdKc')], rng: mulberry32(1), iterations: 40000,
    });
    expect(equity).toBeGreaterThan(0.80);
    expect(equity).toBeLessThan(0.83);
    expect(stderr).toBeLessThan(0.003);
  });

  it('7c2d vs AhAs preflop is about 12.5%', () => {
    const { equity } = equityVsRanges({
      hole: parseCards('7c2d'), board: [], ranges: [rangeOf('AhAs')], rng: mulberry32(2), iterations: 40000,
    });
    expect(equity).toBeGreaterThan(0.11);
    expect(equity).toBeLessThan(0.14);
  });

  it('matches exact enumeration on the flop within 1.5 points', () => {
    const hero = parseCards('AhKh');
    const villain = parseCards('QsQd');
    const flop = parseCards('Qh7h2c');
    const exact = exactFlopEquity(hero, villain, flop);
    const { equity } = equityVsRanges({ hole: hero, board: flop, ranges: [rangeOf('QsQd')], rng: mulberry32(3), iterations: 30000 });
    expect(Math.abs(equity - exact)).toBeLessThan(0.015);
  });

  it('a random hand is 50% against a random hand and about 1/3 three-way', () => {
    const hole = parseCards('Td9c');
    const hu = equityVsRanges({ hole: parseCards('8s8d'), board: [], ranges: [uniform()], rng: mulberry32(4), iterations: 30000 });
    expect(hu.equity).toBeGreaterThan(0.66); // 88 vs random is about 69%
    expect(hu.equity).toBeLessThan(0.72);
    const three = equityVsRanges({ hole, board: [], ranges: [uniform(), uniform()], rng: mulberry32(5), iterations: 30000 });
    expect(three.equity).toBeGreaterThan(0.30);
    expect(three.equity).toBeLessThan(0.40);
  });

  it('weights ranges: AKs vs {QQ weight 1, 72o weight 0} equals AKs vs QQ', () => {
    const qq = new Float32Array(COMBO_COUNT);
    for (const c of CLASS_COMBOS[parseClass('QQ')]) qq[c] = 1;
    const mixed = qq.slice();
    for (const c of CLASS_COMBOS[parseClass('72o')]) mixed[c] = 0;
    const a = equityVsRanges({ hole: parseCards('AsKs'), board: [], ranges: [qq], rng: mulberry32(6), iterations: 5000 });
    const b = equityVsRanges({ hole: parseCards('AsKs'), board: [], ranges: [mixed], rng: mulberry32(6), iterations: 5000 });
    expect(b.equity).toBe(a.equity);
    expect(a.equity).toBeGreaterThan(0.43);
    expect(a.equity).toBeLessThan(0.49);
  });

  it('removes combos that conflict with the board and falls back to any live combo for an empty range', () => {
    const board = parseCards('KdKc2h');
    const onlyDead = rangeOf('KdKc');
    const { equity } = equityVsRanges({ hole: parseCards('AhAs'), board, ranges: [onlyDead], rng: mulberry32(7), iterations: 2000 });
    expect(equity).toBeGreaterThan(0.7);
  });

  it('is deterministic for a seed and returns 1 with no opponents', () => {
    const input = () => ({ hole: parseCards('9h8h'), board: parseCards('Th7c2s'), ranges: [uniform()], rng: mulberry32(8), iterations: 500 });
    expect(equityVsRanges(input())).toEqual(equityVsRanges(input()));
    expect(equityVsRanges({ ...input(), ranges: [] }).equity).toBe(1);
  });

  it('stops at the time budget using the injected clock', () => {
    let t = 0;
    const now = () => {
      t += 1;
      return t;
    };
    const { iterations } = equityVsRanges({
      hole: parseCards('9h8h'), board: [], ranges: [uniform()], rng: mulberry32(9), iterations: 1e9, budgetMs: 5, now,
    });
    expect(iterations).toBeGreaterThanOrEqual(32);
    expect(iterations).toBeLessThan(1000);
  });
});

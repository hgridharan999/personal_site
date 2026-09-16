import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCards } from '../engine/cards.js';
import { evaluate } from '../engine/evaluator.js';
import { COMBO_COUNT, comboOf } from './handClass.js';
import { equityVsRanges } from './equity.js';

/** A range of the given combos: 'KdKc' has weight 1, ['KdKc', 3] has weight 3. */
function rangeOf(...hands) {
  const r = new Float32Array(COMBO_COUNT);
  for (const h of hands) {
    const [text, w] = Array.isArray(h) ? h : [h, 1];
    r[comboOf(...parseCards(text))] = w;
  }
  return r;
}

const uniform = () => new Float32Array(COMBO_COUNT).fill(1);

/** |a - b| must be within 3 combined standard errors. */
function expectClose(a, sa, b, sb = 0) {
  expect(Math.abs(a - b)).toBeLessThan(3 * Math.sqrt(sa * sa + sb * sb));
}

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

// Exact preflop values from a full 5-card runout enumeration (scratch script, see task-2 report fix round 1).
// JcJd vs {AsAh, KsKh} and {AsKd, QcQd}: the compatible pairs (AA,QQ), (KK,AKo), (KK,QQ) are equally likely.
const EXACT_JJ_VS_TWO_RANGES = (0.1459396312783659 + 0.19635592284734296 + 0.14752561971976436) / 3; // 0.16327
const EXACT_JJ_VS_AA_QQ = 0.1459396312783659;

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

  it('8s8d is about 69% against any hand and Td9c is about a third against two of them', () => {
    const hu = equityVsRanges({ hole: parseCards('8s8d'), board: [], ranges: [uniform()], rng: mulberry32(4), iterations: 30000 });
    expect(hu.equity).toBeGreaterThan(0.66);
    expect(hu.equity).toBeLessThan(0.72);
    const three = equityVsRanges({ hole: parseCards('Td9c'), board: [], ranges: [uniform(), uniform()], rng: mulberry32(5), iterations: 30000 });
    expect(three.equity).toBeGreaterThan(0.30);
    expect(three.equity).toBeLessThan(0.40);
  });

  it('weights combos: QcQd vs {AsAh:1, JsJh:3} is 0.25 eq(vs AA) + 0.75 eq(vs JJ)', () => {
    const hole = parseCards('QcQd');
    const vsAA = equityVsRanges({ hole, board: [], ranges: [rangeOf('AsAh')], rng: mulberry32(61), iterations: 40000 });
    const vsJJ = equityVsRanges({ hole, board: [], ranges: [rangeOf('JsJh')], rng: mulberry32(62), iterations: 40000 });
    const mixed = equityVsRanges({ hole, board: [], ranges: [rangeOf(['AsAh', 1], ['JsJh', 3])], rng: mulberry32(63), iterations: 80000 });
    const expected = 0.25 * vsAA.equity + 0.75 * vsJJ.equity;
    const expectedErr = Math.hypot(0.25 * vsAA.stderr, 0.75 * vsJJ.stderr);
    expectClose(mixed.equity, mixed.stderr, expected, expectedErr);
    // An unweighted mix would sit near 0.50; the weighted one is near 0.66.
    expect(mixed.equity).toBeGreaterThan(0.6);
  });

  it('treats NaN and negative weights as zero', () => {
    const input = (range) => ({ hole: parseCards('QcQd'), board: [], ranges: [range], rng: mulberry32(64), iterations: 3000 });
    const noisy = rangeOf(['AsAh', NaN], ['KsKh', -1], ['JsJh', 1]);
    const clean = rangeOf('JsJh');
    const result = equityVsRanges(input(noisy));
    expect(Number.isNaN(result.equity)).toBe(false);
    expect(result).toEqual(equityVsRanges(input(clean)));
  });

  it('is unbiased and order independent when opponent ranges share cards', () => {
    const r1 = rangeOf('AsAh', 'KsKh');
    const r2 = rangeOf('AsKd', 'QcQd');
    const hole = parseCards('JcJd');
    const a = equityVsRanges({ hole, board: [], ranges: [r1, r2], rng: mulberry32(71), iterations: 200000 });
    const b = equityVsRanges({ hole, board: [], ranges: [r2, r1], rng: mulberry32(72), iterations: 200000 });
    expectClose(a.equity, a.stderr, b.equity, b.stderr);
    expectClose(a.equity, a.stderr, EXACT_JJ_VS_TWO_RANGES);
    expectClose(b.equity, b.stderr, EXACT_JJ_VS_TWO_RANGES);
  });

  it('deals in-range combos when an opponent range is mostly blocked by another', () => {
    const r1 = rangeOf('AsAh');
    const r2 = rangeOf(['AsKs', 1], ['QcQd', 0.01]);
    const { equity, stderr } = equityVsRanges({ hole: parseCards('JcJd'), board: [], ranges: [r1, r2], rng: mulberry32(73), iterations: 60000 });
    expectClose(equity, stderr, EXACT_JJ_VS_AA_QQ);
  });

  it('removes combos that touch dead cards before sampling', () => {
    // KdKc is on the board, so a range of {KdKc:1000, 7s7d:1} must sample exactly like {7s7d}.
    const input = (range) => ({ hole: parseCards('AhAs'), board: parseCards('KdKc2h'), ranges: [range], rng: mulberry32(7), iterations: 2000 });
    const withDead = equityVsRanges(input(rangeOf(['KdKc', 1000], '7s7d')));
    expect(withDead).toEqual(equityVsRanges(input(rangeOf('7s7d'))));
  });

  it('falls back to every live combo when the whole range is dead', () => {
    const input = (range) => ({ hole: parseCards('AhAs'), board: parseCards('KdKc2h'), ranges: [range], rng: mulberry32(8), iterations: 2000 });
    const onlyDead = equityVsRanges(input(rangeOf('KdKc')));
    expect(onlyDead).toEqual(equityVsRanges(input(uniform())));
    expect(onlyDead.equity).toBeGreaterThan(0.7);
  });

  it('splits a three-way tie when the board plays: royal flush gives 1/3', () => {
    const { equity, stderr } = equityVsRanges({
      hole: parseCards('2c3d'), board: parseCards('AsKsQsJsTs'), ranges: [uniform(), uniform()], rng: mulberry32(9), iterations: 500,
    });
    expect(equity).toBeCloseTo(1 / 3, 9);
    expect(stderr).toBeLessThan(1e-6);
  });

  it('is deterministic for a seed, returns 1 with no opponents and a neutral result for zero iterations', () => {
    const input = () => ({ hole: parseCards('9h8h'), board: parseCards('Th7c2s'), ranges: [uniform()], rng: mulberry32(10), iterations: 500 });
    expect(equityVsRanges(input())).toEqual(equityVsRanges(input()));
    expect(equityVsRanges({ ...input(), ranges: [] }).equity).toBe(1);
    expect(equityVsRanges({ ...input(), iterations: 0 })).toEqual({ equity: 0.5, iterations: 0, stderr: 1 });
  });

  it('stops at the time budget using the injected clock, never below 32 iterations', () => {
    let t = 0;
    const now = () => {
      t += 1;
      return t;
    };
    const { iterations } = equityVsRanges({
      hole: parseCards('9h8h'), board: [], ranges: [uniform()], rng: mulberry32(11), iterations: 1e9, budgetMs: 5, now,
    });
    expect(iterations).toBeGreaterThanOrEqual(32);
    expect(iterations).toBeLessThan(1000);
    const spent = equityVsRanges({
      hole: parseCards('9h8h'), board: [], ranges: [uniform()], rng: mulberry32(12), iterations: 1e9, budgetMs: 0, now: () => 0,
    });
    expect(spent.iterations).toBe(32);
  });
});

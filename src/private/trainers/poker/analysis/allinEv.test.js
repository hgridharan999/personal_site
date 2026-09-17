import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { buildLog } from '../bots/testHands.js';
import { ALLIN_SAMPLES, allInPoint, heroAllinEv } from './allinEv.js';

// Heads-up: seat 1 is the button and small blind, seat 0 the big blind (the hero).
const HU = (holes, steps) => buildLog(steps, { holes });

describe('allInPoint and heroAllinEv', () => {
  it('is null without an all-in before the river', () => {
    expect(ALLIN_SAMPLES).toBe(20000);
    const folded = HU(['AhAs', 'KdKc'], ['r 1 6', 'f 0']);
    expect(allInPoint(folded, 0)).toBeNull();
    expect(heroAllinEv(folded, 0)).toBeNull();
    const riverShove = HU(['AhAs', 'KdKc'], ['c 1', 'k 0', 'B 2c7d9h', 'k 0', 'k 1', 'B Js', 'k 0', 'k 1', 'B 3h', 'b 0 198', 'c 1']);
    expect(heroAllinEv(riverShove, 0)).toBeNull();
  });

  it('is null for a hero who folded while others went all-in', () => {
    // Three seats, button 2: SB 0, BB 1, the button acts first preflop.
    const events = buildLog(['r 2 200', 'c 0', 'f 1', 'B 2c7d9h', 'B Js', 'B 3h'], { holes: ['AhAs', 'KdKc', 'QsQh'] });
    expect(heroAllinEv(events, 1)).toBeNull();
    expect(allInPoint(events, 0).board).toEqual([]);
  });

  it('enumerates the last two cards exactly: a flopped royal flush is worth the whole pot', () => {
    const events = HU(['AhKh', '2c2d'], ['c 1', 'k 0', 'B QhJhTh', 'b 0 198', 'c 1', 'B 3c', 'B 4d']);
    expect(allInPoint(events, 0).board).toHaveLength(3);
    expect(heroAllinEv(events, 0)).toBe(200);
    expect(heroAllinEv(events, 1)).toBe(-200);
  });

  it('samples a preflop all-in: AA against KK is worth about 82% of 400 minus 200', () => {
    const events = HU(['AhAs', 'KdKc'], ['r 1 200', 'c 0', 'B 2c7d9h', 'B Js', 'B 3h']);
    expect(() => heroAllinEv(events, 0)).toThrow('heroAllinEv needs an rng for a preflop all-in');
    const ev = heroAllinEv(events, 0, { rng: mulberry32(11) });
    expect(ev).toBeGreaterThan(116);
    expect(ev).toBeLessThan(140);
    expect(heroAllinEv(events, 0, { rng: mulberry32(11) })).toBe(ev);
    expect(Math.abs(ev * 100 - Math.round(ev * 100))).toBeLessThan(1e-6);
  });
});

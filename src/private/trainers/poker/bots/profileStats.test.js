import { describe, it, expect } from 'vitest';
import { emptyProfile, PROFILE_STATS } from './contract.js';
import { accumulateProfile, handObservations } from './profileStats.js';
import { buildLog } from './testHands.js';

// Six players with 200 units, button 5: SB 0, BB 1, UTG 2, HJ 3, CO 4, BTN 5. Holes: SB 2c3d, BB 7h2s, UTG AhAs, HJ KdQd, CO JcTc, BTN 9s9h.
const log = (steps) => buildLog(steps);

const statsAfter = (events, hero) => accumulateProfile(emptyProfile(), hero, events).stats;

describe('accumulateProfile', () => {
  it('open then fold to a 3-bet', () => {
    const events = log(['f 2', 'f 3', 'r 4 5', 'r 5 15', 'f 0', 'f 1', 'f 4']);
    const s = statsAfter(events, 4);
    expect(s.vpip).toEqual({ value: 1, n: 1 });
    expect(s.pfr).toEqual({ value: 1, n: 1 });
    expect(s.threeBet).toEqual({ value: null, n: 0 });
    expect(s.foldTo3Bet).toEqual({ value: 1, n: 1 });
    expect(s.wtsd).toEqual({ value: null, n: 0 });
    expect(s.aggFreq).toEqual({ value: null, n: 0 });
    // the 3-bettor
    const b = statsAfter(events, 5);
    expect(b.threeBet).toEqual({ value: 1, n: 1 });
    expect(b.foldTo3Bet.n).toBe(0);
  });

  it('3-bet, c-bet flop, barrel turn, call a raise, fold the river', () => {
    const events = log([
      'r 2 5', 'f 3', 'f 4', 'r 5 15', 'f 0', 'f 1', 'c 2',
      'B Kh8d4s', 'k 2', 'b 5 20', 'c 2',
      'B 6c', 'k 2', 'b 5 40', 'r 2 100', 'c 5',
      'B 3h', 'b 2 50', 'f 5',
    ]);
    const s = statsAfter(events, 5);
    expect(s.threeBet).toEqual({ value: 1, n: 1 });
    expect(s.cbetFlop).toEqual({ value: 1, n: 1 });
    expect(s.cbetTurn).toEqual({ value: 1, n: 1 });
    expect(s.foldToRiverBet).toEqual({ value: 1, n: 1 });
    expect(s.riverBetFreq.n).toBe(0);
    expect(s.aggFreq).toEqual({ value: 0.5, n: 4 });
    expect(s.wtsd).toEqual({ value: 0, n: 1 });
    expect(s.wsd.n).toBe(0);
    // the opener faced the 3-bet, checked and called the c-bet, then check-raised the turn
    const o = statsAfter(events, 2);
    expect(o.foldTo3Bet).toEqual({ value: 0, n: 1 });
    expect(o.foldToCbetFlop).toEqual({ value: 0, n: 1 }); // the flop bettor made the last preflop raise
    expect(o.foldToCbetTurn).toEqual({ value: 0, n: 1 });
    expect(o.checkRaise).toEqual({ value: 0.5, n: 2 });
    expect(o.riverBetFreq).toEqual({ value: 1, n: 1 });
  });

  it('defend the big blind and check-raise a c-bet', () => {
    const events = log(['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1', 'b 5 6', 'r 1 20', 'f 5']);
    const s = statsAfter(events, 1);
    expect(s.vpip).toEqual({ value: 1, n: 1 });
    expect(s.pfr).toEqual({ value: 0, n: 1 });
    expect(s.threeBet).toEqual({ value: 0, n: 1 });
    expect(s.foldToCbetFlop).toEqual({ value: 0, n: 1 });
    expect(s.checkRaise).toEqual({ value: 1, n: 1 });
    expect(s.aggFreq).toEqual({ value: 0.5, n: 2 });
    expect(s.wtsd).toEqual({ value: 0, n: 1 });
    const btn = statsAfter(events, 5);
    expect(btn.cbetFlop).toEqual({ value: 1, n: 1 });
    expect(btn.foldToCbetFlop.n).toBe(0);
  });

  it('miss the c-bet, call the turn, bet the river and win at showdown', () => {
    const events = log([
      'r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'c 1',
      'B Kh8d4s', 'k 1', 'k 2',
      'B 6c', 'b 1 6', 'c 2',
      'B 3h', 'k 1', 'b 2 10', 'c 1',
    ]);
    const s = statsAfter(events, 2);
    expect(s.cbetFlop).toEqual({ value: 0, n: 1 });
    expect(s.cbetTurn.n).toBe(0);
    expect(s.foldToCbetTurn.n).toBe(0); // the turn bettor was not the preflop raiser
    expect(s.foldToRiverBet.n).toBe(0);
    expect(s.riverBetFreq).toEqual({ value: 1, n: 1 });
    expect(s.wtsd).toEqual({ value: 1, n: 1 });
    expect(s.wsd).toEqual({ value: 1, n: 1 }); // AA beats 72
    const bb = statsAfter(events, 1);
    expect(bb.wsd).toEqual({ value: 0, n: 1 });
    expect(bb.checkRaise).toEqual({ value: 0, n: 1 }); // checked the river, then called
  });

  it('counts fold to a turn c-bet after calling the flop c-bet', () => {
    const events = log([
      'r 2 5', 'f 3', 'f 4', 'c 5', 'f 0', 'f 1',
      'B Kh8d4s', 'b 2 8', 'c 5',
      'B 6c', 'b 2 20', 'f 5',
    ]);
    const s = statsAfter(events, 5);
    expect(s.vpip).toEqual({ value: 1, n: 1 });
    expect(s.threeBet).toEqual({ value: 0, n: 1 });
    expect(s.foldToCbetFlop).toEqual({ value: 0, n: 1 });
    expect(s.foldToCbetTurn).toEqual({ value: 1, n: 1 });
    expect(statsAfter(events, 2).cbetTurn).toEqual({ value: 1, n: 1 });
  });

  it('a walk counts the hand but no preflop opportunity', () => {
    const events = log(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']);
    const p = accumulateProfile(emptyProfile(), 1, events);
    expect(p.hands).toBe(1);
    expect(p.stats.vpip.n).toBe(0);
  });

  it('keeps running means across hands and never mutates the input', () => {
    const fold = log(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']);
    const open = log(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1']);
    const limpFold = log(['f 2', 'f 3', 'f 4', 'f 5', 'c 0', 'r 1 6', 'f 0']);
    const start = emptyProfile();
    const before = JSON.stringify(start);
    let p = accumulateProfile(start, 2, open);
    p = accumulateProfile(p, 2, limpFold); // UTG folded preflop: vpip 0
    p = accumulateProfile(p, 2, fold);
    expect(p.hands).toBe(3);
    expect(p.stats.vpip.n).toBe(3);
    expect(p.stats.vpip.value).toBeCloseTo(1 / 3, 10);
    expect(JSON.stringify(start)).toBe(before);
    expect(Object.keys(p.stats).sort()).toEqual([...PROFILE_STATS].sort());
  });

  it('ignores incomplete hands and seats that were not dealt in', () => {
    const events = log(['r 2 5', 'f 3']);
    const p = emptyProfile();
    expect(accumulateProfile(p, 2, events)).toBe(p);
    const full = log(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1']);
    expect(handObservations(full, 7)).toBeNull();
  });
});

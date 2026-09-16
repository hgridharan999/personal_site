import { describe, it, expect } from 'vitest';
import { buildPots, awardPots } from './pots.js';

const c = (seat, total, folded = false) => ({ seat, total, folded });

describe('buildPots', () => {
  it('makes one pot when everyone matched', () => {
    expect(buildPots([c(0, 10), c(1, 10)])).toEqual([{ amount: 20, eligible: [0, 1] }]);
  });

  it('adds folded chips without making the folder eligible', () => {
    expect(buildPots([c(0, 4, true), c(1, 10), c(2, 10)])).toEqual([{ amount: 24, eligible: [1, 2] }]);
  });

  it('builds side pots for different all-in amounts', () => {
    expect(buildPots([c(0, 50), c(1, 100), c(2, 100)])).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: 100, eligible: [1, 2] },
    ]);
  });

  it('handles a folder who put in more than a short all-in', () => {
    expect(buildPots([c(0, 30), c(1, 80, true), c(2, 80)])).toEqual([
      { amount: 90, eligible: [0, 2] },
      { amount: 100, eligible: [2] },
    ]);
  });

  it('ignores zero contributions', () => {
    expect(buildPots([c(0, 0, true), c(1, 2), c(2, 2)])).toEqual([{ amount: 4, eligible: [1, 2] }]);
  });
});

describe('awardPots', () => {
  it('gives each pot to its best eligible hand', () => {
    const pots = [{ amount: 150, eligible: [0, 1, 2] }, { amount: 100, eligible: [1, 2] }];
    const scores = { 0: 300, 1: 200, 2: 100 };
    const { pots: out, awards } = awardPots(pots, (s) => scores[s], [1, 2, 0]);
    expect(awards).toEqual({ 0: 150, 1: 100 });
    expect(out.map((p) => p.winners)).toEqual([[0], [1]]);
  });

  it('splits ties and gives odd units in seat order from the button', () => {
    const { pots, awards } = awardPots([{ amount: 5, eligible: [0, 2] }], () => 7, [1, 2, 0]);
    expect(awards).toEqual({ 2: 3, 0: 2 });
    expect(pots[0].winners).toEqual([2, 0]);
  });

  it('does not score a pot with one eligible seat', () => {
    const { awards } = awardPots([{ amount: 9, eligible: [4] }], () => { throw new Error('scored'); }, [4]);
    expect(awards).toEqual({ 4: 9 });
  });
});

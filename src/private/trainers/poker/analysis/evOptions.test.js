import { describe, it, expect, vi } from 'vitest';
import { mixSeed } from './grade.js';
import { MIN_ROLLOUTS, MAX_ROLLOUTS, estimateOptionEvs, pairedStderr, rankOptions } from './evOptions.js';

const OPTIONS = [
  { key: 'fold', action: 'fold', size: null },
  { key: 'call', action: 'call', size: null },
  { key: 'raise:20', action: 'raise', size: 20 },
];
// A fake rollout: calls win 3 or lose 1 by seed parity, raises win 10 or lose 5.
const fakeRollout = vi.fn((world, option, seed) => {
  const even = seed % 2 === 0;
  if (option.action === 'call') return even ? 3 : -1;
  return even ? 10 : -5;
});

describe('estimateOptionEvs', () => {
  it('rolls every non-fold option on the same seeds, round robin', () => {
    expect([MIN_ROLLOUTS, MAX_ROLLOUTS]).toEqual([12, 400]);
    fakeRollout.mockClear();
    const evs = estimateOptionEvs({}, OPTIONS, { seed: 99, maxRollouts: 6, rollout: fakeRollout });
    expect(evs.map((o) => [o.key, o.n])).toEqual([['fold', 6], ['call', 6], ['raise:20', 6]]);
    expect(fakeRollout).toHaveBeenCalledTimes(12);
    expect(fakeRollout.mock.calls.slice(0, 2).map((c) => [c[1].key, c[2]])).toEqual([['call', mixSeed(99, 0)], ['raise:20', mixSeed(99, 0)]]);
    expect(evs[0].mean).toBe(0);
    expect([...evs[0].samples]).toEqual([0, 0, 0, 0, 0, 0]);
    const evens = [0, 1, 2, 3, 4, 5].filter((n) => mixSeed(99, n) % 2 === 0).length;
    expect(evs[1].mean).toBeCloseTo((3 * evens - (6 - evens)) / 6, 10);
    expect(evs[2].mean).toBeCloseTo((10 * evens - 5 * (6 - evens)) / 6, 10);
  });

  it('stops at the deadline once the minimum rollouts are done', () => {
    let t = 0;
    const now = () => (t += 10);
    const evs = estimateOptionEvs({}, OPTIONS, { seed: 1, minRollouts: 3, maxRollouts: 1000, budgetMs: 25, now, rollout: fakeRollout });
    expect(evs[1].n).toBe(5);
  });

  it('pairs samples across options via common random numbers (same seed each round)', () => {
    const evs = estimateOptionEvs({}, OPTIONS, { seed: 7, maxRollouts: 8, rollout: fakeRollout });
    const call = evs[1].samples;
    const raise = evs[2].samples;
    // Same seed parity drives both options' outcome each round, so a call win (3) always pairs
    // with a raise win (10), and a call loss (-1) always pairs with a raise loss (-5).
    for (let n = 0; n < 8; n += 1) {
      expect(call[n] > 0).toBe(raise[n] > 0);
    }
  });
});

describe('pairedStderr and rankOptions', () => {
  it('computes the standard error of paired differences', () => {
    expect(pairedStderr(Float64Array.of(1, 2, 3), Float64Array.of(0, 0, 0))).toBeCloseTo(Math.sqrt(1 / 3), 10);
    expect(pairedStderr(Float64Array.of(1), Float64Array.of(0))).toBe(Infinity);
  });

  it('ranks by mean and keeps input order on ties', () => {
    const evs = [{ key: 'fold', mean: 0 }, { key: 'check', mean: 2 }, { key: 'bet:4', mean: 2 }, { key: 'bet:8', mean: 5 }];
    expect(rankOptions(evs).map((o) => o.key)).toEqual(['bet:8', 'check', 'bet:4', 'fold']);
  });
});

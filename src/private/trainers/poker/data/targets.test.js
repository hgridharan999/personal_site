import { describe, it, expect } from 'vitest';
import { PROFILE_STATS } from '../bots/contract.js';
import { TARGETS, POSITIONS, TENDENCY_MIN_N, targetFor, flagFor } from './targets.js';

const isRange = (r) => Array.isArray(r) && r.length === 2 && r[0] >= 0 && r[1] <= 1 && r[0] < r[1];

describe('TARGETS', () => {
  it('has an overall range for exactly the profile stats', () => {
    expect(Object.keys(TARGETS).sort()).toEqual([...PROFILE_STATS].sort());
    for (const key of PROFILE_STATS) expect(isRange(TARGETS[key].overall), key).toBe(true);
  });

  it('uses only the six positions, with valid ranges', () => {
    expect(POSITIONS).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    for (const [key, t] of Object.entries(TARGETS)) {
      for (const [position, range] of Object.entries(t.byPosition ?? {})) {
        expect(POSITIONS, `${key}.${position}`).toContain(position);
        expect(isRange(range), `${key}.${position}`).toBe(true);
      }
    }
  });

  it('never targets more preflop raising than voluntary play', () => {
    for (const position of POSITIONS) {
      const pfr = targetFor('pfr', position);
      const vpip = targetFor('vpip', position);
      expect(pfr[0], position).toBeLessThanOrEqual(vpip[0]);
      expect(pfr[1], position).toBeLessThanOrEqual(vpip[1]);
    }
  });
});

describe('targetFor', () => {
  it('prefers the positional range and falls back to overall', () => {
    expect(targetFor('vpip', 'BTN')).toEqual([0.38, 0.5]);
    expect(targetFor('vpip')).toEqual([0.22, 0.28]);
    expect(targetFor('threeBet', 'UTG')).toEqual(TARGETS.threeBet.overall);
    expect(targetFor('foldTo3Bet', 'BB')).toEqual([0.45, 0.6]);
    expect(targetFor('nope', 'BTN')).toBeNull();
  });
});

describe('flagFor', () => {
  const target = [0.22, 0.28];
  it('flags below, in (inclusive) and above', () => {
    expect(flagFor(0.2, 30, target)).toBe('below');
    expect(flagFor(0.22, 30, target)).toBe('in');
    expect(flagFor(0.28, 30, target)).toBe('in');
    expect(flagFor(0.3, 30, target)).toBe('above');
  });

  it('needs a value, a target and at least TENDENCY_MIN_N opportunities', () => {
    expect(TENDENCY_MIN_N).toBe(30);
    expect(flagFor(0.5, 29, target)).toBeNull();
    expect(flagFor(null, 0, target)).toBeNull();
    expect(flagFor(0.5, 40, null)).toBeNull();
    expect(flagFor(0.5, 5, target, 5)).toBe('above');
  });
});

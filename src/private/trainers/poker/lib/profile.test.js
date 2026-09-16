import { describe, it, expect, vi } from 'vitest';
import { emptyProfile } from '../bots/contract.js';
import { accumulateProfile, foldHandIntoProfile } from './profile.js';

describe('foldHandIntoProfile', () => {
  it('starts from an empty profile and delegates to the accumulator', () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const events = [{ type: 'start' }];
    expect(foldHandIntoProfile(null, 0, events, accumulate)).toEqual({ ...emptyProfile(), hands: 1 });
    expect(accumulate).toHaveBeenCalledWith(emptyProfile(), 0, events);
    const existing = { hands: 7, stats: {} };
    expect(foldHandIntoProfile(existing, 2, events, accumulate)).toEqual({ hands: 8, stats: {} });
  });

  it('uses an accumulator that returns a profile', () => {
    const result = accumulateProfile(emptyProfile(), 0, []);
    expect(result).toHaveProperty('hands');
    expect(result).toHaveProperty('stats');
  });
});

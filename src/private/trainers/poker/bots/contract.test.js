// src/private/trainers/poker/bots/contract.test.js
import { describe, it, expect } from 'vitest';
import { PROFILE_STATS, emptyProfile } from './contract.js';

describe('emptyProfile', () => {
  it('has all 14 stat keys set to {value: null, n: 0} and hands: 0', () => {
    const profile = emptyProfile();
    expect(profile.hands).toBe(0);
    expect(PROFILE_STATS.length).toBe(14);
    expect(Object.keys(profile.stats).sort()).toEqual(PROFILE_STATS.slice().sort());
    for (const key of PROFILE_STATS) {
      expect(profile.stats[key]).toEqual({ value: null, n: 0 });
    }
  });

  it('returns independent objects across calls', () => {
    const a = emptyProfile();
    const b = emptyProfile();
    a.hands = 5;
    a.stats.vpip.value = 0.5;
    a.stats.vpip.n = 10;
    expect(b.hands).toBe(0);
    expect(b.stats.vpip).toEqual({ value: null, n: 0 });
  });
});

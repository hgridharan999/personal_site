import { describe, it, expect, vi } from 'vitest';
import { loadPokerProfile, PROFILE_TIMEOUT_MS } from './profileLoader.js';

const PROFILE = { hands: 3, stats: { vpip: { value: 0.5, n: 2 } } };
const idleTimers = () => ({ setTimeoutImpl: vi.fn(() => 7), clearTimeoutImpl: vi.fn() });

describe('loadPokerProfile', () => {
  it('returns the server profile and clears its timer', async () => {
    const timers = idleTimers();
    const getProfile = async () => ({ profile: PROFILE, hands: 3, decisions: 5 });
    await expect(loadPokerProfile({ getProfile, ...timers })).resolves.toEqual(PROFILE);
    expect(PROFILE_TIMEOUT_MS).toBe(4000);
    expect(timers.setTimeoutImpl).toHaveBeenCalledWith(expect.any(Function), PROFILE_TIMEOUT_MS);
    expect(timers.clearTimeoutImpl).toHaveBeenCalledWith(7);
  });

  it('returns null on a request error or a malformed body', async () => {
    await expect(loadPokerProfile({ getProfile: async () => { throw new Error('404'); }, ...idleTimers() })).resolves.toBeNull();
    for (const body of [null, {}, { profile: { hands: 'x', stats: {} } }, { profile: { hands: 1, stats: null } }]) {
      await expect(loadPokerProfile({ getProfile: async () => body, ...idleTimers() })).resolves.toBeNull();
    }
  });

  it('returns null when the server is slower than the timeout', async () => {
    const setTimeoutImpl = vi.fn((fn) => { fn(); return 1; });
    const result = loadPokerProfile({ getProfile: () => new Promise(() => {}), setTimeoutImpl, clearTimeoutImpl: vi.fn() });
    await expect(result).resolves.toBeNull();
  });
});

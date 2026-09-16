import { getPokerProfile } from './api.js';

// Bots get the hero's profile at sit-down (spec §6.1). The table must never wait long for it:
// on any failure or after PROFILE_TIMEOUT_MS the bots simply start without a profile (null).
export const PROFILE_TIMEOUT_MS = 4000;

const isProfile = (p) => p !== null && typeof p === 'object'
  && Number.isInteger(p.hands) && p.stats !== null && typeof p.stats === 'object';

export async function loadPokerProfile({
  getProfile = getPokerProfile,
  timeoutMs = PROFILE_TIMEOUT_MS,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeoutImpl(() => resolve(null), timeoutMs);
  });
  try {
    const body = await Promise.race([getProfile(), timedOut]);
    return isProfile(body?.profile) ? body.profile : null;
  } catch {
    return null;
  } finally {
    clearTimeoutImpl(timer);
  }
}

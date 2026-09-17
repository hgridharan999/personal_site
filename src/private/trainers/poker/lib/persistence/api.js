import { request } from '../../../lib/api.js';

// Poker endpoints (spec §6.3). Amounts in bodies and responses are integer units.
const BASE = '/api/trainers/poker';

export const openPokerSession = (body, opts) =>
  request(`${BASE}/sessions`, { method: 'POST', body, ...opts });

export const closePokerSession = (id, body, opts) =>
  request(`${BASE}/sessions?id=${encodeURIComponent(id)}`, { method: 'PATCH', body, ...opts });

export const savePokerHands = (body, opts) =>
  request(`${BASE}/hands`, { method: 'POST', body, ...opts });

export const getPokerSession = (id, opts) =>
  request(`${BASE}/sessions?id=${encodeURIComponent(id)}`, opts);

export const listOpenPokerSessions = (opts) => request(`${BASE}/sessions?status=open`, opts);

export const getPokerProfile = (opts) => request(`${BASE}/profile`, opts);

// Phase 5: review pages, the replayer and re-grading.
export const getPokerSessionPage = (id, afterHandNo = 0, opts) =>
  request(`${BASE}/sessions?id=${encodeURIComponent(id)}${afterHandNo > 0 ? `&afterHandNo=${afterHandNo}` : ''}`, opts);

export const listRecentPokerSessions = (opts) => request(`${BASE}/sessions?status=recent`, opts);

export const getPokerHand = (id, opts) => request(`${BASE}/hands?id=${encodeURIComponent(id)}`, opts);

export function listUngradedPokerHands({ sessionId, belowVersion, afterHandNo = 0, limit = 10 }, opts) {
  const query = new URLSearchParams({
    ungraded: '1', sessionId, belowVersion: String(belowVersion), afterHandNo: String(afterHandNo), limit: String(limit),
  });
  return request(`${BASE}/hands?${query}`, opts);
}

export const savePokerHandGrades = (body, opts) => request(`${BASE}/hands`, { method: 'PATCH', body, ...opts });

// Phase 6: the leak tracker's stats endpoint.
export const getPokerStats = (opts) => request(`${BASE}/stats`, opts);

export const getPokerSpotHands = (spot, opts) =>
  request(`${BASE}/stats?spot=${encodeURIComponent(spot)}`, opts);

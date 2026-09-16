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

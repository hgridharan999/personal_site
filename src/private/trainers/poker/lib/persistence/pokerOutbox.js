import { ApiError } from '../../../lib/api.js';
import { createOutbox, isPermanentError } from '../../../lib/outbox.js';
import * as pokerApi from './api.js';

// Poker saves use their own outbox (separate storage key), so the Zetamac/Optiver
// "waiting to sync" banner never counts poker hands. Entries are grouped by session,
// so open → hands → close always reach the server in that order.

export const POKER_OUTBOX_KEY = 'pk-outbox-v1';
// A hand or close can outrun its session row only briefly; after this many attempts
// the entry is marked failed so it can be discarded instead of retrying forever.
export const SESSION_NOT_FOUND_RETRIES = 10;

export const openEntry = (session) => ({ kind: 'open', id: `open:${session.id}`, sessionId: session.id, body: session });

export const handEntry = (item) => ({
  kind: 'hand',
  id: `hand:${item.hand.id}`,
  sessionId: item.hand.sessionId,
  body: { hands: [item] },
});

export const closeEntry = ({ id, endedAt }) => ({ kind: 'close', id: `close:${id}`, sessionId: id, body: { endedAt } });

export function sendPokerPayload(payload, api = pokerApi) {
  switch (payload?.kind) {
    case 'open':
      return api.openPokerSession(payload.body);
    case 'hand':
      return api.savePokerHands(payload.body);
    case 'close':
      return api.closePokerSession(payload.sessionId, payload.body);
    default:
      return Promise.reject(new ApiError(400, 'UNKNOWN_ENTRY_KIND', `Unknown poker save: ${String(payload?.kind)}`));
  }
}

export function isPokerPermanentError(err, entry) {
  if (err instanceof ApiError && err.code === 'SESSION_NOT_FOUND') {
    return entry.attempts + 1 >= SESSION_NOT_FOUND_RETRIES;
  }
  return isPermanentError(err);
}

export function createPokerOutbox({ storage, api = pokerApi, now }) {
  return createOutbox({
    storage,
    now,
    key: POKER_OUTBOX_KEY,
    send: (payload) => sendPokerPayload(payload, api),
    idOf: (payload) => payload?.id,
    groupOf: (payload) => (typeof payload?.sessionId === 'string' ? payload.sessionId : null),
    isPermanent: isPokerPermanentError,
  });
}

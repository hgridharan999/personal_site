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
// A server error that persists (a row Postgres keeps rejecting) would otherwise hold its whole
// session group back forever; after this many attempts it is marked failed. Network errors
// (not an ApiError) are never counted: offline saves wait as long as it takes.
export const SERVER_ERROR_RETRIES = 20;

export const openEntry = (session) => ({ kind: 'open', id: `open:${session.id}`, sessionId: session.id, body: session });

export const handEntry = (item) => ({
  kind: 'hand',
  id: `hand:${item.hand.id}`,
  sessionId: item.hand.sessionId,
  body: { hands: [item] },
});

/** An explicit close from the table; a summary without endedAt still sends null, never undefined. */
export const closeEntry = (summary) => ({
  kind: 'close',
  id: `close:${summary.id}`,
  sessionId: summary.id,
  body: { endedAt: summary.endedAt ?? null },
});

// A stale close (lobby cleanup) has its own id in the same group, so an explicit close queued
// while it is still pending is kept instead of being deduplicated into it.
export const staleCloseEntry = (sessionId) => ({
  kind: 'close',
  id: `stale-close:${sessionId}`,
  sessionId,
  body: { endedAt: null },
});

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
  if (err instanceof ApiError && err.status >= 500) {
    return entry.attempts + 1 >= SERVER_ERROR_RETRIES;
  }
  return isPermanentError(err);
}

// True when this session's open was rejected (failed, or failed and then discarded on this page):
// its row will never exist, so waiting out SESSION_NOT_FOUND retries is pointless.
function openHasFailed(snapshot, sessionId) {
  const openId = `open:${sessionId}`;
  return snapshot.failed.some((f) => f.id === openId) || snapshot.discardedIds.includes(openId);
}

export function createPokerOutbox({ storage, api = pokerApi, now }) {
  const isPermanent = (err, entry) => {
    const { kind, sessionId } = entry.payload ?? {};
    if (err instanceof ApiError && err.code === 'SESSION_NOT_FOUND' && (kind === 'hand' || kind === 'close')
      && openHasFailed(outbox.snapshot(), sessionId)) {
      return true;
    }
    return isPokerPermanentError(err, entry);
  };
  const outbox = createOutbox({
    storage,
    now,
    key: POKER_OUTBOX_KEY,
    send: (payload) => sendPokerPayload(payload, api),
    idOf: (payload) => payload?.id,
    groupOf: (payload) => (typeof payload?.sessionId === 'string' ? payload.sessionId : null),
    isPermanent,
  });
  return outbox;
}

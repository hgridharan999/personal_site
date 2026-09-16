import * as pokerApi from './api.js';
import { staleCloseEntry } from './pokerOutbox.js';

// Spec §6.1: a session left open (tab closed) is closed on a later load of /me/poker at its
// last saved hand time. A session counts as stale only after 15 minutes without a saved hand
// and with nothing queued for it on this device, so a table still open in another tab,
// or a session whose hands are waiting offline, is never closed early.
//
// Before checking hasQueued, the outbox is refreshed from storage: another tab may have
// written a pending or failed entry for this session since this tab last read it, and a
// stale read here would double-close it. hasQueued stays true for a session with a failed
// (not just pending) entry queued for it, so auto-close correctly holds off on those too —
// the failed entry itself is surfaced via pokerOutbox.snapshot().failed for the UI to show
// with a discard option (see pokerOutboxInstance.js).
export const STALE_AFTER_MS = 15 * 60 * 1000;

export async function closeStaleSessions({ api = pokerApi, outbox, kick = () => {}, now = Date.now }) {
  let sessions;
  try {
    ({ sessions } = await api.listOpenPokerSessions());
  } catch {
    return [];
  }
  if (!Array.isArray(sessions)) return [];
  outbox.refresh();
  const stale = sessions.filter((s) => now() - Date.parse(s.lastActivityAt) >= STALE_AFTER_MS && !outbox.hasQueued(s.id));
  stale.forEach((s) => outbox.enqueue(staleCloseEntry(s.id)));
  if (stale.length > 0) kick();
  return stale.map((s) => s.id);
}

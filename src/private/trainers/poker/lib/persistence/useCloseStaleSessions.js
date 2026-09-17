import { useEffect } from 'react';
import { pokerOutbox, ensurePokerWorker } from './pokerOutboxInstance.js';
import { closeStaleSessions } from './staleSessions.js';

/**
 * Call once in the /me/poker lobby: closes sessions left open by a closed tab (spec §6.1).
 * Saves queued before a reload are flushed first, so a session whose hands were only waiting
 * to sync is judged by its real last activity.
 */
export function useCloseStaleSessions() {
  useEffect(() => {
    let live = true;
    (async () => {
      await ensurePokerWorker().run();
      // StrictMode's discarded first mount (or leaving the lobby mid-flush) skips the check.
      if (!live) return;
      await closeStaleSessions({ outbox: pokerOutbox, kick: () => { ensurePokerWorker().run(); } });
    })().catch((err) => {
      console.warn('poker: could not close stale sessions', err);
    });
    return () => { live = false; };
  }, []);
}

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { pokerOutbox, ensurePokerWorker } from './pokerOutboxInstance.js';
import { pokerSaveStatus } from './saveStatus.js';

/**
 * The table's save state. Adds `failedEntries` ({ id, lastError }[], every rejected save) to the
 * pokerSaveStatus result, so each one can be shown with its own Discard action.
 */
export function usePokerSaveStatus() {
  useEffect(() => { ensurePokerWorker(); }, []);
  const snapshot = useSyncExternalStore(pokerOutbox.subscribe, pokerOutbox.snapshot);
  return useMemo(() => ({ ...pokerSaveStatus(snapshot), failedEntries: snapshot.failed }), [snapshot]);
}

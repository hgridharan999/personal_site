import { browserStorage, startOutboxWorker } from '../../../lib/outbox.js';
import { createPokerOutbox } from './pokerOutbox.js';
import { createPokerPersistence } from './persistence.js';

// Browser singletons. Importing this module never touches the network; the worker starts
// on the first ensurePokerWorker() call (from the table, the lobby or a save).
//
// pokerOutbox is exported as the raw outbox instance (not wrapped), so its snapshot() —
// { pendingIds, failed: [{ id, lastError }], discardedIds } — and its discard(id) are both
// already available to any UI that imports this module. That is how the Task 11 lobby/table
// UI surfaces failed poker saves (hasQueued() stays true for a session with a failed entry,
// which holds off closeStaleSessions for it, so the UI must offer a discard for that entry).
export const pokerOutbox = createPokerOutbox({ storage: browserStorage() });

let worker = null;

export function ensurePokerWorker() {
  worker ??= startOutboxWorker(pokerOutbox);
  return worker;
}

export const pokerPersistence = createPokerPersistence({
  outbox: pokerOutbox,
  kick: () => { ensurePokerWorker().run(); },
});

/** Save state for the table, from a poker outbox snapshot. */
export function pokerSaveStatus({ pendingIds, failed }) {
  if (failed.length > 0) {
    return { status: 'failed', pending: pendingIds.length, failed: failed.length, failedId: failed[0].id, lastError: failed[0].lastError };
  }
  if (pendingIds.length > 0) {
    return { status: 'saving', pending: pendingIds.length, failed: 0, failedId: null, lastError: null };
  }
  return { status: 'saved', pending: 0, failed: 0, failedId: null, lastError: null };
}

export function saveStatusText({ status, pending, failed }) {
  // Only the count: the per-entry lastError is left to the failed-entries list (PokerSaveStatus.jsx),
  // so the alert does not repeat details the list already shows.
  if (status === 'failed') {
    return `${failed} save${failed === 1 ? '' : 's'} rejected by the server`;
  }
  if (status === 'saving') return `Saving… ${pending} waiting to sync (kept on this device and retried)`;
  return 'All hands saved';
}

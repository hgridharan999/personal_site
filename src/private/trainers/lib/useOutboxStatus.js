import { useEffect, useSyncExternalStore } from 'react';
import { outbox, ensureWorker } from './outboxInstance.js';

export function useOutboxStatus() {
  useEffect(() => { ensureWorker(); }, []);
  return useSyncExternalStore(outbox.subscribe, outbox.snapshot);
}

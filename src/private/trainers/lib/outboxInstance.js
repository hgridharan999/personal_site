import { saveSession } from './api.js';
import { createOutbox, memoryStorage, startOutboxWorker } from './outbox.js';

function browserStorage() {
  try {
    const s = window.localStorage;
    s.setItem('__trn_probe', '1');
    s.removeItem('__trn_probe');
    return s;
  } catch {
    return memoryStorage();
  }
}

export const outbox = createOutbox({ storage: browserStorage(), send: (payload) => saveSession(payload) });

let worker = null;

export function ensureWorker() {
  worker ??= startOutboxWorker(outbox);
  return worker;
}

export async function submitGame(payload) {
  outbox.enqueue(payload);
  await ensureWorker().run();
}

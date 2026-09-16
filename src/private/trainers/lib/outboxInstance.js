import { saveSession } from './api.js';
import { browserStorage, createOutbox, startOutboxWorker } from './outbox.js';

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

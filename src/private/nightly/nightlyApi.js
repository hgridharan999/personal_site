import { request } from '../trainers/lib/api.js';
import { isBusy } from './view.js';

// The /nightly page's calls to /api/nightly. Each returns the parsed JSON; errors throw ApiError
// (from the shared request helper). The public notes list is fetched by NotesPage itself, so
// nothing from src/private reaches the public bundle.

const PATH = '/api/nightly';

/** `request` drops the status, but a 202 means "someone else is on it", so read it on the way through. */
async function call(action, { method = 'GET', body, fetchImpl = fetch } = {}) {
  let status = 0;
  const tracked = async (...args) => {
    const res = await fetchImpl(...args);
    status = res.status;
    return res;
  };
  const data = await request(`${PATH}?action=${action}`, { method, body, fetchImpl: tracked });
  return status === 202 ? { inProgress: true } : data;
}

export const getToday = (opts) => call('today', opts);
export const generate = (opts) => call('generate', { ...opts, method: 'POST' });
export const submit = (body, opts) => call('submit', { ...opts, method: 'POST', body });
export const grade = (sessionId, opts) => call('grade', { ...opts, method: 'POST', body: { sessionId } });
export const publish = (sessionId, opts) => call('publish', { ...opts, method: 'POST', body: { sessionId } });

export const POLL_INTERVAL_MS = 5000;
export const POLL_LIMIT_MS = 6 * 60 * 1000;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Re-reads `today` every 5s while the session is generating or grading, for up to 6 minutes.
 * Resolves `{ today, timedOut }`, or null once `cancelled()` turns true (the page unmounted).
 * A failed read rejects.
 */
export async function pollToday({
  fetchToday = getToday,
  sleep = wait,
  now = Date.now,
  cancelled = () => false,
  intervalMs = POLL_INTERVAL_MS,
  limitMs = POLL_LIMIT_MS,
} = {}) {
  const start = now();
  for (;;) {
    await sleep(intervalMs);
    if (cancelled()) return null;
    const today = await fetchToday();
    if (cancelled()) return null;
    if (!isBusy(today.session)) return { today, timedOut: false };
    if (now() - start >= limitMs) return { today, timedOut: true };
  }
}

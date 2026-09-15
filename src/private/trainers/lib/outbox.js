import { ApiError } from './api.js';

// Durable queue for finished games: a game is never lost to a failed request.
// Entries persist in localStorage (memory fallback) until the server accepts them.

export const OUTBOX_KEY = 'trn-outbox-v1';
const AUTH_RETRY_MS = 60000;
const FLUSH_ERROR_RETRY_MS = 60000;

// Safely derives a message from anything a rejected promise might carry,
// including undefined/null, so a malformed rejection can never crash a caller.
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

export const backoffMs = (attempts) => Math.min(60000, 1000 * 2 ** Math.max(0, attempts - 1));

export function isPermanentError(err) {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);
}

export function createOutbox({ storage, send, now = Date.now, key = OUTBOX_KEY }) {
  let entries = load();
  let snap = buildSnapshot();
  let inFlight = null;
  const listeners = new Set();

  function load() {
    try {
      const parsed = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function buildSnapshot() {
    return {
      pendingIds: entries.filter((e) => e.status === 'pending').map((e) => e.id),
      failed: entries.filter((e) => e.status === 'failed').map(({ id, lastError }) => ({ id, lastError })),
    };
  }

  function commit(next) {
    entries = next;
    try {
      storage.setItem(key, JSON.stringify(entries));
    } catch {
      // storage blocked or full: keep the in-memory queue for this page's lifetime
    }
    snap = buildSnapshot();
    listeners.forEach((l) => l());
  }

  function update(id, patch) {
    commit(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function enqueue(payload) {
    const id = payload.session.id;
    if (entries.some((e) => e.id === id)) return;
    commit([...entries, { id, payload, attempts: 0, nextAt: 0, status: 'pending', lastError: null }]);
  }

  async function runFlush() {
    let sent = 0;
    for (const entry of entries.filter((e) => e.status === 'pending' && e.nextAt <= now())) {
      try {
        await send(entry.payload);
        commit(entries.filter((e) => e.id !== entry.id));
        sent += 1;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return { sent, authRequired: true };
        if (isPermanentError(err)) {
          update(entry.id, { status: 'failed', lastError: errorMessage(err) });
        } else {
          const attempts = entry.attempts + 1;
          update(entry.id, { attempts, nextAt: now() + backoffMs(attempts), lastError: errorMessage(err) });
        }
      }
    }
    return { sent, authRequired: false };
  }

  function flush() {
    inFlight ??= runFlush().finally(() => { inFlight = null; });
    return inFlight;
  }

  function nextDueIn() {
    const pending = entries.filter((e) => e.status === 'pending');
    if (pending.length === 0) return null;
    return Math.max(0, Math.min(...pending.map((e) => e.nextAt)) - now());
  }

  return {
    enqueue,
    flush,
    nextDueIn,
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function startOutboxWorker(outbox, { win = window, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  let timer = null;
  let stopped = false;
  // Concurrent run() calls (from online, a due timer, and every submitGame)
  // share this single promise so they can never race each other into
  // scheduling two live timers.
  let inFlightRun = null;

  function clearTimer() {
    clearTimeoutImpl(timer);
    timer = null;
  }

  function scheduleNext(due) {
    clearTimer();
    if (due !== null && !stopped) {
      timer = setTimeoutImpl(onTimerDue, due);
    }
  }

  function onTimerDue() {
    timer = null;
    if (stopped) return;
    run();
  }

  async function runOnce() {
    clearTimer();
    let due;
    try {
      const { authRequired } = await outbox.flush();
      due = authRequired ? AUTH_RETRY_MS : outbox.nextDueIn();
    } catch {
      // Defensive: flush() is documented to always resolve, but if it ever
      // rejects anyway, don't let the worker die - just retry later.
      due = FLUSH_ERROR_RETRY_MS;
    }
    if (stopped) return;
    scheduleNext(due);
  }

  function run() {
    if (stopped) return Promise.resolve();
    if (!inFlightRun) {
      inFlightRun = runOnce().finally(() => {
        inFlightRun = null;
      });
    }
    return inFlightRun;
  }

  win.addEventListener('online', run);
  run();

  return {
    run,
    stop() {
      stopped = true;
      win.removeEventListener('online', run);
      clearTimer();
    },
  };
}

import { ApiError } from './api.js';

// Durable queue for finished games: a game is never lost to a failed request.
// Entries persist in localStorage (memory fallback) until the server accepts them.
// Several tabs can share one storage key: every mutation re-reads storage and
// applies its change to that fresh list, so tabs never erase each other's games.
// Optional ordered groups (groupOf): an entry is sent only after every earlier
// pending entry of its group was sent, so a poker session row is saved before its
// hands and its close. A failed (rejected) entry does not hold its group back.

export const OUTBOX_KEY = 'trn-outbox-v1';
export const MAX_ERROR_CHARS = 240;
const MAX_ERROR_DETAILS = 3;
const AUTH_RETRY_MS = 60000;
const FLUSH_ERROR_RETRY_MS = 60000;
const STATUSES = ['pending', 'failed'];

// Safely derives a message from anything a rejected promise might carry,
// including undefined/null, so a malformed rejection can never crash a caller.
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// Messages from a z.flattenError() shape: { formErrors: string[], fieldErrors: { field: string[] } }.
function detailMessages(details) {
  if (!details || typeof details !== 'object') return [];
  const form = Array.isArray(details.formErrors) ? details.formErrors.filter((m) => typeof m === 'string') : [];
  const fieldErrors = details.fieldErrors && typeof details.fieldErrors === 'object' ? details.fieldErrors : {};
  const fields = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    (Array.isArray(messages) ? messages.filter((m) => typeof m === 'string').map((m) => `${field}: ${m}`) : []));
  return [...form, ...fields];
}

/** Concise, bounded description of a send failure, including validation details when present. */
export function describeError(err) {
  const message = errorMessage(err);
  const parts = err instanceof ApiError ? detailMessages(err.details).slice(0, MAX_ERROR_DETAILS) : [];
  const text = parts.length > 0 ? `${message} (${parts.join('; ')})` : message;
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS - 1)}…` : text;
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** window.localStorage when it is usable (not blocked or missing), otherwise memory storage. */
export function browserStorage(win = globalThis.window) {
  try {
    const s = win.localStorage;
    s.setItem('__trn_probe', '1');
    s.removeItem('__trn_probe');
    return s;
  } catch {
    return memoryStorage();
  }
}

export const backoffMs = (attempts) => Math.min(60000, 1000 * 2 ** Math.max(0, attempts - 1));

export function isPermanentError(err) {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);
}

const isCount = (n) => Number.isFinite(n) && n >= 0;
const sessionPayloadId = (payload) => payload?.session?.id;
const ungrouped = () => null;

function isValidEntry(e, idOf) {
  return (
    e !== null && typeof e === 'object'
    && typeof e.id === 'string'
    && idOf(e.payload) === e.id
    && isCount(e.attempts)
    && isCount(e.nextAt)
    && STATUSES.includes(e.status)
    && (e.lastError === null || typeof e.lastError === 'string')
  );
}

export function createOutbox({
  storage,
  send,
  now = Date.now,
  key = OUTBOX_KEY,
  idOf = sessionPayloadId,
  groupOf = ungrouped,
  isPermanent = isPermanentError,
}) {
  let entries = [];
  // After a failed write (storage full or blocked) storage is stale, so the
  // in-memory list stays authoritative until a write succeeds again.
  let writeFailed = false;
  let inFlight = null;
  const listeners = new Set();
  // Ids discarded during this page's lifetime, kept in memory only (never
  // persisted): a discarded game must keep reading as discarded here even
  // after it's gone from storage, instead of falling back to "saved".
  const discardedIds = new Set();

  // Stored entries, keeping only well-formed ones; null when storage can't be read.
  function readStored() {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.filter((e) => isValidEntry(e, idOf)) : [];
    } catch {
      return [];
    }
  }

  function load() {
    const stored = writeFailed ? null : readStored();
    return stored ?? entries;
  }

  function buildSnapshot() {
    return {
      pendingIds: entries.filter((e) => e.status === 'pending').map((e) => e.id),
      failed: entries.filter((e) => e.status === 'failed').map(({ id, lastError }) => ({ id, lastError })),
      discardedIds: [...discardedIds],
    };
  }

  entries = load();
  let snap = buildSnapshot();

  function publish(next) {
    entries = next;
    snap = buildSnapshot();
    listeners.forEach((l) => l());
  }

  // Applies fn to the freshest list, persists it, then updates memory + subscribers.
  function mutate(fn) {
    const next = fn(load());
    try {
      storage.setItem(key, JSON.stringify(next));
      writeFailed = false;
    } catch {
      // storage blocked or full: keep the in-memory queue for this page's lifetime
      writeFailed = true;
    }
    publish(next);
  }

  function refresh() {
    publish(load());
  }

  function update(id, patchFn) {
    mutate((list) => list.map((e) => (e.id === id ? { ...e, ...patchFn(e) } : e)));
  }

  function enqueue(payload) {
    const id = idOf(payload);
    mutate((list) => (list.some((e) => e.id === id)
      ? list
      : [...list, { id, payload, attempts: 0, nextAt: 0, status: 'pending', lastError: null }]));
  }

  function discard(id) {
    mutate((list) => list.filter((e) => {
      const remove = e.id === id && e.status === 'failed';
      if (remove) discardedIds.add(id);
      return !remove;
    }));
  }

  async function runFlush() {
    let sent = 0;
    const startedAt = now();
    // Groups whose earlier entry is still unsent in this pass: their later entries wait.
    const held = new Set();
    for (const entry of entries.filter((e) => e.status === 'pending')) {
      const group = groupOf(entry.payload);
      if (group !== null && held.has(group)) continue;
      if (entry.nextAt > startedAt) {
        if (group !== null) held.add(group);
        continue;
      }
      try {
        await send(entry.payload);
        mutate((list) => list.filter((e) => e.id !== entry.id));
        sent += 1;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return { sent, authRequired: true };
        const lastError = describeError(err);
        if (isPermanent(err, entry)) {
          update(entry.id, () => ({ status: 'failed', lastError }));
        } else {
          if (group !== null) held.add(group);
          update(entry.id, (e) => ({ attempts: e.attempts + 1, nextAt: now() + backoffMs(e.attempts + 1), lastError }));
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
    const due = [];
    const heads = new Set();
    for (const e of entries) {
      if (e.status !== 'pending') continue;
      const group = groupOf(e.payload);
      if (group !== null) {
        if (heads.has(group)) continue; // waits behind an earlier entry of its group
        heads.add(group);
      }
      due.push(e.nextAt);
    }
    if (due.length === 0) return null;
    return Math.max(0, Math.min(...due) - now());
  }

  function hasQueued(group) {
    return entries.some((e) => groupOf(e.payload) === group);
  }

  return {
    key,
    enqueue,
    flush,
    discard,
    refresh,
    nextDueIn,
    hasQueued,
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function startOutboxWorker(outbox, { win = window, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const watchedKey = outbox.key ?? OUTBOX_KEY;
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

  // Another tab changed this outbox: show its entries here and send anything
  // due. A null key means the whole storage area was cleared (e.g.
  // localStorage.clear()), which must also trigger a refresh.
  function onStorage(event) {
    if (event.key !== null && event.key !== watchedKey) return;
    outbox.refresh();
    run();
  }

  win.addEventListener('online', run);
  win.addEventListener('storage', onStorage);
  run();

  return {
    run,
    stop() {
      stopped = true;
      win.removeEventListener('online', run);
      win.removeEventListener('storage', onStorage);
      clearTimer();
    },
  };
}

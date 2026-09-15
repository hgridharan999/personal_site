# Phase 4a: Client Plumbing (Tasks 11–12)

Read `00-overview.md` first. Depends on Tasks 9–10 (API contracts).

---

### Task 11: API client and durable outbox

**Files:**
- Create: `src/private/trainers/lib/api.js`
- Create: `src/private/trainers/lib/outbox.js`
- Create: `src/private/trainers/lib/outboxInstance.js`
- Create: `src/private/trainers/lib/useOutboxStatus.js`
- Test: `src/private/trainers/lib/api.test.js`, `src/private/trainers/lib/outbox.test.js`

**Interfaces:**
- Consumes: the API contracts from Tasks 9–10 (`/api/trainers/sessions`, `/stats`, `/drill`).
- Produces:
  - `lib/api.js`:
    - `class ApiError extends Error { status, code, details }`
    - `request(path, { method?, body?, fetchImpl? }): Promise<any>`, which throws `ApiError` on a non-2xx status. A network failure rejects with the fetch `TypeError`.
    - `saveSession(payload)`
    - `getSession(id)`
    - `getStats({ trainer, mode = 'standard', configKey? })`
    - `getDrill()`
  - `lib/outbox.js`:
    - `OUTBOX_KEY = 'trn-outbox-v1'`
    - `memoryStorage(): { getItem, setItem, removeItem }`
    - `backoffMs(attempts): number`, computed as `min(60000, 1000 × 2^(attempts−1))`, so attempt 1 waits 1 s
    - `isPermanentError(err): boolean`, true for `ApiError` with 400–499 except 401, 408 and 429
    - `createOutbox({ storage, send, now = Date.now, key = OUTBOX_KEY })` returns:
      - `enqueue(payload): void`, de-duplicated by `payload.session.id`
      - `flush(): Promise<{ sent: number, authRequired: boolean }>`, where concurrent calls share one in-flight flush
      - `snapshot(): { pendingIds: string[], failed: { id, lastError }[] }`, the same object identity until the next change
      - `subscribe(listener): () => void`
      - `nextDueIn(): number | null`, the ms until the earliest pending retry (0 when one is due), or null when nothing is pending
    - `startOutboxWorker(outbox, { win = window, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout }): { run: () => Promise<void>, stop: () => void }`. It flushes immediately, on `online`, and when the earliest retry comes due; after `authRequired` it waits 60 s.
  - `lib/outboxInstance.js`: `outbox` (a singleton backed by localStorage, falling back to memory), `submitGame(payload): Promise<void>` (enqueues, starts the worker if needed, and flushes), `ensureWorker()`
  - `lib/useOutboxStatus.js`: `useOutboxStatus(): { pendingIds, failed }` (starts the worker once)

Outbox entry stored in localStorage: `{ id, payload, attempts, nextAt, status: 'pending'|'failed', lastError: string|null }`.

- [ ] **Step 1: Write the failing tests**

`src/private/trainers/lib/api.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { ApiError, request, getStats } from './api.js';

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('request', () => {
  it('returns parsed JSON on success and sends JSON bodies', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { saved: true }));
    await expect(request('/api/x', { method: 'POST', body: { a: 1 }, fetchImpl })).resolves.toEqual({ saved: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/x', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}',
    });
  });
  it('throws ApiError with status/code/details on failure', async () => {
    const fetchImpl = async () => jsonResponse(400, { error: 'Bad', code: 'VALIDATION_ERROR', details: { x: 1 } });
    const err = await request('/api/x', { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Bad', details: { x: 1 } });
  });
  it('handles non-JSON error bodies', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, json: async () => { throw new Error('no json'); } });
    const err = await request('/api/x', { fetchImpl }).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'HTTP_ERROR', message: 'Request failed (502)' });
  });
});

describe('getStats', () => {
  it('builds the query string', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    await getStats({ trainer: 'zetamac', configKey: 'a'.repeat(64) }, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(`/api/trainers/stats?trainer=zetamac&mode=standard&configKey=${'a'.repeat(64)}`);
  });
});
```

`src/private/trainers/lib/outbox.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from './api.js';
import { OUTBOX_KEY, memoryStorage, backoffMs, isPermanentError, createOutbox, startOutboxWorker } from './outbox.js';

const payload = (id) => ({ session: { id }, attempts: [] });

function setup({ send = vi.fn(async () => ({ saved: true })), storage = memoryStorage() } = {}) {
  let t = 1000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const outbox = createOutbox({ storage, send, now: clock.now });
  return { outbox, send, storage, clock };
}

describe('helpers', () => {
  it('backoffMs doubles from 1s and caps at 60s', () => {
    expect([1, 2, 3, 6, 7, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 32000, 60000, 60000]);
  });
  it('isPermanentError', () => {
    expect(isPermanentError(new ApiError(400, 'VALIDATION_ERROR', 'x'))).toBe(true);
    expect(isPermanentError(new ApiError(401, 'UNAUTHORIZED', 'x'))).toBe(false);
    expect(isPermanentError(new ApiError(429, 'RATE_LIMITED', 'x'))).toBe(false);
    expect(isPermanentError(new ApiError(500, 'INTERNAL', 'x'))).toBe(false);
    expect(isPermanentError(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('createOutbox', () => {
  it('enqueue de-duplicates and persists', () => {
    const { outbox, storage } = setup();
    outbox.enqueue(payload('a'));
    outbox.enqueue(payload('a'));
    expect(outbox.snapshot().pendingIds).toEqual(['a']);
    expect(JSON.parse(storage.getItem(OUTBOX_KEY))).toHaveLength(1);
  });

  it('flush sends and removes on success', async () => {
    const { outbox, send } = setup();
    outbox.enqueue(payload('a'));
    await expect(outbox.flush()).resolves.toEqual({ sent: 1, authRequired: false });
    expect(send).toHaveBeenCalledWith(payload('a'));
    expect(outbox.snapshot()).toEqual({ pendingIds: [], failed: [] });
    expect(outbox.nextDueIn()).toBeNull();
  });

  it('retries transient failures with backoff and not before due', async () => {
    const send = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const { outbox, clock } = setup({ send });
    outbox.enqueue(payload('a'));
    await outbox.flush();
    expect(outbox.nextDueIn()).toBe(1000);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    clock.advance(1000);
    expect(outbox.nextDueIn()).toBe(0);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(outbox.nextDueIn()).toBe(2000);
    expect(outbox.snapshot().pendingIds).toEqual(['a']);
  });

  it('marks permanent errors failed and never retries them', async () => {
    const send = vi.fn(async () => { throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session payload'); });
    const { outbox, clock } = setup({ send });
    outbox.enqueue(payload('a'));
    await outbox.flush();
    expect(outbox.snapshot()).toEqual({ pendingIds: [], failed: [{ id: 'a', lastError: 'Invalid session payload' }] });
    clock.advance(120000);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.nextDueIn()).toBeNull();
  });

  it('stops on 401 and keeps the entry pending', async () => {
    const send = vi.fn(async () => { throw new ApiError(401, 'UNAUTHORIZED', 'Sign in required'); });
    const { outbox } = setup({ send });
    outbox.enqueue(payload('a'));
    outbox.enqueue(payload('b'));
    await expect(outbox.flush()).resolves.toEqual({ sent: 0, authRequired: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.snapshot().pendingIds).toEqual(['a', 'b']);
  });

  it('survives reloads via storage, and corrupt storage', async () => {
    const storage = memoryStorage();
    setup({ storage }).outbox.enqueue(payload('a'));
    expect(setup({ storage }).outbox.snapshot().pendingIds).toEqual(['a']);
    storage.setItem(OUTBOX_KEY, '{not json');
    expect(setup({ storage }).outbox.snapshot().pendingIds).toEqual([]);
  });

  it('works when storage throws', async () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem() {} };
    const { outbox } = setup({ storage: broken });
    outbox.enqueue(payload('a'));
    expect(outbox.snapshot().pendingIds).toEqual(['a']);
    await outbox.flush();
    expect(outbox.snapshot().pendingIds).toEqual([]);
  });

  it('concurrent flushes send once; snapshot identity is stable; subscribers notified', async () => {
    let release;
    const send = vi.fn(() => new Promise((r) => { release = r; }));
    const { outbox } = setup({ send });
    const listener = vi.fn();
    const unsubscribe = outbox.subscribe(listener);
    outbox.enqueue(payload('a'));
    const s1 = outbox.snapshot();
    expect(outbox.snapshot()).toBe(s1);
    const f1 = outbox.flush();
    const f2 = outbox.flush();
    release({ saved: true });
    await Promise.all([f1, f2]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('startOutboxWorker', () => {
  it('flushes on start, on online, and schedules the next retry', async () => {
    const send = vi.fn(async () => { throw new TypeError('offline'); });
    const { outbox } = setup({ send });
    outbox.enqueue(payload('a'));
    const listeners = {};
    const win = { addEventListener: (e, fn) => { listeners[e] = fn; }, removeEventListener: vi.fn() };
    const setTimeoutImpl = vi.fn(() => 42);
    const clearTimeoutImpl = vi.fn();
    const worker = startOutboxWorker(outbox, { win, setTimeoutImpl, clearTimeoutImpl });
    await worker.run();
    expect(send).toHaveBeenCalled();
    expect(setTimeoutImpl).toHaveBeenLastCalledWith(expect.any(Function), expect.any(Number));
    expect(typeof listeners.online).toBe('function');
    worker.stop();
    expect(win.removeEventListener).toHaveBeenCalledWith('online', listeners.online);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/private/trainers/lib`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement `api.js`**

`src/private/trainers/lib/api.js`:

```js
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.code || 'HTTP_ERROR', data.error || `Request failed (${res.status})`, data.details);
  }
  return data;
}

export const saveSession = (payload, opts) =>
  request('/api/trainers/sessions', { method: 'POST', body: payload, ...opts });

export const getSession = (id, opts) =>
  request(`/api/trainers/sessions?id=${encodeURIComponent(id)}`, opts);

export function getStats({ trainer, mode = 'standard', configKey }, opts) {
  const query = new URLSearchParams({ trainer, mode });
  if (configKey) query.set('configKey', configKey);
  return request(`/api/trainers/stats?${query}`, opts);
}

export const getDrill = (opts) => request('/api/trainers/drill', opts);
```

- [ ] **Step 4: Implement `outbox.js`**

`src/private/trainers/lib/outbox.js`:

```js
import { ApiError } from './api.js';

// Durable queue for finished games: a game is never lost to a failed request.
// Entries persist in localStorage (memory fallback) until the server accepts them.

export const OUTBOX_KEY = 'trn-outbox-v1';
const AUTH_RETRY_MS = 60000;

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
          update(entry.id, { status: 'failed', lastError: err.message });
        } else {
          const attempts = entry.attempts + 1;
          update(entry.id, { attempts, nextAt: now() + backoffMs(attempts), lastError: err.message || String(err) });
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

  async function run() {
    clearTimeoutImpl(timer);
    timer = null;
    const { authRequired } = await outbox.flush();
    const due = authRequired ? AUTH_RETRY_MS : outbox.nextDueIn();
    if (due !== null) timer = setTimeoutImpl(run, due);
  }

  win.addEventListener('online', run);
  run();

  return {
    run,
    stop() {
      win.removeEventListener('online', run);
      clearTimeoutImpl(timer);
    },
  };
}
```

- [ ] **Step 5: Implement the singleton and the hook**

`src/private/trainers/lib/outboxInstance.js`:

```js
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
```

`src/private/trainers/lib/useOutboxStatus.js`:

```js
import { useEffect, useSyncExternalStore } from 'react';
import { outbox, ensureWorker } from './outboxInstance.js';

export function useOutboxStatus() {
  useEffect(() => { ensureWorker(); }, []);
  return useSyncExternalStore(outbox.subscribe, outbox.snapshot);
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/private/trainers/lib`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/private/trainers/lib
git commit -m "Add trainer API client and durable retrying outbox" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Routes, hub links, Play/Stats shell

**Files:**
- Modify: `src/App.jsx` (add the lazy `/me/:trainer` route)
- Modify: `src/private/PrivateHome.jsx` (Trainers section items)
- Create: `src/private/trainers/TrainerPage.jsx`
- Create: `src/private/trainers/trainers.css`
- Create (stubs that later tasks replace): `src/private/trainers/zetamac/ZetamacPlay.jsx`, `src/private/trainers/optiver/OptiverPlay.jsx`, `src/private/trainers/stats/ZetamacStats.jsx`, `src/private/trainers/stats/OptiverStats.jsx`

**Interfaces:**
- Consumes:
  - `useOutboxStatus` (Task 11)
  - The existing `RequireAuth` render-prop API: `<RequireAuth>{({ logout }) => node}</RequireAuth>`
  - The existing `PrivateShell` (`className` prop)
- Produces:
  - Route `/me/:trainer?tab=play|stats`
  - The `TrainerPage` default export
  - The Play component contract, which Tasks 13–14 implement: `export default function XPlay({ onBusyChange }: { onBusyChange: (busy: boolean) => void })`. Call `onBusyChange(true)` when a game starts and `onBusyChange(false)` when it ends or is abandoned.
  - The Stats component contract, which Task 16 implements: `export default function XStats()` with no props
  - CSS base classes: `.trn-page`, `.trn-head`, `.trn-tabs`, `.trn-tab`, `.trn-sync`, `.trn-body`, `.trn-muted`, `.trn-btn`, `.trn-btn--primary`

Leaving guard: `BrowserRouter` has no `useBlocker`, so `TrainerPage` asks with `window.confirm` before tab switches and the Back link while a game is busy, and registers `beforeunload`. The browser's own Back button cannot be intercepted in this router setup: that abandons the game without saving, which is an accepted limitation.

- [ ] **Step 1: Create the stubs (so routes build before Tasks 13, 14 and 16)**

`src/private/trainers/zetamac/ZetamacPlay.jsx`:

```jsx
// Replaced in Task 13.
export default function ZetamacPlay() {
  return <p className="trn-muted asc-mono">Zetamac game — not built yet.</p>;
}
```

`src/private/trainers/optiver/OptiverPlay.jsx`:

```jsx
// Replaced in Task 14.
export default function OptiverPlay() {
  return <p className="trn-muted asc-mono">80-in-8 test — not built yet.</p>;
}
```

`src/private/trainers/stats/ZetamacStats.jsx`:

```jsx
// Replaced in Task 16.
export default function ZetamacStats() {
  return <p className="trn-muted asc-mono">Zetamac stats — not built yet.</p>;
}
```

`src/private/trainers/stats/OptiverStats.jsx`:

```jsx
// Replaced in Task 16.
export default function OptiverStats() {
  return <p className="trn-muted asc-mono">80-in-8 stats — not built yet.</p>;
}
```

- [ ] **Step 2: Create the base CSS**

`src/private/trainers/trainers.css`:

```css
/* ============================================================
   TRAINERS — Zetamac + Optiver 80-in-8. Builds on .asc tokens.
   ============================================================ */
.trn-page { padding-bottom: 64px; }
.trn-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap;
  padding: clamp(8px, 3vh, 32px) 0 clamp(16px, 3vh, 28px); border-bottom: 1px solid var(--line); }
.trn-head h1 { font-size: clamp(34px, 5.5vw, 72px); text-transform: uppercase; }
.trn-tabs { display: flex; gap: 6px; }
.trn-tab { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  background: none; border: 1px solid var(--line-2); color: var(--muted); padding: 8px 14px;
  transition: color 0.3s var(--ease), border-color 0.3s var(--ease); }
.trn-tab:hover { color: var(--bone); }
.trn-tab[aria-selected="true"] { color: var(--amber); border-color: var(--amber); }
.trn-tab:focus-visible, .trn-btn:focus-visible { outline: 1px solid var(--amber); outline-offset: 3px; }
.trn-sync { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--faint); margin-top: 10px; }
.trn-sync--failed { color: #F0A38B; }
.trn-body { padding-top: clamp(20px, 4vh, 40px); }
.trn-muted { color: var(--faint); }
.trn-btn { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  background: none; border: 1px solid var(--line); color: var(--bone); padding: 10px 18px;
  transition: color 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease); }
.trn-btn:hover:not(:disabled) { color: var(--amber); border-color: var(--amber); }
.trn-btn:disabled { opacity: 0.4; }
.trn-btn--primary { background: var(--amber); color: #0B0A0A; border-color: var(--amber); }
.trn-btn--primary:hover:not(:disabled) { background: none; }
```

- [ ] **Step 3: Implement `TrainerPage`**

`src/private/trainers/TrainerPage.jsx`:

```jsx
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PrivateShell from '../PrivateShell';
import { useOutboxStatus } from './lib/useOutboxStatus';
import './trainers.css';

const TRAINERS = {
  zetamac: {
    title: 'Zetamac',
    Play: lazy(() => import('./zetamac/ZetamacPlay')),
    Stats: lazy(() => import('./stats/ZetamacStats')),
  },
  optiver: {
    title: '80 in 8',
    Play: lazy(() => import('./optiver/OptiverPlay')),
    Stats: lazy(() => import('./stats/OptiverStats')),
  },
};

const TABS = ['play', 'stats'];
const LEAVE_MESSAGE = "Leave this game? It won't be saved.";

export default function TrainerPage() {
  const { trainer } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const busy = useRef(false);
  const { pendingIds, failed } = useOutboxStatus();

  const onBusyChange = useCallback((value) => { busy.current = value; }, []);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!busy.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const config = TRAINERS[trainer];
  if (!config) return <Navigate to="/me" replace />;

  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'play';
  const confirmLeave = () => !busy.current || window.confirm(LEAVE_MESSAGE);

  const selectTab = (next) => {
    if (next === tab || !confirmLeave()) return;
    busy.current = false;
    setParams(next === 'play' ? {} : { tab: next }, { replace: true });
  };

  const onBack = (e) => {
    e.preventDefault();
    if (!confirmLeave()) return;
    busy.current = false;
    navigate('/me');
  };

  const { Play, Stats, title } = config;

  return (
    <PrivateShell>
      <div className="asc-topbar">
        <Link to="/me" onClick={onBack} data-hot className="asc-back asc-mono">
          <ArrowLeft size={14} /> <span className="b-name">Base Camp</span>
        </Link>
      </div>

      <main className="asc-wrap trn-page">
        <header className="trn-head">
          <div>
            <h1 className="asc-h">{title}</h1>
            {pendingIds.length > 0 && (
              <p className="trn-sync" role="status">{pendingIds.length} game{pendingIds.length === 1 ? '' : 's'} waiting to sync</p>
            )}
            {failed.length > 0 && (
              <p className="trn-sync trn-sync--failed" role="alert">
                {failed.length} game{failed.length === 1 ? '' : 's'} could not be saved: {failed[0].lastError}
              </p>
            )}
          </div>
          <div className="trn-tabs" role="tablist" aria-label={`${title} views`}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`trn-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="trn-panel"
                data-hot
                className="trn-tab"
                onClick={() => selectTab(t)}
              >
                {t === 'play' ? 'Play' : 'Stats'}
              </button>
            ))}
          </div>
        </header>

        <section id="trn-panel" role="tabpanel" aria-labelledby={`trn-tab-${tab}`} className="trn-body">
          <Suspense fallback={<p className="trn-muted asc-mono" role="status">Loading…</p>}>
            {tab === 'play' ? <Play key={trainer} onBusyChange={onBusyChange} /> : <Stats key={trainer} />}
          </Suspense>
        </section>
      </main>
    </PrivateShell>
  );
}
```

- [ ] **Step 4: Add the route in `src/App.jsx`**

Add these imports next to the existing private imports:

```jsx
import { lazy, Suspense } from 'react';
import PrivateShell from './private/PrivateShell';
```

Below the imports (above `function AnimatedRoutes`), add:

```jsx
// Trainer code is lazy-loaded: public visitors never download it.
const TrainerPage = lazy(() => import('./private/trainers/TrainerPage'));

const privateFallback = (
  <PrivateShell className="prv-center">
    <span className="asc-mono prv-status" role="status">Loading…</span>
  </PrivateShell>
);
```

Directly below the existing `/me` route, add:

```jsx
      <Route
        path="/me/:trainer"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><TrainerPage /></Suspense>}</RequireAuth>}
      />
```

- [ ] **Step 5: Link the trainers from the hub**

In `src/private/PrivateHome.jsx`, replace the trainers entry of `SECTIONS`:

```js
  { key: 'trainers', n: '02', title: 'Trainers', items: [] },
```

with:

```js
  {
    key: 'trainers',
    n: '02',
    title: 'Trainers',
    items: [
      { name: 'Zetamac', desc: 'Arithmetic sprint · auto-advance · drills', to: '/me/zetamac' },
      { name: 'Optiver 80 in 8', desc: '80 questions · 8 minutes · +1 / −1', to: '/me/optiver' },
    ],
  },
```

- [ ] **Step 6: Build and verify in the browser**

Run: `npm run build`
Expected: the build succeeds, and the output lists separate chunks for `TrainerPage` and the four stubs, which proves the lazy split.

Start the `vite-dev` preview and sign in at `/login`. Then check:
1. `/me` shows Zetamac and Optiver 80 in 8 under Trainers.
2. Clicking Zetamac opens `/me/zetamac` with the "Zetamac" title and the Play tab selected, showing the stub text.
3. Clicking Stats changes the URL to `?tab=stats` and shows the stats stub.
4. `/me/unknown` redirects to `/me`.
5. Signing out and then visiting `/me/zetamac` redirects to `/login`.
6. The console shows no errors.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/private/PrivateHome.jsx src/private/trainers/TrainerPage.jsx src/private/trainers/trainers.css src/private/trainers/zetamac/ZetamacPlay.jsx src/private/trainers/optiver/OptiverPlay.jsx src/private/trainers/stats/ZetamacStats.jsx src/private/trainers/stats/OptiverStats.jsx
git commit -m "Add lazy trainer routes with Play/Stats tabs and hub links" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

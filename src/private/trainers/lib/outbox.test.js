import { describe, it, expect, vi } from 'vitest';
import { ApiError } from './api.js';
import {
  OUTBOX_KEY, MAX_ERROR_CHARS, memoryStorage, backoffMs, isPermanentError, describeError, createOutbox, startOutboxWorker,
} from './outbox.js';

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
    expect(outbox.snapshot()).toEqual({ pendingIds: [], failed: [], discardedIds: [] });
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
    expect(outbox.snapshot()).toEqual({ pendingIds: [], failed: [{ id: 'a', lastError: 'Invalid session payload' }], discardedIds: [] });
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

  it('does not wedge on a rejection reason without a message, and still retries', async () => {
    const send = vi.fn(async () => { throw undefined; });
    const { outbox, clock } = setup({ send });
    outbox.enqueue(payload('a'));
    await expect(outbox.flush()).resolves.toEqual({ sent: 0, authRequired: false });
    expect(outbox.snapshot().pendingIds).toEqual(['a']);
    expect(outbox.nextDueIn()).toBe(1000);
    clock.advance(1000);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('multi-tab safety', () => {
  function twoTabs(sendA = vi.fn(async () => ({ saved: true }))) {
    const storage = memoryStorage();
    const a = createOutbox({ storage, send: sendA, now: () => 1000 });
    const b = createOutbox({ storage, send: vi.fn(async () => ({ saved: true })), now: () => 1000 });
    return { storage, a, b, sendA };
  }
  const storedIds = (storage) => JSON.parse(storage.getItem(OUTBOX_KEY)).map((e) => e.id);

  it('two instances enqueueing never erase each other', () => {
    const { storage, a, b } = twoTabs();
    a.enqueue(payload('g1'));
    b.enqueue(payload('g2')); // b was created before a wrote g1
    expect(storedIds(storage)).toEqual(['g1', 'g2']);
  });

  it('a successful flush in one tab keeps the other tab\'s entry', async () => {
    const { storage, a, b, sendA } = twoTabs();
    a.enqueue(payload('g1'));
    b.enqueue(payload('g2'));
    await a.flush();
    expect(sendA).toHaveBeenCalledWith(payload('g1'));
    expect(storedIds(storage)).toEqual(['g2']);
  });

  it('refresh() picks up entries written by another instance and notifies', () => {
    const { a, b } = twoTabs();
    const listener = vi.fn();
    a.subscribe(listener);
    b.enqueue(payload('g3'));
    expect(a.snapshot().pendingIds).toEqual([]);
    a.refresh();
    expect(a.snapshot().pendingIds).toEqual(['g3']);
    expect(listener).toHaveBeenCalled();
  });
});

describe('stored entry validation', () => {
  it('drops malformed entries and keeps valid ones', () => {
    const valid = { id: 'ok', payload: payload('ok'), attempts: 2, nextAt: 5000, status: 'pending', lastError: 'offline' };
    const failed = { id: 'bad-payload', payload: payload('bad-payload'), attempts: 0, nextAt: 0, status: 'failed', lastError: null };
    const json = JSON.stringify([
      valid,
      failed,
      null,
      'nope',
      { ...valid, id: 7 },
      { ...valid, id: 'mismatch' },
      { ...valid, id: 'no-payload', payload: undefined },
      { ...valid, attempts: -1 },
      { ...valid, attempts: '1' },
      { ...valid, nextAt: null },
      { ...valid, status: 'sent' },
      { ...valid, lastError: 5 },
    ]);
    // JSON.stringify cannot emit Infinity, but JSON.parse turns 1e999 into it.
    const raw = `${json.slice(0, -1)},{"id":"inf","payload":{"session":{"id":"inf"}},"attempts":0,"nextAt":1e999,"status":"pending","lastError":null}]`;
    const storage = memoryStorage();
    storage.setItem(OUTBOX_KEY, raw);
    const { outbox } = setup({ storage });
    expect(outbox.snapshot()).toEqual({ pendingIds: ['ok'], failed: [{ id: 'bad-payload', lastError: null }], discardedIds: [] });
    expect(Number.isFinite(outbox.nextDueIn())).toBe(true);
  });
});

describe('failed entry details and discard', () => {
  it('describeError summarizes flattened validation details, bounded', () => {
    const details = { formErrors: [], fieldErrors: { session: ['correct does not match attempts'] } };
    expect(describeError(new ApiError(400, 'VALIDATION_ERROR', 'Invalid session payload', details)))
      .toBe('Invalid session payload (session: correct does not match attempts)');
    const many = { formErrors: ['top'], fieldErrors: { session: ['a', 'b'], attempts: ['c', 'd'] } };
    expect(describeError(new ApiError(400, 'VALIDATION_ERROR', 'Invalid', many))).toBe('Invalid (top; session: a; session: b)');
    const long = { formErrors: ['x'.repeat(1000)], fieldErrors: {} };
    const text = describeError(new ApiError(400, 'VALIDATION_ERROR', 'Invalid', long));
    expect(text.length).toBeLessThanOrEqual(MAX_ERROR_CHARS);
    expect(text.startsWith('Invalid (xxx')).toBe(true);
    expect(describeError(new ApiError(400, 'X', 'Plain'))).toBe('Plain');
    expect(describeError(new ApiError(400, 'X', 'Odd', { formErrors: 'no', fieldErrors: null }))).toBe('Odd');
    expect(describeError(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
    expect(describeError(undefined)).toBe('undefined');
  });

  it('stores the detailed message on a failed entry', async () => {
    const details = { formErrors: [], fieldErrors: { session: ['correct does not match attempts'] } };
    const send = vi.fn(async () => { throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session payload', details); });
    const { outbox } = setup({ send });
    outbox.enqueue(payload('a'));
    await outbox.flush();
    expect(outbox.snapshot().failed).toEqual([{ id: 'a', lastError: 'Invalid session payload (session: correct does not match attempts)' }]);
  });

  it('discard removes only that failed entry and notifies', async () => {
    const send = vi.fn(async (p) => {
      if (p.session.id === 'bad') throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session payload');
      throw new TypeError('offline');
    });
    const { outbox, storage } = setup({ send });
    outbox.enqueue(payload('bad'));
    outbox.enqueue(payload('b'));
    await outbox.flush();
    const listener = vi.fn();
    outbox.subscribe(listener);
    outbox.discard('b'); // pending, not failed: kept
    expect(outbox.snapshot().pendingIds).toEqual(['b']);
    outbox.discard('bad');
    expect(outbox.snapshot()).toEqual({ pendingIds: ['b'], failed: [], discardedIds: ['bad'] });
    expect(JSON.parse(storage.getItem(OUTBOX_KEY)).map((e) => e.id)).toEqual(['b']);
    expect(listener).toHaveBeenCalled();
  });

  it('discard tracks the id in discardedIds in memory, changing snapshot identity exactly once', async () => {
    const send = vi.fn(async () => { throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session payload'); });
    const { outbox } = setup({ send });
    outbox.enqueue(payload('bad'));
    await outbox.flush();
    const before = outbox.snapshot();
    outbox.discard('bad');
    const after1 = outbox.snapshot();
    const after2 = outbox.snapshot();
    expect(after1).not.toBe(before);
    expect(after1.discardedIds).toEqual(['bad']);
    expect(after2).toBe(after1);
  });
});

describe('startOutboxWorker', () => {
  it('reloads and runs on a storage event for the outbox key, and stop() removes that listener', async () => {
    const send = vi.fn(async () => ({ saved: true }));
    const storage = memoryStorage();
    const { outbox } = setup({ send, storage });
    const other = createOutbox({ storage, send: vi.fn(), now: () => 1000 });
    const listeners = {};
    const win = { addEventListener: vi.fn((e, fn) => { listeners[e] = fn; }), removeEventListener: vi.fn() };
    const { setTimeoutImpl, clearTimeoutImpl } = fakeTimers();
    const worker = startOutboxWorker(outbox, { win, setTimeoutImpl, clearTimeoutImpl });
    await worker.run();
    expect(typeof listeners.storage).toBe('function');

    other.enqueue(payload('from-other-tab'));
    listeners.storage({ key: 'unrelated' });
    await worker.run();
    expect(send).not.toHaveBeenCalled();

    listeners.storage({ key: OUTBOX_KEY });
    await worker.run();
    expect(send).toHaveBeenCalledWith(payload('from-other-tab'));

    worker.stop();
    expect(win.removeEventListener).toHaveBeenCalledWith('storage', listeners.storage);
    expect(win.removeEventListener).toHaveBeenCalledWith('online', listeners.online);
  });

  it('treats a null storage key (localStorage.clear() in another tab) as a refresh trigger', async () => {
    const send = vi.fn(async () => ({ saved: true }));
    const storage = memoryStorage();
    const { outbox } = setup({ send, storage });
    const other = createOutbox({ storage, send: vi.fn(), now: () => 1000 });
    const listeners = {};
    const win = { addEventListener: vi.fn((e, fn) => { listeners[e] = fn; }), removeEventListener: vi.fn() };
    const { setTimeoutImpl, clearTimeoutImpl } = fakeTimers();
    const worker = startOutboxWorker(outbox, { win, setTimeoutImpl, clearTimeoutImpl });
    await worker.run();

    other.enqueue(payload('from-other-tab'));
    listeners.storage({ key: null });
    await worker.run();
    expect(send).toHaveBeenCalledWith(payload('from-other-tab'));

    worker.stop();
  });

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

  function fakeTimers() {
    let nextId = 1;
    const calls = [];
    const cleared = new Set();
    const setTimeoutImpl = vi.fn((fn, delay) => {
      const id = nextId++;
      calls.push({ id, fn, delay });
      return id;
    });
    const clearTimeoutImpl = vi.fn((id) => { cleared.add(id); });
    return { setTimeoutImpl, clearTimeoutImpl, calls, cleared };
  }

  it('coalesces concurrent run() calls into a single flush, leaving only one live timer', async () => {
    let reject;
    const send = vi.fn(() => new Promise((_resolve, rej) => { reject = rej; }));
    const { outbox } = setup({ send });
    outbox.enqueue(payload('a'));
    const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const { setTimeoutImpl, clearTimeoutImpl, calls, cleared } = fakeTimers();
    const worker = startOutboxWorker(outbox, { win, setTimeoutImpl, clearTimeoutImpl });
    const p1 = worker.run();
    const p2 = worker.run();
    reject(new TypeError('offline'));
    await Promise.all([p1, p2]);
    expect(send).toHaveBeenCalledTimes(1);
    const liveTimers = calls.filter((c) => !cleared.has(c.id));
    expect(liveTimers).toHaveLength(1);
  });

  it('ignores a stray timer callback that fires after stop()', async () => {
    const send = vi.fn(async () => { throw new TypeError('offline'); });
    const { outbox, clock } = setup({ send });
    outbox.enqueue(payload('a'));
    const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const { setTimeoutImpl, clearTimeoutImpl, calls } = fakeTimers();
    const worker = startOutboxWorker(outbox, { win, setTimeoutImpl, clearTimeoutImpl });
    await worker.run();
    expect(send).toHaveBeenCalledTimes(1);
    const mostRecent = calls[calls.length - 1];
    worker.stop();
    clock.advance(1000);
    mostRecent.fn();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('schedules a 60000ms retry when flush rejects unexpectedly', async () => {
    const brokenOutbox = { flush: () => Promise.reject(new Error('boom')), nextDueIn: () => null };
    const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const { setTimeoutImpl, clearTimeoutImpl } = fakeTimers();
    const worker = startOutboxWorker(brokenOutbox, { win, setTimeoutImpl, clearTimeoutImpl });
    await expect(worker.run()).resolves.toBeUndefined();
    expect(setTimeoutImpl).toHaveBeenLastCalledWith(expect.any(Function), 60000);
  });
});

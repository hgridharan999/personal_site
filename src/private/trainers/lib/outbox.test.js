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

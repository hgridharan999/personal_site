// src/private/trainers/poker/worker/worker.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { createBrain } from '../bots/index.js';
import { contextAfter } from '../bots/testHands.js';
import { createMessageHandler } from './protocol.js';
import { createWorkerRunner, safeChoice } from './workerClient.js';

const persona = { id: 'test', name: 'Test', tag: 'TST', style: 's', brain: 'callingStation' };
const ctxFor = (steps, p = persona) => {
  const cx = contextAfter(steps);
  return { view: cx.view, seat: cx.seat, legal: cx.legal, events: cx.seatEvents, persona: p, profile: null, bb: 2 };
};
// Round-trips through structured clone like a real postMessage.
const clone = (x) => structuredClone(x);

describe('createMessageHandler', () => {
  it('answers decide requests with the brain choice', () => {
    const handle = createMessageHandler({ createBrain, rng: mulberry32(1) });
    expect(handle(clone({ type: 'decide', id: 7, ctx: ctxFor(['r 2 5']) }))).toEqual({ type: 'decision', id: 7, choice: { action: 'call' } });
  });

  it('matches a local heuristic decision for the same seed', () => {
    const heuristic = { ...persona, brain: 'heuristic', dials: { cbetFlop: 0.9 } };
    const ctx = ctxFor(['r 2 5', 'f 3', 'c 4', 'f 5', 'f 0', 'f 1', 'B Kh8d4s', 'k 2'], heuristic);
    const handle = createMessageHandler({ createBrain, rng: mulberry32(4) });
    const local = createBrain(heuristic).decide(ctx, mulberry32(4));
    expect(handle(clone({ type: 'decide', id: 1, ctx })).choice).toEqual(local);
  });

  it('reuses one brain per persona id and dials across cloned messages', () => {
    const factory = vi.fn(createBrain);
    const handle = createMessageHandler({ createBrain: factory, rng: mulberry32(1) });
    handle(clone({ type: 'decide', id: 1, ctx: ctxFor([]) }));
    handle(clone({ type: 'decide', id: 2, ctx: ctxFor(['r 2 5']) }));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('returns errors for malformed, unknown and failing requests', () => {
    const handle = createMessageHandler({ createBrain, rng: mulberry32(1) });
    expect(handle(null)).toEqual({ type: 'error', id: null, error: { message: 'malformed message' } });
    expect(handle({ type: 'nope', id: 3 })).toEqual({ type: 'error', id: 3, error: { message: 'unknown message type: nope' } });
    expect(handle({ type: 'decide', id: 4, ctx: {} }).error.message).toBe('decide needs ctx.persona');
    const bad = handle({ type: 'decide', id: 5, ctx: { ...ctxFor([]), persona: { ...persona, brain: 'missing' } } });
    expect(bad).toEqual({ type: 'error', id: 5, error: { message: 'Unknown brain: missing' } });
  });
});

/** In-memory worker: replies asynchronously through the real handler, unless `silent`. */
function fakeWorker({ silent = false, postThrows = false } = {}) {
  const listeners = { message: [], error: [], messageerror: [] };
  const handle = createMessageHandler({ createBrain, rng: mulberry32(2) });
  const worker = {
    posted: [],
    terminated: false,
    addEventListener: (type, fn) => listeners[type].push(fn),
    postMessage(message) {
      if (postThrows) throw new DOMException('could not be cloned', 'DataCloneError');
      worker.posted.push(message);
      if (!silent) queueMicrotask(() => listeners.message.forEach((fn) => fn({ data: handle(clone(message)) })));
    },
    terminate() {
      worker.terminated = true;
    },
    crash: (message) => listeners.error.forEach((fn) => fn({ message })),
    garble: () => listeners.messageerror.forEach((fn) => fn({ data: null })),
  };
  return worker;
}

describe('createWorkerRunner', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves decisions from the worker and matches ids', async () => {
    const worker = fakeWorker();
    const runner = createWorkerRunner({ createWorker: () => worker });
    const [a, b] = await Promise.all([runner.decide(ctxFor([])), runner.decide(ctxFor(['r 2 5']))]);
    expect(a).toEqual({ action: 'call' }); // UTG facing the big blind
    expect(b).toEqual({ action: 'call' });
    expect(worker.posted.map((m) => m.id)).toEqual([1, 2]);
  });

  it('falls back to a safe choice on timeout', async () => {
    vi.useFakeTimers();
    const worker = fakeWorker({ silent: true });
    const onTimeout = vi.fn();
    const runner = createWorkerRunner({ createWorker: () => worker, timeoutMs: 100, onTimeout });
    const facing = ctxFor(['r 2 5']);
    const promise = runner.decide(facing);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toEqual({ action: 'fold', timedOut: true });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(safeChoice({ canCheck: true })).toEqual({ action: 'check' });
  });

  it('ignores a reply that arrives after the request already timed out', async () => {
    vi.useFakeTimers();
    const listeners = { message: [] };
    const worker = {
      posted: [],
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
      postMessage: (m) => worker.posted.push(m),
      terminate: () => {},
    };
    const runner = createWorkerRunner({ createWorker: () => worker, timeoutMs: 100 });
    const promise = runner.decide(ctxFor(['r 2 5']));
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toEqual({ action: 'fold', timedOut: true });
    // The worker finally answers the same request id after it already timed out: a no-op.
    const [posted] = worker.posted;
    expect(() => {
      listeners.message.forEach((fn) => fn({ data: { type: 'decision', id: posted.id, choice: { action: 'call' } } }));
    }).not.toThrow();
    // A second decide still behaves normally, proving the late reply left the runner intact.
    const next = runner.decide(ctxFor([]));
    vi.advanceTimersByTime(100);
    await expect(next).resolves.toEqual({ action: 'fold', timedOut: true });
  });

  it('rejects pending decisions on a worker error, then marks the runner broken', async () => {
    const worker = fakeWorker({ silent: true });
    const runner = createWorkerRunner({ createWorker: () => worker, timeoutMs: 10_000 });
    expect(runner.broken).toBe(false);
    const pending = runner.decide(ctxFor([]));
    worker.crash('boom');
    await expect(pending).rejects.toThrow('boom');
    expect(runner.broken).toBe(true);
    await expect(runner.decide(ctxFor([]))).rejects.toThrow('worker broken');
    expect(worker.posted).toHaveLength(1); // a broken runner posts nothing more
  });

  it('treats a messageerror like a crash', async () => {
    const worker = fakeWorker({ silent: true });
    const runner = createWorkerRunner({ createWorker: () => worker, timeoutMs: 10_000 });
    const pending = runner.decide(ctxFor([]));
    worker.garble();
    await expect(pending).rejects.toThrow();
    expect(runner.broken).toBe(true);
    await expect(runner.decide(ctxFor([]))).rejects.toThrow('worker broken');
  });

  it('rejects and clears the timer when postMessage throws', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const runner = createWorkerRunner({ createWorker: () => fakeWorker({ postThrows: true }), timeoutMs: 100, onTimeout });
    await expect(runner.decide(ctxFor([]))).rejects.toThrow('could not be cloned');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('rejects pending decisions after dispose and terminates the worker', async () => {
    const worker = fakeWorker({ silent: true });
    const runner = createWorkerRunner({ createWorker: () => worker, timeoutMs: 10_000 });
    const pending = runner.decide(ctxFor([]));
    runner.dispose();
    await expect(pending).rejects.toThrow('runner disposed');
    await expect(runner.decide(ctxFor([]))).rejects.toThrow('runner disposed');
    expect(worker.terminated).toBe(true);
  });
});

describe('pokerWorker entry', () => {
  it('registers a message listener that posts handler responses', async () => {
    const posted = [];
    let listener = null;
    vi.stubGlobal('self', { addEventListener: (type, fn) => { if (type === 'message') listener = fn; }, postMessage: (m) => posted.push(m) });
    await import('./pokerWorker.js');
    listener({ data: clone({ type: 'decide', id: 9, ctx: ctxFor(['r 2 5']) }) });
    expect(posted).toEqual([{ type: 'decision', id: 9, choice: { action: 'call' } }]);
    vi.unstubAllGlobals();
  });
});

// src/private/trainers/poker/analysis/worker/analysisWorker.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildLog } from '../../bots/testHands.js';
import { ANALYSIS_REQUEST, ANALYSIS_RESPONSE, createAnalysisHandler } from './protocol.js';
import { ANALYSIS_TIMEOUT_MS, REGRADE_TIMEOUT_MS, createAnalysisClient } from './analysisClient.js';

const WALK = { id: 'walk', heroSeat: 1, lineup: [], events: buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']) };
const clone = (x) => structuredClone(x);

describe('createAnalysisHandler', () => {
  it('grades a record and passes a positive budget through', () => {
    const gradeHand = vi.fn(() => ({ decisions: [], heroAllinEv: 1.5 }));
    const handle = createAnalysisHandler({ gradeHand });
    expect(ANALYSIS_REQUEST.GRADE).toBe('grade');
    expect(handle(clone({ type: 'grade', id: 4, record: WALK, budgetMs: 900 }))).toEqual({
      type: ANALYSIS_RESPONSE.GRADED, id: 4, analysis: { decisions: [], heroAllinEv: 1.5 },
    });
    expect(gradeHand.mock.calls[0][1]).toEqual({ budgetMs: 900 });
    handle({ type: 'grade', id: 5, record: WALK });
    expect(gradeHand.mock.calls[1][1]).toEqual({});
  });

  it('answers malformed, unknown and failing requests with errors', () => {
    const handle = createAnalysisHandler({ gradeHand: () => { throw new Error('boom'); } });
    expect(handle(null)).toEqual({ type: 'error', id: null, error: { message: 'malformed message' } });
    expect(handle({ type: 'nope', id: 2 })).toEqual({ type: 'error', id: 2, error: { message: 'unknown message type: nope' } });
    expect(handle({ type: 'grade', id: 3, record: { id: 'x' } }).error.message).toBe('grade needs a record with id, heroSeat, lineup and events');
    expect(handle({ type: 'grade', id: 4, record: WALK })).toEqual({ type: 'error', id: 4, error: { message: 'boom' } });
  });
});

/** In-memory worker driven by a handler; `silent` never answers. */
function fakeWorker({ silent = false, gradeHand = () => ({ decisions: [], heroAllinEv: null }) } = {}) {
  const listeners = { message: [], error: [] };
  const handle = createAnalysisHandler({ gradeHand });
  const worker = {
    posted: [],
    terminated: false,
    addEventListener: (type, fn) => listeners[type].push(fn),
    postMessage(message) {
      worker.posted.push(message);
      if (!silent) queueMicrotask(() => listeners.message.forEach((fn) => fn({ data: handle(clone(message)) })));
    },
    terminate() {
      worker.terminated = true;
    },
    crash: (message) => listeners.error.forEach((fn) => fn({ message })),
  };
  return worker;
}

describe('createAnalysisClient', () => {
  it('starts the worker lazily and resolves analyses by id', async () => {
    expect([ANALYSIS_TIMEOUT_MS, REGRADE_TIMEOUT_MS]).toEqual([6000, 30000]);
    const worker = fakeWorker({ gradeHand: (record) => ({ decisions: [], heroAllinEv: record.id === 'walk' ? 2 : 3 }) });
    const createWorker = vi.fn(() => worker);
    const client = createAnalysisClient({ createWorker });
    expect(createWorker).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([client.analyze(WALK), client.analyze({ ...WALK, id: 'other' }, { budgetMs: 500 })]);
    expect([a.heroAllinEv, b.heroAllinEv]).toEqual([2, 3]);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.posted.map((m) => [m.id, m.budgetMs])).toEqual([[1, undefined], [2, 500]]);
  });

  it('restarts the worker after a timeout and rejects what was pending', async () => {
    vi.useFakeTimers();
    try {
      const workers = [fakeWorker({ silent: true }), fakeWorker()];
      const client = createAnalysisClient({ createWorker: () => workers.shift(), timeoutMs: 100 });
      const results = Promise.allSettled([client.analyze(WALK), client.analyze(WALK, { timeoutMs: 1000 })]);
      vi.advanceTimersByTime(100);
      expect((await results).map((r) => r.reason?.message)).toEqual(['analysis timed out', 'analysis timed out']);
      const third = client.analyze(WALK);
      await vi.runAllTimersAsync();
      await expect(third).resolves.toEqual({ decisions: [], heroAllinEv: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects on a worker error and after dispose', async () => {
    const worker = fakeWorker({ silent: true });
    const client = createAnalysisClient({ createWorker: () => worker, timeoutMs: 10_000 });
    const pending = client.analyze(WALK);
    worker.crash('kaput');
    await expect(pending).rejects.toThrow('kaput');
    const second = client.analyze(WALK);
    client.dispose();
    await expect(second).rejects.toThrow('analysis client disposed');
    await expect(client.analyze(WALK)).rejects.toThrow('analysis client disposed');
  });

  it('rejects when the worker cannot be created', async () => {
    const client = createAnalysisClient({ createWorker: () => { throw new Error('no workers here'); } });
    await expect(client.analyze(WALK)).rejects.toThrow('no workers here');
  });
});

describe('analysisWorker entry', () => {
  it('posts graded responses for grade requests', async () => {
    const posted = [];
    let listener = null;
    vi.stubGlobal('self', { addEventListener: (type, fn) => { if (type === 'message') listener = fn; }, postMessage: (m) => posted.push(m) });
    try {
      await import('./analysisWorker.js');
      listener({ data: clone({ type: 'grade', id: 9, record: WALK }) });
      expect(posted).toEqual([{ type: 'graded', id: 9, analysis: { decisions: [], heroAllinEv: null } }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

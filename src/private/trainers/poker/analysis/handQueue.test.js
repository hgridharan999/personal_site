// src/private/trainers/poker/analysis/handQueue.test.js
import { describe, it, expect, vi } from 'vitest';
import { QUEUE_TIMEOUT_MS, emptyAnalysis, isAnalysis, createHandAnalysisQueue } from './handQueue.js';

const quiet = () => ({ warn: vi.fn() });
const record = (n) => ({ id: `h${n}`, handNo: n });
const analysis = (n) => ({ decisions: [{ idx: n }], heroAllinEv: n });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('handQueue helpers', () => {
  it('knows the empty analysis and valid shapes', () => {
    expect(QUEUE_TIMEOUT_MS).toBe(8000);
    expect(emptyAnalysis()).toEqual({ decisions: [], heroAllinEv: null });
    expect(isAnalysis(analysis(1))).toBe(true);
    expect(isAnalysis({ decisions: [], heroAllinEv: NaN })).toBe(false);
    expect(isAnalysis({ decisions: 'x', heroAllinEv: null })).toBe(false);
    expect(isAnalysis(null)).toBe(false);
  });
});

describe('createHandAnalysisQueue', () => {
  it('grades one hand at a time and delivers in push order', async () => {
    let active = 0;
    let maxActive = 0;
    const analyze = vi.fn(async (r) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(r.handNo === 1 ? 15 : 0);
      active -= 1;
      return analysis(r.handNo);
    });
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, logger: quiet() });
    queue.push(record(1));
    queue.push(record(2));
    expect(queue.pending()).toBe(2);
    await queue.drain();
    expect(deliver.mock.calls).toEqual([[record(1), analysis(1)], [record(2), analysis(2)]]);
    expect(maxActive).toBe(1);
    expect(queue.pending()).toBe(0);
  });

  it('delivers the empty analysis on an error, an invalid result or a timeout', async () => {
    const logger = quiet();
    const results = [() => Promise.reject(new Error('boom')), () => ({ nope: true }), () => new Promise(() => {})];
    const analyze = vi.fn(() => results.shift()());
    const deliver = vi.fn();
    // Injected fake timer: the queue's own timeout logic is exercised without a real clock, since only the
    // third hand ever needs its timer fired (the first two settle on their own via `analyze`).
    let nextTimerId = 0;
    const timers = new Map();
    const setTimer = (fn) => {
      const id = (nextTimerId += 1);
      timers.set(id, fn);
      return id;
    };
    const clearTimer = (id) => timers.delete(id);
    const queue = createHandAnalysisQueue({ analyze, deliver, timeoutMs: 5, logger, setTimer, clearTimer });
    [1, 2, 3].forEach((n) => queue.push(record(n)));
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(3));
    [...timers.values()].forEach((fn) => fn());
    await queue.drain();
    expect(deliver.mock.calls.map(([r, a]) => [r.handNo, a])).toEqual([[1, emptyAnalysis()], [2, emptyAnalysis()], [3, emptyAnalysis()]]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('warns once when an analysis result is invalid before delivering the empty analysis', async () => {
    const logger = quiet();
    const analyze = vi.fn(() => ({ nope: true }));
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, logger });
    queue.push(record(1));
    await queue.drain();
    expect(deliver.mock.calls).toEqual([[record(1), emptyAnalysis()]]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatch(/invalid/i);
  });

  it('keeps delivering hands even when logger.warn throws', async () => {
    const logger = { warn: vi.fn(() => { throw new Error('logger exploded'); }) };
    const responses = [() => new Promise(() => {}), () => analysis(2)];
    const analyze = vi.fn(() => responses.shift()());
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, timeoutMs: 5, logger });
    queue.push(record(1));
    queue.push(record(2));
    await queue.drain();
    expect(deliver.mock.calls).toEqual([[record(1), emptyAnalysis()], [record(2), analysis(2)]]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('still grades and delivers a hand pushed after flushNow()', async () => {
    const analyze = vi.fn(async (r) => analysis(r.handNo));
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, logger: quiet() });
    queue.push(record(1));
    queue.flushNow();
    queue.push(record(2));
    await queue.drain();
    expect(deliver.mock.calls).toEqual([[record(1), emptyAnalysis()], [record(2), analysis(2)]]);
  });

  it('flushNow delivers every pending hand at once without grades and ignores late results', async () => {
    let release;
    const analyze = vi.fn(() => new Promise((resolve) => { release = () => resolve(analysis(1)); }));
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, logger: quiet() });
    queue.push(record(1));
    queue.push(record(2));
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    queue.flushNow();
    expect(deliver.mock.calls).toEqual([[record(1), emptyAnalysis()], [record(2), emptyAnalysis()]]);
    expect(queue.pending()).toBe(0);
    release();
    await queue.drain();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('keeps going when deliver throws', async () => {
    const logger = quiet();
    const deliver = vi.fn(() => { throw new Error('storage full'); });
    const queue = createHandAnalysisQueue({ analyze: async (r) => analysis(r.handNo), deliver, logger });
    queue.push(record(1));
    queue.push(record(2));
    await queue.drain();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('poker analysis: delivering a hand failed', expect.any(Error));
  });
});

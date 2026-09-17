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
    const queue = createHandAnalysisQueue({ analyze, deliver, timeoutMs: 5, logger });
    [1, 2, 3].forEach((n) => queue.push(record(n)));
    await queue.drain();
    expect(deliver.mock.calls.map(([r, a]) => [r.handNo, a])).toEqual([[1, emptyAnalysis()], [2, emptyAnalysis()], [3, emptyAnalysis()]]);
    expect(logger.warn).toHaveBeenCalled();
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

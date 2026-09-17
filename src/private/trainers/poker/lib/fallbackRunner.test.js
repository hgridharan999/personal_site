// src/private/trainers/poker/lib/fallbackRunner.test.js
import { describe, it, expect, vi } from 'vitest';
import { createFallbackRunner } from './fallbackRunner.js';
import { createWorkerRunner } from '../worker/workerClient.js';

const ctx = { legal: { canCheck: true } };
const quiet = () => ({ warn: vi.fn(), error: vi.fn() });

/** A primary runner whose decide is scripted and which can be marked broken. */
function scriptedPrimary(decide) {
  const runner = { broken: false, decide: vi.fn(decide), dispose: vi.fn() };
  return runner;
}
const localRunner = (action = 'check') => ({ decide: vi.fn(async () => ({ action })), dispose: vi.fn() });

describe('createFallbackRunner', () => {
  it('decides with the primary runner while it works and never loads the fallback', async () => {
    const primary = scriptedPrimary(async () => ({ action: 'call' }));
    const loadFallback = vi.fn();
    const runner = createFallbackRunner({ createPrimary: () => primary, loadFallback, logger: quiet() });
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'call' });
    expect(loadFallback).not.toHaveBeenCalled();
  });

  it('falls back when constructing the primary throws, and warns once', async () => {
    const logger = quiet();
    const local = localRunner('check');
    const loadFallback = vi.fn(async () => local);
    const runner = createFallbackRunner({ createPrimary: () => { throw new Error('no workers'); }, loadFallback, logger });
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'check' });
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'check' });
    expect(loadFallback).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('retries a decision on the fallback when the primary breaks, and stays on the fallback', async () => {
    const logger = quiet();
    const primary = scriptedPrimary(async () => {
      primary.broken = true;
      throw new Error('worker crashed');
    });
    const local = localRunner('fold');
    const runner = createFallbackRunner({ createPrimary: () => primary, loadFallback: async () => local, logger });
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'fold' });
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'fold' });
    expect(primary.decide).toHaveBeenCalledTimes(1);
    expect(local.decide).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('passes on a primary rejection that did not break it', async () => {
    const primary = scriptedPrimary(async () => { throw new Error('Unknown brain: nope'); });
    const loadFallback = vi.fn();
    const runner = createFallbackRunner({ createPrimary: () => primary, loadFallback, logger: quiet() });
    await expect(runner.decide(ctx)).rejects.toThrow('Unknown brain: nope');
    expect(loadFallback).not.toHaveBeenCalled();
  });

  it('disposes both runners and rejects later decisions', async () => {
    const primary = scriptedPrimary(async () => {
      primary.broken = true;
      throw new Error('worker crashed');
    });
    const local = localRunner();
    const runner = createFallbackRunner({ createPrimary: () => primary, loadFallback: async () => local, logger: quiet() });
    await runner.decide(ctx);
    runner.dispose();
    await Promise.resolve();
    expect(primary.dispose).toHaveBeenCalledTimes(1);
    expect(local.dispose).toHaveBeenCalledTimes(1);
    await expect(runner.decide(ctx)).rejects.toThrow('runner disposed');
  });

  it('treats the worker as broken after two consecutive timeouts, warning once and disposing it', async () => {
    const logger = quiet();
    const timedOut = { action: 'fold', timedOut: true };
    let calls = 0;
    const primary = scriptedPrimary(async () => {
      calls += 1;
      return timedOut;
    });
    const local = localRunner('check');
    const runner = createFallbackRunner({ createPrimary: () => primary, loadFallback: async () => local, logger });
    await expect(runner.decide(ctx)).resolves.toEqual(timedOut); // 1st consecutive timeout: still on the worker
    await expect(runner.decide(ctx)).resolves.toEqual(timedOut); // 2nd: worker now treated as broken
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'check' }); // 3rd: routed to the fallback
    expect(calls).toBe(2);
    expect(primary.dispose).toHaveBeenCalledTimes(1);
    expect(local.decide).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('resets the timeout streak after a successful decision, and stays on the worker', async () => {
    const logger = quiet();
    const timedOut = { action: 'fold', timedOut: true };
    const results = [timedOut, { action: 'call' }, timedOut];
    let i = 0;
    const primary = scriptedPrimary(async () => results[i++]);
    const loadFallback = vi.fn();
    const runner = createFallbackRunner({ createPrimary: () => primary, loadFallback, logger });
    await expect(runner.decide(ctx)).resolves.toEqual(timedOut);
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'call' });
    await expect(runner.decide(ctx)).resolves.toEqual(timedOut);
    expect(primary.decide).toHaveBeenCalledTimes(3);
    expect(primary.dispose).not.toHaveBeenCalled();
    expect(loadFallback).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs once when the fallback fails to load, even across repeated decides', async () => {
    const logger = quiet();
    const loadFallback = vi.fn(async () => { throw new Error('chunk load failed'); });
    const runner = createFallbackRunner({ createPrimary: () => { throw new Error('no workers'); }, loadFallback, logger });
    await expect(runner.decide(ctx)).rejects.toThrow('chunk load failed');
    await expect(runner.decide(ctx)).rejects.toThrow('chunk load failed');
    await expect(runner.decide(ctx)).rejects.toThrow('chunk load failed');
    expect(loadFallback).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('goes straight to the fallback after a worker error with nothing pending, without posting to the worker', async () => {
    const logger = quiet();
    const listeners = { message: [], error: [], messageerror: [] };
    const worker = {
      posted: [],
      addEventListener: (type, fn) => listeners[type].push(fn),
      postMessage: (m) => worker.posted.push(m),
      terminate: vi.fn(),
    };
    const local = localRunner('check');
    const runner = createFallbackRunner({
      createPrimary: () => createWorkerRunner({ createWorker: () => worker }),
      loadFallback: async () => local,
      logger,
    });
    listeners.error.forEach((fn) => fn({ message: 'boom' })); // fires with no decide() in flight
    await expect(runner.decide(ctx)).resolves.toEqual({ action: 'check' });
    expect(worker.posted).toHaveLength(0);
    expect(local.decide).toHaveBeenCalledTimes(1);
  });
});

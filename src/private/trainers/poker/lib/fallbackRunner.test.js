// src/private/trainers/poker/lib/fallbackRunner.test.js
import { describe, it, expect, vi } from 'vitest';
import { createFallbackRunner } from './fallbackRunner.js';

const ctx = { legal: { canCheck: true } };
const quiet = () => ({ warn: vi.fn() });

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
});

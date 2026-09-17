// src/private/trainers/poker/lib/fallbackRunner.js
// A BotRunner that decides with a primary runner (the Web Worker) and switches to a fallback runner
// (main-thread brains) for the rest of the session when the primary cannot be built or reports itself broken.

/**
 * @typedef {{ decide:(ctx:object) => Promise<object>, dispose:() => void, broken?:boolean }} BotRunner
 * @param {{ createPrimary:() => BotRunner, loadFallback:() => Promise<BotRunner>, logger?:Pick<Console, 'warn'> }} options
 *   loadFallback is called at most once, the first time the fallback is needed, so its code can load lazily.
 * @returns {{ decide:(ctx:object) => Promise<object>, dispose:() => void }}
 *   A decision that breaks the primary is retried on the fallback; other primary rejections pass through.
 */
export function createFallbackRunner({ createPrimary, loadFallback, logger = console }) {
  let primary = null;
  let fallback = null;
  let disposed = false;

  const switchToFallback = (reason) => {
    if (!fallback) {
      logger.warn('poker bots: worker unavailable, deciding on the main thread instead', reason);
      fallback = Promise.resolve().then(loadFallback);
      fallback.catch(() => {}); // a failed load surfaces through decide, not as an unhandled rejection
    }
    return fallback;
  };

  try {
    primary = createPrimary();
  } catch (err) {
    switchToFallback(err);
  }

  return {
    async decide(ctx) {
      if (disposed) throw new Error('runner disposed');
      if (primary && !primary.broken) {
        try {
          return await primary.decide(ctx);
        } catch (err) {
          if (!primary.broken) throw err;
          switchToFallback(err);
        }
      }
      const runner = await switchToFallback(null);
      if (disposed) throw new Error('runner disposed');
      return runner.decide(ctx);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      primary?.dispose();
      fallback?.then((runner) => runner.dispose(), () => {});
    },
  };
}

// src/private/trainers/poker/lib/fallbackRunner.js
// A BotRunner that decides with a primary runner (the Web Worker) and switches to a fallback runner
// (main-thread brains) for the rest of the session when the primary cannot be built or reports itself broken.

// A worker that times out this many decisions in a row (see workerClient.js's `timedOut` result
// flag) is treated as broken even though it never fired an `error`/`messageerror` event — e.g. a
// hung worker, or one whose script is still loading. The decision that hit the second timeout
// still resolves with the check/fold the worker client already produced, so the table driver's
// own decide budget is never exceeded; only later decisions move to the fallback.
const MAX_CONSECUTIVE_TIMEOUTS = 2;

/**
 * @typedef {{ decide:(ctx:object) => Promise<object>, dispose:() => void, broken?:boolean }} BotRunner
 * @param {{ createPrimary:() => BotRunner, loadFallback:() => Promise<BotRunner>, logger?:Pick<Console, 'warn'|'error'> }} options
 *   loadFallback is called at most once, the first time the fallback is needed, so its code can load lazily.
 * @returns {{ decide:(ctx:object) => Promise<object>, dispose:() => void }}
 *   A decision that breaks the primary, or that times out twice in a row, is retried on the
 *   fallback; other primary rejections pass through.
 */
export function createFallbackRunner({ createPrimary, loadFallback, logger = console }) {
  let primary = null;
  let fallback = null;
  let disposed = false;
  let consecutiveTimeouts = 0;

  const switchToFallback = (reason) => {
    if (!fallback) {
      logger.warn('poker bots: worker unavailable, deciding on the main thread instead', reason);
      fallback = Promise.resolve().then(loadFallback);
      // `fallback` is assigned once (guarded above), so this handler fires at most once even
      // though every pending and future decide() also awaits the same promise; decide() still
      // rejects with the same error so callers keep their existing error handling.
      fallback.catch((err) => logger.error?.('poker bots: could not load the fallback runner', err));
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
          const result = await primary.decide(ctx);
          if (result?.timedOut) {
            consecutiveTimeouts += 1;
            if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
              const brokenPrimary = primary;
              primary = null;
              consecutiveTimeouts = 0;
              switchToFallback(new Error(`worker timed out on ${MAX_CONSECUTIVE_TIMEOUTS} consecutive decisions`));
              brokenPrimary.dispose();
            }
          } else {
            consecutiveTimeouts = 0;
          }
          return result;
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

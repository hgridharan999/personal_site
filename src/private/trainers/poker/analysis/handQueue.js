// src/private/trainers/poker/analysis/handQueue.js
// Grades finished hands one at a time and hands each to `deliver(record, analysis)` in push order (spec §6.1:
// grade, then save). Grading never blocks saving: an error, an invalid result or a timeout delivers the empty
// analysis, and flushNow() delivers everything pending at once (page hide, leaving the table). Hands delivered
// without grades are re-graded later from the review pages.

export const QUEUE_TIMEOUT_MS = 8000;

export const emptyAnalysis = () => ({ decisions: [], heroAllinEv: null });

export const isAnalysis = (value) => value !== null && typeof value === 'object' && Array.isArray(value.decisions)
  && (value.heroAllinEv === null || Number.isFinite(value.heroAllinEv));

/**
 * @param {{ analyze:(record:object) => Promise<object>, deliver:(record:object, analysis:object) => void, timeoutMs?:number,
 *   setTimer?:typeof setTimeout, clearTimer?:typeof clearTimeout, logger?:Pick<Console, 'warn'> }} deps
 */
export function createHandAnalysisQueue({
  analyze, deliver, timeoutMs = QUEUE_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout, logger = console,
}) {
  const waiting = [];
  let tail = Promise.resolve();

  // A broken logger (its `warn` throws) must never stall the queue: every warn is best-effort.
  const warn = (...args) => {
    try {
      logger.warn(...args);
    } catch {
      // ignored — delivery must proceed regardless of logging failures
    }
  };

  const handOver = (item, analysis) => {
    if (item.delivered) return;
    item.delivered = true;
    waiting.splice(waiting.indexOf(item), 1);
    try {
      deliver(item.record, analysis);
    } catch (err) {
      warn('poker analysis: delivering a hand failed', err);
    }
  };

  const analyzeWithTimeout = (record) => new Promise((resolve) => {
    const timer = setTimer(() => {
      warn('poker analysis timed out');
      resolve(emptyAnalysis());
    }, timeoutMs);
    Promise.resolve()
      .then(() => analyze(record))
      .then(
        (analysis) => {
          if (isAnalysis(analysis)) return analysis;
          warn('poker analysis: invalid result');
          return emptyAnalysis();
        },
        (err) => {
          warn('poker analysis failed', err);
          return emptyAnalysis();
        },
      )
      .then((analysis) => {
        clearTimer(timer);
        resolve(analysis);
      });
  });

  return {
    push(record) {
      const item = { record, delivered: false, release: null };
      // Resolves when flushNow() hands the record over, so a grading job still running for it
      // does not hold back the hands pushed after the flush.
      const flushed = new Promise((resolve) => { item.release = resolve; });
      waiting.push(item);
      tail = tail
        .then(async () => {
          if (item.delivered) return;
          const analysis = await Promise.race([analyzeWithTimeout(record), flushed]);
          handOver(item, analysis);
        })
        // Not dead code: analyzeWithTimeout/flushed never reject on their own, but a misbehaving
        // injected `setTimer`/`clearTimer` (or any other unexpected throw during a step) must not
        // leave `tail` permanently rejected — that would stall every hand pushed after it, since
        // each step is chained off the previous one.
        .catch((err) => warn('poker analysis: hand queue step failed', err));
      return tail;
    },
    pending: () => waiting.length,
    flushNow() {
      for (const item of [...waiting]) {
        handOver(item, emptyAnalysis());
        item.release(null);
      }
    },
    drain: () => tail,
  };
}

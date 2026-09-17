// src/private/trainers/poker/analysis/worker/analysisClient.js
// Grading runs in its own module worker, separate from the bot worker, so a slow or stuck grading job never
// delays bot decisions. A timed-out job is killed with its worker; the next request starts a fresh one.
import { ANALYSIS_REQUEST, ANALYSIS_RESPONSE } from './protocol.js';

export const ANALYSIS_TIMEOUT_MS = 6000;
export const REGRADE_TIMEOUT_MS = 30000;

const defaultCreateWorker = () => new Worker(new URL('./analysisWorker.js', import.meta.url), { type: 'module' });

/**
 * @param {{ createWorker?:() => { postMessage:Function, addEventListener:Function, terminate:Function }, timeoutMs?:number }} [options]
 * @returns {{ analyze:(record:object, options?:{ timeoutMs?:number, budgetMs?:number }) => Promise<object>, dispose:() => void }}
 */
export function createAnalysisClient({ createWorker = defaultCreateWorker, timeoutMs = ANALYSIS_TIMEOUT_MS } = {}) {
  let worker = null;
  let nextId = 1;
  let disposed = false;
  const pending = new Map();

  const rejectAll = (error) => {
    for (const [id, entry] of [...pending]) {
      pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(error);
    }
  };
  const stop = () => {
    if (!worker) return;
    worker.terminate();
    worker = null;
  };
  const start = () => {
    if (worker) return worker;
    const created = createWorker();
    created.addEventListener('message', (event) => {
      const message = event.data;
      const entry = message ? pending.get(message.id) : undefined;
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.type === ANALYSIS_RESPONSE.GRADED) entry.resolve(message.analysis);
      else entry.reject(new Error(message.error?.message ?? 'analysis failed'));
    });
    created.addEventListener('error', (event) => {
      if (worker === created) stop();
      rejectAll(new Error(event.message ?? 'analysis worker crashed'));
    });
    worker = created;
    return created;
  };

  return {
    analyze(record, { timeoutMs: callTimeoutMs = timeoutMs, budgetMs } = {}) {
      if (disposed) return Promise.reject(new Error('analysis client disposed'));
      return new Promise((resolve, reject) => {
        let target;
        try {
          target = start();
        } catch (err) {
          reject(err);
          return;
        }
        const id = nextId;
        nextId += 1;
        const timer = setTimeout(() => {
          if (!pending.has(id)) return;
          // The worker is busy with a job that will not finish in time: kill it and everything queued behind it.
          stop();
          rejectAll(new Error('analysis timed out'));
        }, callTimeoutMs);
        pending.set(id, { resolve, reject, timer });
        target.postMessage({ type: ANALYSIS_REQUEST.GRADE, id, record, budgetMs });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rejectAll(new Error('analysis client disposed'));
      stop();
    },
  };
}

let shared = null;

/** The page's analysis client (the table and the review pages share one worker). */
export function sharedAnalysisClient() {
  shared ??= createAnalysisClient();
  return shared;
}

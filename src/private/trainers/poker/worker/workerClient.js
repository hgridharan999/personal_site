// src/private/trainers/poker/worker/workerClient.js
// BotRunner backed by a Web Worker (same shape as bots/runner.js createLocalRunner).
import { REQUEST, RESPONSE } from './protocol.js';

export const DEFAULT_TIMEOUT_MS = 3000;

/** The choice used when the worker does not answer in time: check when free, otherwise fold. */
export const safeChoice = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'fold' });

const defaultCreateWorker = () => new Worker(new URL('./pokerWorker.js', import.meta.url), { type: 'module' });

/**
 * @param {{ createWorker?:() => { postMessage:(m:object) => void, addEventListener:(type:string, fn:(e:object) => void) => void, terminate:() => void },
 *   timeoutMs?:number, onTimeout?:(ctx:object) => void }} [options]
 * @returns {{ decide:(ctx:import('../bots/contract.js').BotContext) => Promise<import('../bots/contract.js').BotChoice>, dispose:() => void,
 *   readonly broken:boolean }}
 *   decide rejects on a worker error or after dispose, and resolves with safeChoice(ctx.legal) on timeout.
 *   An `error` or `messageerror` event marks the runner broken: pending decisions reject, and every later decide
 *   rejects with `worker broken`, so the caller can fall back to a local runner.
 */
export function createWorkerRunner({ createWorker = defaultCreateWorker, timeoutMs = DEFAULT_TIMEOUT_MS, onTimeout = () => {} } = {}) {
  const worker = createWorker();
  const pending = new Map();
  let nextId = 1;
  let disposed = false;
  let broken = false;

  const settle = (id) => {
    const entry = pending.get(id);
    if (!entry) return null;
    pending.delete(id);
    clearTimeout(entry.timer);
    return entry;
  };

  worker.addEventListener('message', (event) => {
    const message = event.data;
    const entry = message && settle(message.id);
    if (!entry) return; // late reply after a timeout, or unknown id
    if (message.type === RESPONSE.DECISION) entry.resolve(message.choice);
    else entry.reject(new Error(message.error?.message ?? 'worker error'));
  });

  const breakWith = (message) => {
    broken = true;
    for (const id of [...pending.keys()]) settle(id).reject(new Error(message));
  };
  worker.addEventListener('error', (event) => breakWith(event?.message ?? 'worker crashed'));
  worker.addEventListener('messageerror', () => breakWith('worker message could not be read'));

  return {
    decide(ctx) {
      if (disposed) return Promise.reject(new Error('runner disposed'));
      if (broken) return Promise.reject(new Error('worker broken'));
      return new Promise((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        const timer = setTimeout(() => {
          settle(id);
          onTimeout(ctx);
          resolve(safeChoice(ctx.legal));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          worker.postMessage({ type: REQUEST.DECIDE, id, ctx });
        } catch (err) {
          settle(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    get broken() {
      return broken;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of [...pending.keys()]) settle(id).reject(new Error('runner disposed'));
      worker.terminate();
    },
  };
}

// scripts/poker/lib/tableWorker.js
// worker_threads entry for pool.js.
import { parentPort } from 'node:worker_threads';
import { runTableJob } from './tableJob.js';

parentPort.on('message', ({ id, job }) => {
  try {
    parentPort.postMessage({ id, result: runTableJob(job) });
  } catch (err) {
    parentPort.postMessage({ id, error: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
});

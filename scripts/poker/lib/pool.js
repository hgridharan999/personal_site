// scripts/poker/lib/pool.js
// Runs table jobs on node:worker_threads, or inline when size is 0 (tests and debugging).
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { runTableJob } from './tableJob.js';

export const defaultThreads = () => Math.max(1, availableParallelism() - 1);

const spawnTableWorker = () => new Worker(new URL('./tableWorker.js', import.meta.url));

/**
 * @typedef {{ postMessage:(msg:object) => void, on:(event:string, fn:(arg:any) => void) => void,
 *   terminate:() => Promise<unknown> }} PoolWorker
 * @param {{ size:number, createWorker?:() => PoolWorker }} options
 *   createWorker: injectable for tests; defaults to a worker_threads Worker running tableWorker.js.
 * @returns {{ run:(job:import('./tableJob.js').TableJob) => Promise<import('./tableJob.js').TableResult>,
 *   runAll:(jobs:import('./tableJob.js').TableJob[]) => Promise<import('./tableJob.js').TableResult[]>,
 *   close:() => Promise<void> }}
 */
export function createPool({ size, createWorker = spawnTableWorker }) {
  if (size === 0) {
    const run = async (job) => runTableJob(job);
    return { run, runAll: (jobs) => Promise.all(jobs.map(run)), close: async () => {} };
  }
  const live = new Set();
  const idle = [];
  const queue = []; // { job, resolve, reject }
  const running = new Map(); // worker -> task
  let closed = false;

  const rejectQueued = (message) => {
    for (const task of queue.splice(0)) task.reject(new Error(message));
  };

  const dispatch = () => {
    while (idle.length && queue.length) {
      const worker = idle.shift();
      const task = queue.shift();
      running.set(worker, task);
      worker.postMessage({ id: task.id, job: task.job });
    }
    if (live.size === 0) rejectQueued('no live workers');
  };

  const retire = (worker, err) => {
    if (!live.delete(worker)) return;
    const task = running.get(worker);
    running.delete(worker);
    const at = idle.indexOf(worker);
    if (at >= 0) idle.splice(at, 1);
    if (task) task.reject(err);
    worker.terminate();
    dispatch();
  };

  for (let i = 0; i < size; i += 1) {
    const worker = createWorker();
    live.add(worker);
    idle.push(worker);
    worker.on('message', ({ error, result }) => {
      if (!live.has(worker)) return;
      const task = running.get(worker);
      running.delete(worker);
      idle.push(worker);
      if (task) {
        if (error) task.reject(new Error(error));
        else task.resolve(result);
      }
      dispatch();
    });
    worker.on('error', (err) => retire(worker, err));
    worker.on('exit', (code) => retire(worker, new Error(`worker exited with code ${code}`)));
  }

  let nextId = 1;
  const run = (job) => new Promise((resolve, reject) => {
    if (closed) {
      reject(new Error('pool is closed'));
      return;
    }
    queue.push({ id: nextId, job, resolve, reject });
    nextId += 1;
    dispatch();
  });

  return {
    run,
    runAll: (jobs) => Promise.all(jobs.map(run)),
    close: async () => {
      closed = true;
      rejectQueued('pool is closed');
      const workers = [...live];
      live.clear();
      for (const task of running.values()) task.reject(new Error('pool is closed'));
      running.clear();
      await Promise.all(workers.map((w) => w.terminate()));
    },
  };
}

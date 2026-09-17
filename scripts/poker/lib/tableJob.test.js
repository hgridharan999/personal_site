// scripts/poker/lib/tableJob.test.js
import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultDials } from '../../../src/private/trainers/poker/bots/dials.js';
import { emptyAcc, addSample, mergeAcc, summarize } from './ciStats.js';
import { runTableJob, dealSeed } from './tableJob.js';
import { createPool } from './pool.js';

// Transparent wrapper around createBrain that records the profile every decision sees (inline runs only).
const seenProfiles = vi.hoisted(() => []);
vi.mock('../../../src/private/trainers/poker/bots/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createBrain: (persona, options) => {
      const brain = actual.createBrain(persona, options);
      return { decide: (ctx, rng) => { seenProfiles.push(ctx.profile); return brain.decide(ctx, rng); } };
    },
  };
});

const job = (overrides = {}) => ({
  players: [{ kind: 'brain', name: 'callingStation' }, ...Array.from({ length: 5 }, () => ({ kind: 'dials', dials: defaultDials() }))],
  seed: 3, firstDeal: 0, deals: 4, equityIterations: 40, subject: 0, trackStyles: true, ...overrides,
});

describe('ciStats', () => {
  it('computes mean, sample sd and a 95% interval, and merges accumulators', () => {
    let a = emptyAcc();
    for (const x of [1, 2, 3, 4]) a = addSample(a, x);
    const s = summarize(a);
    expect(s.mean).toBe(2.5);
    expect(s.sd).toBeCloseTo(Math.sqrt(5 / 3), 10);
    expect(s.lower).toBeCloseTo(2.5 - (1.96 * Math.sqrt(5 / 3)) / 2, 10);
    const b = mergeAcc(addSample(addSample(emptyAcc(), 1), 2), addSample(addSample(emptyAcc(), 3), 4));
    expect(b).toEqual(a);
    const flipped = summarize(a, -10);
    expect(flipped.mean).toBe(-25);
    expect(flipped.lower).toBeLessThan(flipped.upper);
    expect(summarize(emptyAcc()).lower).toBe(-Infinity);
  });
});

describe('runTableJob', () => {
  beforeEach(() => { seenProfiles.length = 0; });

  it('is deterministic, zero-sum, and counts hands and deals', () => {
    const a = runTableJob(job());
    const b = runTableJob(job());
    expect(a).toEqual(b);
    expect(a.hands).toBe(24);
    expect(a.nets.reduce((x, y) => x + y, 0)).toBe(0);
    expect(a.dealAccs[0].n).toBe(4);
    expect(a.dealAccs[0].sum).toBe(a.nets[0]);
    expect(a.styles[1].hands).toBe(24);
  });

  it('covers consecutive deal ranges and seeds each deal deterministically', () => {
    const first = runTableJob(job({ deals: 2, trackStyles: false, subject: null }));
    const second = runTableJob(job({ firstDeal: 2, deals: 2, trackStyles: false, subject: null }));
    expect(first.dealAccs[0].n + second.dealAccs[0].n).toBe(4);
    expect(first.styles).toBeNull();
    expect(dealSeed(3, 0)).not.toBe(dealSeed(3, 1));
    expect(dealSeed(3, 0)).toBe(dealSeed(3, 0));
  });

  it('with adapt: false never gives brains a profile, even with a subject', () => {
    runTableJob(job({ deals: 2, adapt: false }));
    expect(seenProfiles.length).toBeGreaterThan(0);
    expect(seenProfiles.every((p) => p === null)).toBe(true);
  });

  it('defaults to adaptation off', () => {
    runTableJob(job({ deals: 2 }));
    expect(seenProfiles.length).toBeGreaterThan(0);
    expect(seenProfiles.every((p) => p === null)).toBe(true);
  });

  it('with adapt: true gives brains the subject profile, and requires a subject', () => {
    runTableJob(job({ players: job().players.map((_, i) => (i === 0 ? { kind: 'brain', name: 'always3Bet' } : { kind: 'brain', name: 'callingStation' })), deals: 2, adapt: true }));
    expect(seenProfiles.length).toBeGreaterThan(0);
    expect(seenProfiles.every((p) => p !== null)).toBe(true);
    expect(seenProfiles.at(-1).hands).toBe(6); // snapshot for deal 2 holds the 6 hands of deal 1
    expect(() => runTableJob(job({ subject: null, adapt: true }))).toThrow('adapt requires a subject');
  });
});

/** Fake worker: answers each job after a macrotask, echoing its seed, and fails jobs whose seed is negative. */
function fakeWorkerFactory(log) {
  let active = 0;
  return () => {
    const worker = new EventEmitter();
    worker.postMessage = ({ id, job }) => {
      active += 1;
      log.maxActive = Math.max(log.maxActive, active);
      log.posted.push(job.seed);
      setTimeout(() => {
        active -= 1;
        if (job.seed === -1) worker.emit('message', { id, error: 'job failed' });
        else if (job.seed === -2) worker.emit('error', new Error('worker crashed'));
        else worker.emit('message', { id, result: { seed: job.seed } });
      }, 1);
    };
    worker.terminate = async () => { log.terminated += 1; };
    return worker;
  };
}

describe('createPool', () => {
  it('schedules at most size jobs at once, in queue order, and returns results in job order', async () => {
    const log = { maxActive: 0, posted: [], terminated: 0 };
    const pool = createPool({ size: 2, createWorker: fakeWorkerFactory(log) });
    const results = await pool.runAll([1, 2, 3, 4, 5].map((seed) => ({ seed })));
    expect(results.map((r) => r.seed)).toEqual([1, 2, 3, 4, 5]);
    expect(log.posted).toEqual([1, 2, 3, 4, 5]);
    expect(log.maxActive).toBe(2);
    await pool.close();
    expect(log.terminated).toBe(2);
  });

  it('rejects a failed job without stalling the others, and drops a crashed worker', async () => {
    const log = { maxActive: 0, posted: [], terminated: 0 };
    const pool = createPool({ size: 2, createWorker: fakeWorkerFactory(log) });
    const outcomes = await Promise.allSettled([1, -1, 2, -2, 3, 4].map((seed) => pool.run({ seed })));
    expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
    expect(outcomes[1].reason.message).toBe('job failed');
    expect(outcomes[3].reason.message).toBe('worker crashed');
    await pool.close();
    await expect(pool.run({ seed: 9 })).rejects.toThrow('pool is closed');
  });

  it('rejects queued jobs when every worker has crashed', async () => {
    const log = { maxActive: 0, posted: [], terminated: 0 };
    const pool = createPool({ size: 1, createWorker: fakeWorkerFactory(log) });
    const outcomes = await Promise.allSettled([-2, 1].map((seed) => pool.run({ seed })));
    expect(outcomes.map((o) => o.status)).toEqual(['rejected', 'rejected']);
    expect(outcomes[1].reason.message).toBe('no live workers');
    await pool.close();
  });

  it('runs jobs inline with size 0 and in worker threads with the same results', async () => {
    const small = job({ deals: 2, adapt: true });
    const inline = createPool({ size: 0 });
    const threaded = createPool({ size: 2 });
    try {
      const [x] = await inline.runAll([small]);
      const [y, z] = await threaded.runAll([small, small]);
      expect(y).toEqual(x);
      expect(z).toEqual(x);
      const bad = job({ deals: 1, players: [{ kind: 'brain', name: 'noSuchBrain' }, ...small.players.slice(1)] });
      await expect(threaded.run(bad)).rejects.toThrow('Unknown brain: noSuchBrain');
      expect(await threaded.run(small)).toEqual(x);
    } finally {
      await inline.close();
      await threaded.close();
    }
  }, 60_000);
});

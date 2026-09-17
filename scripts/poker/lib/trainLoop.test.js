// scripts/poker/lib/trainLoop.test.js
import { describe, it, expect } from 'vitest';
import { createPool } from './pool.js';
import { ADAPT_JOB_DEALS } from './tableJob.js';
import { PROBES } from './gate.js';
import { train, selectPersonas, PERSONA_SLOTS, TRAIN_DEFAULTS, SMOKE_OPTIONS } from './trainLoop.js';

const inline = () => createPool({ size: 0 }).runAll;

/** Wraps a runAll so every job it sees is recorded. */
const recording = (runAll) => {
  const jobs = [];
  return { jobs, runAll: (batch) => { jobs.push(...batch); return runAll(batch); } };
};

/** Resolves jobs in reverse order, as a busy worker pool might, but returns results in job order. */
const reversed = (runAll) => async (jobs) => {
  const results = new Array(jobs.length);
  for (let i = jobs.length - 1; i >= 0; i -= 1) [results[i]] = await runAll([jobs[i]]);
  return results;
};

const TINY = { population: 10, generations: 2, rounds: 1, deals: 2, probeHands: 6, equityIterations: 20, eliteCount: 4, patience: 5 };

describe('training loop (inline, tiny budgets)', () => {
  it('uses the spec population of 50 by default and names the eight contract personas', () => {
    expect(TRAIN_DEFAULTS.population).toBe(50);
    const slots = Object.values(PERSONA_SLOTS).flat();
    expect(slots.map((s) => s.tag).sort()).toEqual(['BRK', 'DCH', 'INK', 'LRK', 'MOS', 'ROK', 'SBL', 'VIP']);
    expect(TRAIN_DEFAULTS.probeWeight).toBeGreaterThan(0);
    expect(TRAIN_DEFAULTS.probeWeight).toBeLessThan(1);
    expect(SMOKE_OPTIONS.generations).toBeLessThanOrEqual(TRAIN_DEFAULTS.generations);
  });

  it('stops when the time budget runs out', async () => {
    let t = 0;
    const result = await train({
      options: { population: 5, generations: 10, rounds: 1, deals: 1, probeHands: 6, equityIterations: 10, minutes: 1 },
      runAll: inline(),
      now: () => {
        t += 61_000;
        return t;
      },
    });
    expect(result.stoppedBecause).toBe('time');
    expect(result.generations).toBe(1);
  }, 60_000);

  it('plays every individual against every exploit probe with adaptation on, in fixed-size adaptive jobs', async () => {
    const { jobs, runAll } = recording(inline());
    await train({ options: { ...TINY, generations: 1, probeHands: 6 }, runAll });
    const probeJobs = jobs.filter((j) => j.adapt);
    expect(probeJobs.length).toBe(10 * PROBES.length);
    for (const job of probeJobs) {
      expect(PROBES).toContain(job.players[0].name);
      expect(job.subject).toBe(0);
      expect(job.deals).toBeLessThanOrEqual(ADAPT_JOB_DEALS);
      expect(job.players.slice(1).every((p) => p.kind === 'dials')).toBe(true);
    }
    const tableJobs = jobs.filter((j) => !j.adapt);
    expect(tableJobs.length).toBe(2);
    expect(tableJobs.every((j) => j.players.filter((p) => p.kind === 'dials').length === 5)).toBe(true);
  }, 60_000);

  it('is reproducible for a seed regardless of the order jobs finish in', async () => {
    const options = { ...TINY, generations: 2, seed: 11 };
    const a = await train({ options, runAll: inline() });
    const b = await train({ options, runAll: reversed(inline()) });
    expect(b.archive).toEqual(a.archive);
    expect(b.history).toEqual(a.history);
    const c = await train({ options: { ...options, seed: 12 }, runAll: inline() });
    expect(c.history).not.toEqual(a.history);
  }, 120_000);

  it('trains a tiny population and selects named personas', async () => {
    const runAll = inline();
    const lines = [];
    const result = await train({ options: TINY, runAll, log: (line) => lines.push(line) });
    expect(result.generations).toBe(2);
    expect(result.stoppedBecause).toBe('max-generations');
    // generations x (tables x deals x rotations + individuals x probes x deals x rotations)
    expect(result.hands).toBe(2 * (2 * 2 * 6 + 10 * PROBES.length * 1 * 6));
    expect(lines.length).toBe(2);
    const { jobs, runAll: recorded } = recording(runAll);
    const personas = await selectPersonas({ archive: result.archive, runAll: recorded, gateHands: 6, seed: 3, equityIterations: 20 });
    const candidates = Object.values(result.archive).reduce((n, list) => n + list.length, 0);
    // quick gate: 4 baselines with adaptation off, 3 probes with adaptation on, no informational runs
    expect(jobs.length).toBe(candidates * 7);
    expect(jobs.filter((j) => j.adapt).length).toBe(candidates * 3);
    expect(jobs.filter((j) => j.adapt).every((j) => PROBES.includes(j.players[0].name))).toBe(true);
    const slotIds = Object.values(PERSONA_SLOTS).flat().map((slot) => slot.id);
    expect(personas.length).toBe(Math.min(8, candidates));
    expect(new Set(personas.map((p) => p.id)).size).toBe(personas.length);
    for (const p of personas) {
      expect(slotIds).toContain(p.id);
      expect(p.brain).toBe('heuristic');
      expect(p.tag).toMatch(/^[A-Z]{3}$/);
      expect(Object.keys(p.dials).length).toBeGreaterThan(20);
      expect(Number.isFinite(p.quickGateWorst)).toBe(true);
    }
  }, 120_000);
});

describe.skipIf(!process.env.POKER_SLOW)('training loop on worker threads', () => {
  it('gives the same result inline and on a two-thread pool', async () => {
    const options = { ...TINY, seed: 5 };
    const inlineResult = await train({ options, runAll: inline() });
    const pool = createPool({ size: 2 });
    try {
      const pooled = await train({ options, runAll: pool.runAll });
      expect(pooled.archive).toEqual(inlineResult.archive);
      expect(pooled.history).toEqual(inlineResult.history);
    } finally {
      await pool.close();
    }
  }, 300_000);
});

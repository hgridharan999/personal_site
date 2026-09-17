// scripts/poker/lib/trainLoop.test.js
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createPool } from './pool.js';
import { ADAPT_JOB_DEALS } from './tableJob.js';
import { PROBES, OPPONENTS } from './gate.js';
import { ANCHORS, NICHES } from './evolve.js';
import {
  train, selectPersonas, validateOptions, validatePersonaSelection, quickGateSeed, reevalSeed, PERSONA_SLOTS, TRAIN_DEFAULTS, SMOKE_OPTIONS, REEVAL_ROUNDS,
} from './trainLoop.js';

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

const TINY = { population: 10, generations: 2, rounds: 1, deals: 2, probeHands: 6, equityIterations: 10, eliteCount: 4, patience: 5 };

/** The --seed default of scripts/poker/benchmark.js, read from its source so the test follows the CLI. */
const benchmarkDefaultSeed = () => {
  const source = readFileSync(new URL('../benchmark.js', import.meta.url), 'utf8');
  const match = source.match(/seed:\s*\{\s*type:\s*'string',\s*default:\s*'(\d+)'\s*\}/);
  expect(match, 'benchmark.js --seed default').not.toBeNull();
  return Number(match[1]);
};

describe('training options', () => {
  it('uses the spec population of 50 by default and names the eight contract personas', () => {
    expect(TRAIN_DEFAULTS.population).toBe(50);
    const slots = Object.values(PERSONA_SLOTS).flat();
    expect(slots.map((s) => s.tag).sort()).toEqual(['BRK', 'DCH', 'INK', 'LRK', 'MOS', 'ROK', 'SBL', 'VIP']);
    expect(TRAIN_DEFAULTS.probeWeight).toBeGreaterThan(0);
    expect(TRAIN_DEFAULTS.probeWeight).toBeLessThan(1);
    expect(TRAIN_DEFAULTS.rounds % ANCHORS.length).toBe(0); // every individual meets every anchor each generation
    expect(SMOKE_OPTIONS.generations).toBeLessThanOrEqual(TRAIN_DEFAULTS.generations);
    expect(validateOptions(TRAIN_DEFAULTS)).toBeNull();
    expect(validateOptions({ ...TRAIN_DEFAULTS, ...SMOKE_OPTIONS })).toBeNull();
  });

  it('accepts only a selection of exactly 8 personas with unique ids', () => {
    const eight = Object.values(PERSONA_SLOTS).flat().map((slot) => ({ ...slot }));
    expect(validatePersonaSelection(eight)).toBeNull();
    expect(validatePersonaSelection(eight.slice(0, 7))).toMatch(/exactly 8 personas/);
    expect(validatePersonaSelection([...eight, { ...eight[0] }])).toMatch(/exactly 8 personas/);
    expect(validatePersonaSelection([...eight.slice(0, 7), { ...eight[7], id: eight[0].id }])).toMatch(/unique ids/);
  });

  it('rejects a population that is not a multiple of 5 and an elite count that is not below the population', () => {
    expect(validateOptions({ ...TRAIN_DEFAULTS, population: 12 })).toMatch(/multiple of 5/);
    expect(validateOptions({ ...TRAIN_DEFAULTS, population: 10, eliteCount: 10 })).toMatch(/eliteCount/);
    expect(validateOptions({ ...TRAIN_DEFAULTS, rounds: 1000, deals: 1000 })).toMatch(/1,000,000/);
  });

  it('salts the quick-gate and re-evaluation seeds apart from the training seed and the release benchmark seed', () => {
    const benchmarkSeed = benchmarkDefaultSeed();
    for (let seed = TRAIN_DEFAULTS.seed - 3; seed <= TRAIN_DEFAULTS.seed + 3; seed += 1) {
      const salted = [quickGateSeed(seed), reevalSeed(seed)];
      expect(new Set(salted).size, `seed ${seed}`).toBe(2);
      for (const s of salted) expect([seed, seed + 1, benchmarkSeed], `seed ${seed}`).not.toContain(s);
      expect(Number.isInteger(quickGateSeed(seed)) && quickGateSeed(seed) >= 0).toBe(true);
    }
  });
});

describe('training loop (inline, tiny budgets)', () => {
  it('stops when the time budget runs out', async () => {
    let t = 0;
    const result = await train({
      options: { population: 5, generations: 10, rounds: 1, deals: 1, probeHands: 6, equityIterations: 10, eliteCount: 4, minutes: 1 },
      runAll: inline(),
      now: () => {
        t += 61_000;
        return t;
      },
    });
    expect(result.stoppedBecause).toBe('time');
    expect(result.generations).toBe(1);
  }, 60_000);

  it('throws on invalid options', async () => {
    await expect(train({ options: { ...TINY, population: 12 }, runAll: inline() })).rejects.toThrow(/multiple of 5/);
  });

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

  it('schedules anchors evenly: with rounds a multiple of 6, every seat meets every anchor equally often', async () => {
    const { jobs, runAll } = recording(inline());
    await train({ options: { ...TINY, generations: 1, rounds: ANCHORS.length, deals: 1, equityIterations: 10 }, runAll });
    const tableJobs = jobs.filter((j) => !j.adapt);
    expect(tableJobs.length).toBe(ANCHORS.length * 2);
    for (let round = 0; round < ANCHORS.length; round += 1) {
      const anchors = tableJobs.slice(round * 2, round * 2 + 2).map((j) => j.players[5].name);
      expect(new Set(anchors).size).toBe(1);
    }
    expect(tableJobs.map((j) => j.players[5].name).sort()).toEqual([...ANCHORS, ...ANCHORS].sort());
  }, 60_000);

  it('is reproducible for a seed regardless of the order jobs finish in', async () => {
    const options = { ...TINY, generations: 2, seed: 11, archiveMinSelfHands: 1 };
    const a = await train({ options, runAll: inline() });
    const b = await train({ options, runAll: reversed(inline()) });
    expect(b.archive).toEqual(a.archive);
    expect(b.history).toEqual(a.history);
    const c = await train({ options: { ...options, seed: 12 }, runAll: inline() });
    expect(c.history).not.toEqual(a.history);
  }, 120_000);

  it('archives only individuals that survived two generations or played enough self-play hands', async () => {
    const one = await train({ options: { ...TINY, generations: 1 }, runAll: inline() });
    expect(Object.values(one.archive).flat()).toEqual([]);
    const enough = await train({ options: { ...TINY, generations: 1, archiveMinSelfHands: 12 }, runAll: inline() });
    expect(Object.values(enough.archive).flat().length).toBeGreaterThan(0);
    const two = await train({ options: TINY, runAll: inline() });
    const archived = Object.values(two.archive).flat();
    expect(archived.length).toBeGreaterThan(0);
    expect(archived.length).toBeLessThanOrEqual(TINY.eliteCount);
    for (const entry of archived) expect(entry.id).toBeLessThan(TINY.population); // generation-one survivors only
  }, 120_000);

  it('tracks a smoothed elite-mean signal for stall detection and checkpoints every N generations', async () => {
    const checkpoints = [];
    const result = await train({
      options: { ...TINY, generations: 3, checkpointEvery: 2 }, runAll: inline(), checkpoint: (state) => checkpoints.push(state),
    });
    expect(result.history.length).toBe(3);
    expect(result.bestByGeneration.length).toBe(3);
    result.history.forEach((eliteMean, g) => expect(eliteMean).toBeLessThanOrEqual(result.bestByGeneration[g] + 1e-12));
    expect(checkpoints.map((c) => c.generation)).toEqual([2]);
    expect(checkpoints[0].history).toEqual(result.history.slice(0, 2));
    expect(checkpoints[0].archive).toBeDefined();
  }, 120_000);

  it('trains a tiny population and selects named personas after re-evaluating the top candidates per niche', async () => {
    const runAll = inline();
    const lines = [];
    const result = await train({ options: { ...TINY, archiveMinSelfHands: 1 }, runAll, log: (line) => lines.push(line) });
    expect(result.generations).toBe(2);
    expect(result.stoppedBecause).toBe('max-generations');
    // generations x (tables x deals x rotations + individuals x probes x deals x rotations)
    expect(result.hands).toBe(2 * (2 * 2 * 6 + 10 * PROBES.length * 1 * 6));
    expect(lines.length).toBe(2);
    const { jobs, runAll: recorded } = recording(runAll);
    let rows = [];
    const seed = 3;
    const topK = 2;
    const personas = await selectPersonas({
      archive: result.archive, runAll: recorded, gateHands: 6, seed, equityIterations: 10, reevalHands: 6, topK, onEvaluated: (r) => { rows = r; },
    });
    const candidates = Object.values(result.archive).reduce((n, list) => n + list.length, 0);
    const topPerNiche = NICHES.reduce((n, niche) => n + Math.min(topK, (result.archive[niche] ?? []).length), 0);
    const poolSize = Math.max(topPerNiche, Math.min(8, candidates));
    expect(rows.length).toBe(poolSize);
    // re-evaluation on its own salted seed: mixed tables among the pool plus adaptive probes
    const reeval = jobs.filter((j) => j.seed === reevalSeed(seed));
    expect(reeval.filter((j) => !j.adapt).length).toBe(REEVAL_ROUNDS * Math.ceil(poolSize / 5));
    expect(reeval.filter((j) => j.adapt).length).toBe(poolSize * PROBES.length);
    // quick gate on its own salted seed, pool only: 4 baselines with adaptation off, 3 probes with adaptation on
    const quick = jobs.filter((j) => j.seed === quickGateSeed(seed));
    expect(quick.length).toBe(poolSize * OPPONENTS.length);
    expect(quick.filter((j) => j.adapt).length).toBe(poolSize * PROBES.length);
    expect(reeval.length + quick.length).toBe(jobs.length);
    for (const row of rows) {
      expect(Number.isFinite(row.score)).toBe(true);
      expect(row.lower).toBeLessThanOrEqual(row.score);
    }
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
    const options = { ...TINY, seed: 5, archiveMinSelfHands: 1 };
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

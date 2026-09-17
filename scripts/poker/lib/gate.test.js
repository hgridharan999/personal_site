// scripts/poker/lib/gate.test.js
import { describe, it, expect } from 'vitest';
import { ARCHETYPES } from '../../../src/private/trainers/poker/bots/dials.js';
import { emptyAcc, addSample } from './ciStats.js';
import { createPool } from './pool.js';
import { ADAPT_JOB_DEALS } from './tableJob.js';
import { matchupJobs, summarizeMatchup, runMatchups, gateVerdict, formatReport, OPPONENTS, BASELINES, PROBES } from './gate.js';

const accOf = (xs) => xs.reduce(addSample, emptyAcc());

describe('gate logic', () => {
  it('lists the spec baselines and probes', () => {
    expect([...BASELINES]).toEqual(['callingStation', 'randomLegal', 'rawEquity', 'tightPassive']);
    expect([...PROBES]).toEqual(['always3Bet', 'alwaysCbet', 'alwaysOverbetRiver']);
    expect(OPPONENTS.length).toBe(7);
  });

  it('splits a matchup into chunks of deals with the opponent in the profiled chair', () => {
    const jobs = matchupJobs({ dials: ARCHETYPES['tight-aggressive'], opponent: 'rawEquity', hands: 3000, seed: 1, equityIterations: 50, chunkDeals: 200 });
    expect(jobs.map((j) => j.deals)).toEqual([200, 200, 100]);
    expect(jobs.map((j) => j.firstDeal)).toEqual([0, 200, 400]);
    expect(jobs[0].players[0]).toEqual({ kind: 'brain', name: 'rawEquity' });
    expect(jobs[0].players.slice(1).every((p) => p.kind === 'dials')).toBe(true);
    expect(jobs[0].subject).toBe(0);
  });

  it('passes adapt through to every job, defaults it to false, and keeps chunkDeals for non-adaptive jobs', () => {
    const base = { dials: ARCHETYPES['tight-aggressive'], opponent: 'always3Bet', hands: 600, seed: 1, equityIterations: 50, chunkDeals: 50 };
    const baseline = matchupJobs(base);
    expect(baseline.every((j) => j.adapt === false)).toBe(true);
    expect(baseline.length).toBe(2); // 100 deals / chunkDeals 50 -> 2 jobs, since non-adaptive results never depend on chunking
    const adaptive = matchupJobs({ ...base, adapt: true });
    expect(adaptive.every((j) => j.adapt === true && j.subject === 0)).toBe(true);
    // adaptive jobs ignore chunkDeals (50) entirely and use ADAPT_JOB_DEALS (500); 100 deals fit in one job
    expect(adaptive.length).toBe(1);
    expect(adaptive[0].deals).toBe(100);
  });

  it('sizes adaptive jobs to ADAPT_JOB_DEALS regardless of chunkDeals, with only the final job partial', () => {
    const totalDeals = ADAPT_JOB_DEALS * 2 + 40;
    const jobs = matchupJobs({
      dials: ARCHETYPES['tight-aggressive'], opponent: 'always3Bet', hands: totalDeals * 6, seed: 1,
      equityIterations: 50, chunkDeals: 17, adapt: true,
    });
    expect(jobs.map((j) => j.deals)).toEqual([ADAPT_JOB_DEALS, ADAPT_JOB_DEALS, 40]);
    expect(jobs.every((j) => j.adapt === true)).toBe(true);
    // a baseline (non-adaptive) job for the same hands keeps the caller's chunkDeals instead
    const baselineJobs = matchupJobs({
      dials: ARCHETYPES['tight-aggressive'], opponent: 'rawEquity', hands: totalDeals * 6, seed: 1,
      equityIterations: 50, chunkDeals: 17,
    });
    expect(baselineJobs.every((j) => j.deals <= 17)).toBe(true);
  });

  it('converts the opponent per-deal losses to persona BB/100 per seat with a 95% CI (n >= 30 deals)', () => {
    // the opponent loses 60 units per deal: 60 units over 5 persona seats x 6 hands = 2 units = 1 BB per seat-hand
    const constant = summarizeMatchup([{ dealAccs: [accOf(new Array(30).fill(-60))] }]);
    expect(constant.n).toBe(30);
    expect(constant.bbPer100).toBeCloseTo(100, 10);
    expect(constant.hands).toBe(180);
    expect(constant.opponentBbPer100).toBeCloseTo(-500, 10);
    expect(constant.passed).toBe(true);
    // 30 deals, alternating a big opponent win and a bigger opponent loss: noisy but n is large enough for a
    // real (finite) CI, and the spread is wide enough that the lower bound dips below 0 even though it can.
    const swings = Array.from({ length: 15 }, (_, i) => [600, -660]).flat();
    const noisy = summarizeMatchup([{ dealAccs: [accOf(swings.slice(0, 20))] }, { dealAccs: [accOf(swings.slice(20))] }]);
    expect(noisy.n).toBe(30);
    expect(Number.isFinite(noisy.lower)).toBe(true);
    expect(noisy.lower).toBeLessThan(0);
    expect(noisy.passed).toBe(false);
  });

  it('fails the gate on a matchup with fewer than 30 deals, however good its mean looks', () => {
    // every deal the opponent loses a lot, but only 10 deals: too few for a normal-approximation CI, so
    // ciStats.summarize refuses to report a finite (and therefore possibly falsely confident) bound.
    const tooFew = summarizeMatchup([{ dealAccs: [accOf(new Array(10).fill(-600))] }]);
    expect(tooFew.n).toBe(10);
    expect(tooFew.lower).toBe(-Infinity);
    expect(tooFew.upper).toBe(Infinity);
    expect(tooFew.passed).toBe(false);
  });

  it('fails the gate when any matchup fails and formats a report', () => {
    const good = { personaId: 'duchess', opponent: 'rawEquity', hands: 6, bbPer100: 5, lower: 1, upper: 9, opponentBbPer100: -25, passed: true };
    const bad = { ...good, opponent: 'always3Bet', bbPer100: -1, lower: -3, upper: 1, passed: false };
    expect(gateVerdict([good])).toEqual({ passed: true, failures: [] });
    const verdict = gateVerdict([good, bad]);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toEqual(['duchess vs always3Bet: -1.00 BB/100, 95% CI [-3.00, 1.00]']);
    expect(gateVerdict([]).passed).toBe(false);
    expect(formatReport([good, bad])).toContain('FAIL');
  });

  it('prints n/a for non-finite CI bounds in the report, and serializes them to null in JSON', () => {
    const tooFew = { personaId: 'duchess', opponent: 'rawEquity', adapt: false, gating: true, n: 10, ...summarizeMatchup([{ dealAccs: [accOf(new Array(10).fill(-600))] }]) };
    expect(formatReport([tooFew])).toContain('n/a');
    expect(formatReport([tooFew])).not.toContain('Infinity');
    // JSON.stringify's own (default) behavior for non-finite numbers is `null`, which is exactly what we want
    // written for a too-small matchup: not a fabricated number, and not a crash.
    const written = JSON.parse(JSON.stringify({ matchups: [tooFew] }));
    expect(written.matchups[0].lower).toBeNull();
    expect(written.matchups[0].upper).toBeNull();
    expect(written.matchups[0].n).toBe(10);
  });

  it('ignores informational matchups in the verdict but still reports them', () => {
    const gate = { personaId: 'duchess', opponent: 'always3Bet', adapt: true, gating: true, hands: 6, bbPer100: 5, lower: 1, upper: 9, opponentBbPer100: -25, passed: true };
    const info = { ...gate, adapt: false, gating: false, bbPer100: -1, lower: -3, upper: 1, passed: false };
    expect(gateVerdict([gate, info])).toEqual({ passed: true, failures: [] });
    expect(gateVerdict([info]).passed).toBe(false);
    const failed = gateVerdict([{ ...gate, lower: -1, passed: false }]);
    expect(failed.failures).toEqual(['duchess vs always3Bet (adapt): 5.00 BB/100, 95% CI [-1.00, 9.00]']);
    const report = formatReport([gate, info]);
    expect(report).not.toContain('FAIL');
    expect(report.split('\n')).toHaveLength(3);
    expect(report).toContain('info');
  });
});

describe('runMatchups (inline, tiny budget)', () => {
  it('runs matchups for two personas', async () => {
    const pool = createPool({ size: 0 });
    const personas = [{ id: 'a', dials: ARCHETYPES['tight-aggressive'] }, { id: 'b', dials: ARCHETYPES['loose-passive'] }];
    const matchups = await runMatchups({ personas, opponents: ['callingStation', 'rawEquity'], hands: 12, seed: 2, equityIterations: 20, runAll: pool.runAll });
    expect(matchups.map((m) => `${m.personaId}:${m.opponent}:${m.hands}`)).toEqual(['a:callingStation:12', 'a:rawEquity:12', 'b:callingStation:12', 'b:rawEquity:12']);
    expect(matchups.every((m) => m.adapt === false && m.gating === true)).toBe(true);
  }, 60_000);

  it('runs probes twice: gating with adaptation on, informational with it off', async () => {
    const jobs = [];
    const runAll = async (batch) => {
      jobs.push(...batch);
      return batch.map((job) => ({ dealAccs: [accOf(new Array(job.deals).fill(job.adapt ? -60 : 60))] }));
    };
    // 180 hands -> 30 deals per job, the minimum for a finite (real) CI; see ciStats.summarize.
    const matchups = await runMatchups({ personas: [{ id: 'a', dials: ARCHETYPES['tight-aggressive'] }], opponents: ['rawEquity', 'alwaysCbet'], hands: 180, seed: 2, equityIterations: 20, runAll });
    expect(matchups.map((m) => `${m.opponent}:${m.adapt}:${m.gating}`)).toEqual(['rawEquity:false:true', 'alwaysCbet:true:true', 'alwaysCbet:false:false']);
    expect(jobs.map((j) => j.adapt)).toEqual([false, true, false]);
    expect(matchups[1].passed).toBe(true);
    expect(matchups[2].passed).toBe(false);
  });

  it('reports progress per matchup as it completes, while keeping the returned array in plan order', async () => {
    const order = [];
    let calls = 0;
    const runAll = async (batch) => {
      // the matchup submitted first ("a") is made to resolve last, so completion order and plan order differ.
      calls += 1;
      if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 20));
      return batch.map((job) => ({ dealAccs: [accOf(new Array(job.deals).fill(-60))] }));
    };
    const personas = [{ id: 'a', dials: ARCHETYPES['tight-aggressive'] }, { id: 'b', dials: ARCHETYPES['loose-passive'] }];
    const onMatchup = (m) => order.push(m.personaId);
    const matchups = await runMatchups({ personas, opponents: ['rawEquity'], hands: 180, seed: 2, equityIterations: 20, runAll, onMatchup });
    expect(matchups.map((m) => m.personaId)).toEqual(['a', 'b']); // plan order, regardless of completion order
    expect(order).toEqual(['b', 'a']); // progress fired in completion order: b's matchup (submitted second) had no delay
    expect(order.length).toBe(matchups.length);
  });
});

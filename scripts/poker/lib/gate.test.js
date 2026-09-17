// scripts/poker/lib/gate.test.js
import { describe, it, expect } from 'vitest';
import { ARCHETYPES } from '../../../src/private/trainers/poker/bots/dials.js';
import { emptyAcc, addSample } from './ciStats.js';
import { createPool } from './pool.js';
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

  it('passes adapt through to every job and defaults it to false', () => {
    const base = { dials: ARCHETYPES['tight-aggressive'], opponent: 'always3Bet', hands: 600, seed: 1, equityIterations: 50, chunkDeals: 50 };
    expect(matchupJobs(base).every((j) => j.adapt === false)).toBe(true);
    const adaptive = matchupJobs({ ...base, adapt: true });
    expect(adaptive.length).toBe(2);
    expect(adaptive.every((j) => j.adapt === true && j.subject === 0)).toBe(true);
  });

  it('converts the opponent per-deal losses to persona BB/100 per seat with a 95% CI', () => {
    // the opponent loses 60 units per deal: 60 units over 5 persona seats x 6 hands = 2 units = 1 BB per seat-hand
    const constant = summarizeMatchup([{ dealAccs: [accOf([-60, -60, -60])] }]);
    expect(constant.bbPer100).toBeCloseTo(100, 10);
    expect(constant.hands).toBe(18);
    expect(constant.opponentBbPer100).toBeCloseTo(-500, 10);
    expect(constant.passed).toBe(true);
    const noisy = summarizeMatchup([{ dealAccs: [accOf([-600, 600, -60])] }, { dealAccs: [accOf([30])] }]);
    expect(noisy.lower).toBeLessThan(0);
    expect(noisy.passed).toBe(false);
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
    const matchups = await runMatchups({ personas: [{ id: 'a', dials: ARCHETYPES['tight-aggressive'] }], opponents: ['rawEquity', 'alwaysCbet'], hands: 12, seed: 2, equityIterations: 20, runAll });
    expect(matchups.map((m) => `${m.opponent}:${m.adapt}:${m.gating}`)).toEqual(['rawEquity:false:true', 'alwaysCbet:true:true', 'alwaysCbet:false:false']);
    expect(jobs.map((j) => j.adapt)).toEqual([false, true, false]);
    expect(matchups[1].passed).toBe(true);
    expect(matchups[2].passed).toBe(false);
  });
});

// scripts/poker/lib/trainLoop.js
// The training loop and persona selection, with job execution injected (worker pool or inline).
//
// Fitness (BB/100) of an individual, accumulated over every generation it survives:
//   fitness = (1 - probeWeight) * selfPlay + probeWeight * probes
// - selfPlay: mixed training tables of five population members plus one anchor bot drawn uniformly from
//   evolve.ANCHORS (three baselines: rawEquity, tightPassive, callingStation; three exploit probes), adaptation off.
//   It is BB/100 relative to tablemates, so the anchor's losses cancel out and only how well a member exploits
//   the anchor and outplays the other members counts. Styles (niches) are measured here only.
// - probes: the mean BB/100 per persona seat over the three exploit probes (always3Bet, alwaysCbet,
//   alwaysOverbetRiver), each played in the benchmark format (probe in the profiled chair, five copies of the
//   individual) with adaptation on and adaptive jobs of ADAPT_JOB_DEALS deals (gate.matchupJobs), so the
//   adaptation dials (vs3betCall, fourBet, floatFreq, checkRaise, callThresh, mdfDefend, adaptStrength, ...) are
//   tuned the way the release gate measures them. Every individual plays the same probe deals in a generation.
// With the default probeWeight of 0.3: 70% mixed-table play (5/6 of those seats self-play, 1/6 an anchor split
// evenly between baselines and non-adaptive probes) and 30% adaptive probe matchups, split evenly over the probes.
//
// Reproducibility: every job is built on the main thread from `seed` alone and results are consumed in job order,
// so a run depends only on its options and seed, never on the thread count or on the order jobs finish in.
import { mulberry32 } from '../../../src/private/trainers/core/rng.js';
import {
  NICHES, fitnessOf, initialPopulation, scheduleTables, updateArchive, nextGeneration, hasStalled, mergeProfiles,
} from './evolve.js';
import { runMatchups, matchupJobs, summarizeMatchup, OPPONENTS, PROBES } from './gate.js';
import { dealSeed } from './tableJob.js';
import { emptyAcc, mergeAcc } from './ciStats.js';

export const TRAIN_DEFAULTS = Object.freeze({
  population: 50, generations: 150, patience: 20, minDelta: 1, rounds: 4, deals: 250, equityIterations: 150,
  eliteCount: 10, seed: 20260916, minutes: 0, gateHands: 12_000, probeHands: 3_000, probeWeight: 0.3,
});

/** Tiny budgets for `train.js --smoke` (finishes in well under a minute on a few threads). */
export const SMOKE_OPTIONS = Object.freeze({
  population: 10, generations: 2, rounds: 1, deals: 5, equityIterations: 30, eliteCount: 4, gateHands: 60, probeHands: 60,
});

/** Named persona slots per niche (contracts §3.3 names and tags). */
export const PERSONA_SLOTS = Object.freeze({
  'tight-aggressive': [{ id: 'duchess', name: 'Duchess', tag: 'DCH' }, { id: 'sable', name: 'Sable', tag: 'SBL' }],
  'loose-aggressive': [{ id: 'viper', name: 'Viper', tag: 'VIP' }, { id: 'ink', name: 'Ink', tag: 'INK' }],
  'tight-passive': [{ id: 'rook', name: 'Rook', tag: 'ROK' }, { id: 'moss', name: 'Moss', tag: 'MOS' }],
  'loose-passive': [{ id: 'brick', name: 'Brick', tag: 'BRK' }, { id: 'lark', name: 'Lark', tag: 'LRK' }],
});

// Deal index spacing per generation for the mixed tables, so no two generations share deals.
const GENERATION_DEALS = 1_000_000;
const PROBE_SEED_SALT = 0x2c1b3c6d;

/** Per-individual results behind its fitness; children from nextGeneration start without one. */
const ledgerOf = (ind) => {
  ind.ledger ??= { selfBbWon: 0, selfHands: 0, probeHands: 0, probeAccs: Object.fromEntries(PROBES.map((p) => [p, emptyAcc()])) };
  return ind.ledger;
};

const probeScore = (ledger) => PROBES.reduce((sum, p) => sum + summarizeMatchup([{ dealAccs: [ledger.probeAccs[p]] }]).bbPer100, 0) / PROBES.length;

/** Writes the combined fitness into bbWon/hands, the fields evolve.fitnessOf ranks by. */
function syncFitness(ind, probeWeight) {
  const l = ledgerOf(ind);
  const selfPlay = l.selfHands > 0 ? (100 * l.selfBbWon) / l.selfHands : 0;
  const fitness = (1 - probeWeight) * selfPlay + probeWeight * probeScore(l);
  ind.hands = l.selfHands + l.probeHands;
  ind.bbWon = (fitness * ind.hands) / 100;
}

/** All jobs for one generation: mixed tables first, then every individual against every probe. */
function generationJobs(population, generation, o, rng) {
  const tableJobs = [];
  const seatings = [];
  for (let round = 0; round < o.rounds; round += 1) {
    for (const table of scheduleTables(population.length, rng)) {
      seatings.push(table.members);
      tableJobs.push({
        players: [...table.members.map((i) => ({ kind: 'dials', dials: population[i].dials })), { kind: 'brain', name: table.anchor }],
        seed: o.seed,
        firstDeal: tableJobs.length * o.deals + generation * GENERATION_DEALS,
        deals: o.deals,
        equityIterations: o.equityIterations,
        subject: table.members.length, // the anchor sits in the profiled hero chair
        trackStyles: true,
      });
    }
  }
  const probeSeed = dealSeed(o.seed ^ PROBE_SEED_SALT, generation);
  const probeRuns = population.flatMap((ind, index) => PROBES.map((probe) => ({
    index,
    probe,
    jobs: matchupJobs({ dials: ind.dials, opponent: probe, hands: o.probeHands, seed: probeSeed, equityIterations: o.equityIterations, adapt: true }),
  })));
  return { tableJobs, seatings, probeRuns };
}

/** Folds one generation's results into the individuals' ledgers. @returns {number} hands played */
function scoreGeneration(population, { tableJobs, seatings, probeRuns }, results, probeWeight) {
  let hands = 0;
  tableJobs.forEach((_, j) => {
    const result = results[j];
    hands += result.hands;
    // Fitness is relative to tablemates, so the anchor bot drawn for a table does not add noise.
    const members = seatings[j];
    const tableMean = members.reduce((sum, _m, k) => sum + result.nets[k], 0) / members.length;
    members.forEach((index, k) => {
      const ind = population[index];
      const l = ledgerOf(ind);
      l.selfBbWon += (result.nets[k] - tableMean) / 2;
      l.selfHands += result.hands;
      ind.profile = mergeProfiles(ind.profile, result.styles[k]);
    });
  });
  let next = tableJobs.length;
  for (const { index, probe, jobs } of probeRuns) {
    const l = ledgerOf(population[index]);
    for (const result of results.slice(next, next + jobs.length)) {
      hands += result.hands;
      l.probeHands += result.hands;
      l.probeAccs[probe] = mergeAcc(l.probeAccs[probe], result.dealAccs[0]);
    }
    next += jobs.length;
  }
  population.forEach((ind) => syncFitness(ind, probeWeight));
  return hands;
}

/**
 * @param {{ options:Partial<typeof TRAIN_DEFAULTS>, runAll:(jobs:object[]) => Promise<object[]>, log?:(line:string) => void, now?:() => number }} input
 * @returns {Promise<{ archive:object, history:number[], generations:number, hands:number, stoppedBecause:'stalled'|'time'|'max-generations' }>}
 */
export async function train({ options, runAll, log = () => {}, now = Date.now }) {
  const o = { ...TRAIN_DEFAULTS, ...options };
  if (o.rounds * Math.ceil(o.population / 5) * o.deals >= GENERATION_DEALS) throw new Error('rounds x tables x deals must stay below 1,000,000');
  const rng = mulberry32(o.seed);
  const started = now();
  let population = initialPopulation(o.population, rng);
  let nextId = population.length;
  let archive = {};
  const history = [];
  let hands = 0;
  let stoppedBecause = 'max-generations';
  let generation = 0;

  for (; generation < o.generations; generation += 1) {
    const plan = generationJobs(population, generation, o, rng);
    const jobs = [...plan.tableJobs, ...plan.probeRuns.flatMap((run) => run.jobs)];
    const genStart = now();
    const results = await runAll(jobs);
    const genHands = scoreGeneration(population, plan, results, o.probeWeight);
    hands += genHands;
    archive = updateArchive(archive, population, { minHands: o.rounds * o.deals * 6 });
    const best = Math.max(...population.map(fitnessOf));
    history.push(best);
    const counts = NICHES.map((n) => `${n}:${(archive[n] ?? []).length}`).join(' ');
    const seconds = (now() - genStart) / 1000;
    log(`gen ${generation + 1}: best fitness ${best.toFixed(1)} BB/100, ${(genHands / Math.max(seconds, 1e-3)).toFixed(0)} hands/s, archive ${counts}`);
    if (hasStalled(history, { patience: o.patience, minDelta: o.minDelta })) {
      stoppedBecause = 'stalled';
      generation += 1;
      break;
    }
    if (o.minutes > 0 && now() - started >= o.minutes * 60_000) {
      stoppedBecause = 'time';
      generation += 1;
      break;
    }
    ({ population, nextId } = nextGeneration(population, { rng, eliteCount: o.eliteCount, nextId }));
  }
  return { archive, history, generations: generation, hands, stoppedBecause };
}

/**
 * Picks two personas per niche: archive candidates in fitness order, keeping the first that beat every
 * opponent on the quick gate (mean BB/100 above 0). The quick gate uses the benchmark's gating semantics
 * (baselines with adaptation off, probes with adaptation on) and skips the informational runs. Short niches
 * are filled with the best unused candidates from any niche, labelled with their measured niche.
 * @returns {Promise<object[]>} Persona objects with dials, fitness and measured style
 */
export async function selectPersonas({ archive, runAll, gateHands, seed, equityIterations, log = () => {} }) {
  const all = NICHES.flatMap((niche) => (archive[niche] ?? []).map((c) => ({ ...c, niche })));
  let done = 0;
  const total = all.length * OPPONENTS.length;
  const quick = await runMatchups({
    personas: all.map((c) => ({ id: String(c.id), dials: c.dials })), opponents: OPPONENTS, hands: gateHands, seed, equityIterations, runAll,
    informational: false,
    onMatchup: (m) => {
      done += 1;
      log(`quick gate ${done}/${total}: candidate ${m.personaId} vs ${m.opponent}${m.adapt ? ' (adapt)' : ''} ${m.bbPer100.toFixed(1)} BB/100`);
    },
  });
  const worstMean = (c) => Math.min(...quick.filter((m) => m.personaId === String(c.id)).map((m) => m.bbPer100));
  const used = new Set();
  const picks = {};
  for (const niche of NICHES) {
    picks[niche] = (archive[niche] ?? []).map((c) => ({ ...c, niche })).filter((c) => worstMean(c) > 0).slice(0, 2);
    picks[niche].forEach((c) => used.add(c.id));
  }
  const spare = all.filter((c) => !used.has(c.id)).sort((a, b) => worstMean(b) - worstMean(a));
  const personas = [];
  for (const niche of NICHES) {
    while (picks[niche].length < 2 && spare.length) {
      const c = spare.shift();
      log(`niche ${niche}: filling a slot with candidate ${c.id} from ${c.niche} (worst quick-gate mean ${worstMean(c).toFixed(1)})`);
      picks[niche].push(c);
    }
    picks[niche].forEach((c, i) => {
      personas.push({
        ...PERSONA_SLOTS[niche][i], style: c.niche, brain: 'heuristic', dials: c.dials,
        fitness: Number(c.fitness.toFixed(2)), styleStats: c.style, quickGateWorst: Number(worstMean(c).toFixed(2)),
      });
    });
  }
  return personas;
}

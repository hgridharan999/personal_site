// scripts/poker/lib/trainLoop.js
// The training loop and persona selection, with job execution injected (worker pool or inline).
//
// Fitness components of an individual, accumulated over every generation it survives:
// - selfPlay: BB/100 relative to tablemates in mixed training tables of five population members plus one anchor
//   bot (three baselines: rawEquity, tightPassive, callingStation; three exploit probes), adaptation off. The
//   anchor's losses cancel out, so only how well a member exploits the anchor and outplays the other members
//   counts. Anchors are scheduled evenly: every table in round r of generation g gets ANCHORS[(g*rounds + r) % 6],
//   so with rounds a multiple of 6 every individual meets every anchor equally often. Styles (niches) are
//   measured here only.
// - probes: the mean BB/100 per persona seat over the three exploit probes (always3Bet, alwaysCbet,
//   alwaysOverbetRiver), each played in the benchmark format (probe in the profiled chair, five copies of the
//   individual) with adaptation on (gate.matchupJobs), so the adaptation dials are tuned the way the release
//   gate measures them. Every individual plays the same probe deals in a generation.
//
// Selection fitness (elites, tournaments): each component is standardized across the current population
// (z-scores, mean 0 and SD 1) and mixed as (1 - probeWeight) * z(selfPlay) + probeWeight * z(probes), so
// probeWeight is the real weight whatever the raw spreads (self-play BB/100 spreads about 5x wider than probes).
//
// Score (archive, history, stall detection): the same mix, but divided by the component SDs of generation one
// instead of the current ones and not re-centred, so it stays comparable across generations. Units: generation-one
// SDs. A per-generation z-score cannot serve here: the best of 50 is always about +2 SD.
//
// Winner's curse: an individual enters the archive only after two generations or archiveMinSelfHands self-play
// hands (default 40,000; see train.js for the noise figures), and its entry is refreshed every generation it is
// alive. Stall detection watches the mean score of the eliteCount fittest individuals, not the noisy maximum.
// Persona selection re-evaluates the top candidates of each niche on a fresh seed and ranks them by the lower 95%
// bound of that re-evaluation.
//
// Reproducibility: every job is built on the main thread from `seed` alone and results are consumed in job order,
// so a run depends only on its options and seed, never on the thread count or on the order jobs finish in.
import { mulberry32 } from '../../../src/private/trainers/core/rng.js';
import {
  NICHES, ANCHORS, fitnessOf, initialPopulation, scheduleTables, updateArchive, nextGeneration, hasStalled, mergeProfiles,
} from './evolve.js';
import { runMatchups, matchupJobs, summarizeMatchup, OPPONENTS, PROBES } from './gate.js';
import { dealSeed } from './tableJob.js';
import { emptyAcc, mergeAcc, Z95 } from './ciStats.js';
import { meanSd, mixStandardized, scaleOrOne, tCritical95 } from './fitnessStats.js';

export const TRAIN_DEFAULTS = Object.freeze({
  population: 50, generations: 150, patience: 20, minDelta: 0.1, rounds: 6, deals: 600, equityIterations: 150,
  eliteCount: 10, seed: 20260916, minutes: 0, gateHands: 12_000, probeHands: 1_800, probeWeight: 0.3,
  archiveMinSelfHands: 40_000, checkpointEvery: 10, reevalHands: 20_000, reevalTopK: 4,
});

/** Tiny budgets for `train.js --smoke` (finishes in well under a minute on a few threads). */
export const SMOKE_OPTIONS = Object.freeze({
  population: 10, generations: 2, rounds: 1, deals: 5, equityIterations: 30, eliteCount: 4, gateHands: 60, probeHands: 60,
  archiveMinSelfHands: 1, reevalHands: 60,
});

/** Named persona slots per niche (contracts §3.3 names and tags). */
export const PERSONA_SLOTS = Object.freeze({
  'tight-aggressive': [{ id: 'duchess', name: 'Duchess', tag: 'DCH' }, { id: 'sable', name: 'Sable', tag: 'SBL' }],
  'loose-aggressive': [{ id: 'viper', name: 'Viper', tag: 'VIP' }, { id: 'ink', name: 'Ink', tag: 'INK' }],
  'tight-passive': [{ id: 'rook', name: 'Rook', tag: 'ROK' }, { id: 'moss', name: 'Moss', tag: 'MOS' }],
  'loose-passive': [{ id: 'brick', name: 'Brick', tag: 'BRK' }, { id: 'lark', name: 'Lark', tag: 'LRK' }],
});

/** Mixed-table rounds in a persona re-evaluation: every anchor twice, and 12 self-play samples per candidate. */
export const REEVAL_ROUNDS = 12;

// Deal index spacing per generation for the mixed tables, so no two generations share deals.
const GENERATION_DEALS = 1_000_000;
const PROBE_SEED_SALT = 0x2c1b3c6d;
const TABLE_SIZE = 5;

/**
 * Seed of the quick gate in persona selection. Salted rather than `seed + 1`, which for the default training seed
 * 20260916 was exactly the release benchmark's default seed 20260917, so the quick gate replayed its deals.
 */
export const quickGateSeed = (seed) => (((seed ^ 0x9e3779b9) >>> 0) + 1) >>> 0;
/** Seed of the persona re-evaluation, salted apart from the training, quick-gate and benchmark seeds. */
export const reevalSeed = (seed) => (((seed ^ 0x7f4a7c15) >>> 0) + 2) >>> 0;

/** @returns {string|null} why the options cannot train, or null when they can */
export function validateOptions(o) {
  if (!Number.isInteger(o.population) || o.population < TABLE_SIZE || o.population % TABLE_SIZE !== 0) {
    return `population must be a positive multiple of ${TABLE_SIZE} (got ${o.population})`;
  }
  if (!Number.isInteger(o.eliteCount) || o.eliteCount < 1 || o.eliteCount >= o.population) {
    return `eliteCount must be at least 1 and below the population (got ${o.eliteCount} for population ${o.population})`;
  }
  if (o.rounds * (o.population / TABLE_SIZE) * o.deals >= GENERATION_DEALS) return 'rounds x tables x deals must stay below 1,000,000';
  return null;
}

/** Per-individual results behind its fitness; children from nextGeneration start without one. */
const ledgerOf = (ind) => {
  ind.ledger ??= { generations: 0, selfBbWon: 0, selfHands: 0, probeHands: 0, probeAccs: Object.fromEntries(PROBES.map((p) => [p, emptyAcc()])) };
  return ind.ledger;
};

const probeScore = (ledger) => PROBES.reduce((sum, p) => sum + summarizeMatchup([{ dealAccs: [ledger.probeAccs[p]] }]).bbPer100, 0) / PROBES.length;

/** @returns {{ selfPlay:number, probes:number }} accumulated component values in BB/100 */
function componentsOf(ind) {
  const l = ledgerOf(ind);
  return { selfPlay: l.selfHands > 0 ? (100 * l.selfBbWon) / l.selfHands : 0, probes: probeScore(l) };
}

/** Mixed tables of five members plus an anchor for each of `rounds` rounds; `anchorOf(round)` names the anchor. */
function mixedTables(members, { rounds, deals, seed, firstDeal, equityIterations, trackStyles, rng, anchorOf }) {
  const jobs = [];
  const seatings = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const table of scheduleTables(members.length, rng, TABLE_SIZE)) {
      seatings.push(table.members);
      jobs.push({
        players: [...table.members.map((i) => ({ kind: 'dials', dials: members[i].dials })), { kind: 'brain', name: anchorOf(round) }],
        seed,
        firstDeal: firstDeal + jobs.length * deals,
        deals,
        equityIterations,
        subject: TABLE_SIZE, // the anchor sits in the profiled hero chair
        trackStyles,
      });
    }
  }
  return { jobs, seatings };
}

/** BB won by each seated member relative to the members' mean, for one mixed-table result. */
function relativeBb(result, members) {
  const tableMean = members.reduce((sum, _m, k) => sum + result.nets[k], 0) / members.length;
  return members.map((_m, k) => (result.nets[k] - tableMean) / 2);
}

/** Adaptive probe matchups of every member against every probe, all on the same deals. */
const probeRunsFor = (members, { hands, seed, equityIterations }) => members.flatMap((m, index) => PROBES.map((probe) => ({
  index,
  probe,
  jobs: matchupJobs({ dials: m.dials, opponent: probe, hands, seed, equityIterations, adapt: true }),
})));

/** All jobs for one generation: mixed tables first, then every individual against every probe. */
function generationJobs(population, generation, o, rng) {
  const { jobs: tableJobs, seatings } = mixedTables(population, {
    rounds: o.rounds, deals: o.deals, seed: o.seed, firstDeal: generation * GENERATION_DEALS, equityIterations: o.equityIterations,
    trackStyles: true, rng, anchorOf: (round) => ANCHORS[(generation * o.rounds + round) % ANCHORS.length],
  });
  const probeRuns = probeRunsFor(population, { hands: o.probeHands, seed: dealSeed(o.seed ^ PROBE_SEED_SALT, generation), equityIterations: o.equityIterations });
  return { tableJobs, seatings, probeRuns };
}

/** Folds one generation's results into the individuals' ledgers. @returns {number} hands played */
function scoreGeneration(population, { tableJobs, seatings, probeRuns }, results) {
  let hands = 0;
  tableJobs.forEach((_, j) => {
    const result = results[j];
    hands += result.hands;
    const relative = relativeBb(result, seatings[j]);
    seatings[j].forEach((index, k) => {
      const ind = population[index];
      const l = ledgerOf(ind);
      l.selfBbWon += relative[k];
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
  population.forEach((ind) => { ledgerOf(ind).generations += 1; });
  return hands;
}

/** Generation-one component SDs, the fixed units of the cross-generation score. */
function componentScales(population) {
  const parts = population.map(componentsOf);
  return { selfPlay: scaleOrOne(meanSd(parts.map((p) => p.selfPlay)).sd), probes: scaleOrOne(meanSd(parts.map((p) => p.probes)).sd) };
}

/**
 * Sets each individual's selection fitness (standardized within the generation and written into bbWon/hands, the
 * fields evolve.fitnessOf ranks by) and its cross-generation `score` (in units of the generation-one SDs).
 */
function assignFitness(population, scales, probeWeight) {
  const parts = population.map(componentsOf);
  const fitness = mixStandardized(parts.map((p) => p.selfPlay), parts.map((p) => p.probes), probeWeight);
  population.forEach((ind, i) => {
    const l = ledgerOf(ind);
    ind.hands = l.selfHands + l.probeHands;
    ind.bbWon = (fitness[i] * ind.hands) / 100;
    ind.score = (1 - probeWeight) * (parts[i].selfPlay / scales.selfPlay) + probeWeight * (parts[i].probes / scales.probes);
  });
}

/**
 * @param {{ options:Partial<typeof TRAIN_DEFAULTS>, runAll:(jobs:object[]) => Promise<object[]>, log?:(line:string) => void,
 *   now?:() => number, checkpoint?:(state:{ generation:number, hands:number, archive:object, history:number[], bestByGeneration:number[] }) => void }} input
 *   checkpoint: called after every `checkpointEvery` generations (0 turns it off).
 * @returns {Promise<{ archive:object, history:number[], bestByGeneration:number[], scales:{ selfPlay:number, probes:number },
 *   generations:number, hands:number, stoppedBecause:'stalled'|'time'|'max-generations' }>}
 *   history: the stall signal, the mean score of the eliteCount fittest individuals in each generation.
 */
export async function train({ options, runAll, log = () => {}, now = Date.now, checkpoint }) {
  const o = { ...TRAIN_DEFAULTS, ...options };
  const invalid = validateOptions(o);
  if (invalid) throw new Error(invalid);
  const rng = mulberry32(o.seed);
  const started = now();
  let population = initialPopulation(o.population, rng);
  let nextId = population.length;
  let archive = {};
  let scales = null;
  const history = [];
  const bestByGeneration = [];
  let hands = 0;
  let stoppedBecause = 'max-generations';
  let generation = 0;

  for (; generation < o.generations; generation += 1) {
    const plan = generationJobs(population, generation, o, rng);
    const jobs = [...plan.tableJobs, ...plan.probeRuns.flatMap((run) => run.jobs)];
    const genStart = now();
    const results = await runAll(jobs);
    const genHands = scoreGeneration(population, plan, results);
    hands += genHands;
    scales ??= componentScales(population);
    assignFitness(population, scales, o.probeWeight);
    const eligible = population.filter((ind) => ind.ledger.generations >= 2 || ind.ledger.selfHands >= o.archiveMinSelfHands);
    archive = updateArchive(archive, eligible, { fitness: (ind) => ind.score });
    const elites = [...population].sort((a, b) => fitnessOf(b) - fitnessOf(a)).slice(0, o.eliteCount);
    const eliteMean = meanSd(elites.map((ind) => ind.score)).mean;
    const best = Math.max(...population.map((ind) => ind.score));
    history.push(eliteMean);
    bestByGeneration.push(best);
    const counts = NICHES.map((n) => `${n}:${(archive[n] ?? []).length}`).join(' ');
    const seconds = (now() - genStart) / 1000;
    log(`gen ${generation + 1}: elite mean score ${eliteMean.toFixed(3)}, best ${best.toFixed(3)} (gen-1 SD units), ${(genHands / Math.max(seconds, 1e-3)).toFixed(0)} hands/s over ${seconds.toFixed(1)} s, archive ${counts}`);
    if (checkpoint && o.checkpointEvery > 0 && (generation + 1) % o.checkpointEvery === 0) {
      checkpoint({ generation: generation + 1, hands, archive, history: [...history], bestByGeneration: [...bestByGeneration] });
    }
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
  return { archive, history, bestByGeneration, scales, generations: generation, hands, stoppedBecause };
}

/** Mean and standard error per candidate from its per-table-round samples, with a Student t factor for the few samples. */
function selfPlayEstimates(samples) {
  return samples.map((xs) => {
    const { mean, sd } = meanSd(xs);
    return { mean, se: xs.length > 1 ? ((sd / Math.sqrt(xs.length)) * tCritical95(xs.length - 1)) / Z95 : Infinity };
  });
}

/**
 * Re-plays candidates on `seed`: REEVAL_ROUNDS rounds of mixed tables among the candidates (about 5 x `hands`
 * self-play hands each, one relative BB/100 sample per table-round) and the three adaptive probe matchups at `hands`
 * each. Components are standardized across the candidates and mixed with `probeWeight`, as in training.
 * `lower` is score - 1.96 x standard error. An error is infinite when its sample is too small to estimate
 * (fewer than 30 probe deals or 2 table-rounds), which makes `lower` -Infinity.
 * @returns {Promise<{ id:number, selfPlay:number, probes:number, score:number, lower:number }[]>} in candidate order
 */
export async function reevaluate({ candidates, runAll, hands, seed, equityIterations, probeWeight }) {
  const deals = Math.max(1, Math.ceil((TABLE_SIZE * hands) / (6 * REEVAL_ROUNDS)));
  const tables = mixedTables(candidates, {
    // Table deals start past the probe matchups' deal indices (which start at 0 on the same seed), so no deal repeats.
    rounds: REEVAL_ROUNDS, deals, seed, firstDeal: GENERATION_DEALS, equityIterations, trackStyles: false, rng: mulberry32(seed),
    anchorOf: (round) => ANCHORS[round % ANCHORS.length],
  });
  const probeRuns = probeRunsFor(candidates, { hands, seed, equityIterations });
  const results = await runAll([...tables.jobs, ...probeRuns.flatMap((run) => run.jobs)]);

  const samples = candidates.map(() => []);
  tables.jobs.forEach((_, j) => {
    const relative = relativeBb(results[j], tables.seatings[j]);
    tables.seatings[j].forEach((index, k) => samples[index].push((100 * relative[k]) / results[j].hands));
  });
  const self = selfPlayEstimates(samples);
  const probes = candidates.map(() => ({ mean: 0, variance: 0 }));
  let next = tables.jobs.length;
  for (const { index, jobs } of probeRuns) {
    const s = summarizeMatchup(results.slice(next, next + jobs.length));
    next += jobs.length;
    const se = Number.isFinite(s.lower) ? (s.upper - s.lower) / (2 * Z95) : Infinity;
    probes[index].mean += s.bbPer100 / PROBES.length;
    probes[index].variance += (se / PROBES.length) ** 2;
  }

  const selfStats = meanSd(self.map((s) => s.mean));
  const probeStats = meanSd(probes.map((p) => p.mean));
  const selfScale = scaleOrOne(selfStats.sd);
  const probeScale = scaleOrOne(probeStats.sd);
  const w = probeWeight;
  return candidates.map((c, i) => {
    const score = (1 - w) * ((self[i].mean - selfStats.mean) / selfScale) + w * ((probes[i].mean - probeStats.mean) / probeScale);
    const se = Math.sqrt(((1 - w) * self[i].se / selfScale) ** 2 + (w ** 2 * probes[i].variance) / probeScale ** 2);
    return { id: c.id, selfPlay: self[i].mean, probes: probes[i].mean, score, lower: score - Z95 * se };
  });
}

/** The top `topK` archive candidates of each niche, topped up with the best remaining ones to fill the eight slots. */
function candidatePool(archive, topK) {
  const ranked = NICHES.flatMap((niche) => (archive[niche] ?? []).map((c, rank) => ({ ...c, niche, rank })));
  const pool = ranked.filter((c) => c.rank < topK);
  const wanted = Math.min(Object.values(PERSONA_SLOTS).flat().length, ranked.length);
  const rest = ranked.filter((c) => c.rank >= topK).sort((a, b) => b.fitness - a.fitness);
  while (pool.length < wanted && rest.length) pool.push(rest.shift());
  return pool.map(({ rank, ...c }) => c);
}

/**
 * Picks two personas per niche. The top `topK` archive candidates of each niche are re-evaluated on a fresh
 * salted seed (reevalSeed) and ranked by the lower bound of that re-evaluation, which corrects the winner's curse
 * in archive fitness. A quick gate on its own salted seed (quickGateSeed, never the benchmark's) then keeps, in that
 * order, the first two per niche that beat every opponent (mean BB/100 above 0), with the benchmark's gating
 * semantics (baselines with adaptation off, probes with adaptation on, no informational runs). Short niches are
 * filled with the unused pool candidates closest to passing, labelled with their measured niche.
 * @param {{ archive:object, runAll:(jobs:object[]) => Promise<object[]>, gateHands:number, seed:number, equityIterations:number,
 *   probeWeight?:number, reevalHands?:number, topK?:number, log?:(line:string) => void, onEvaluated?:(rows:object[]) => void }} input
 *   seed: the training seed; both selection seeds are salted from it.
 *   onEvaluated: receives one row per pool candidate (niche, archive fitness, re-evaluation, worst quick-gate mean).
 * @returns {Promise<object[]>} Persona objects with dials, fitness and measured style
 */
export async function selectPersonas({
  archive, runAll, gateHands, seed, equityIterations, probeWeight = TRAIN_DEFAULTS.probeWeight, reevalHands = TRAIN_DEFAULTS.reevalHands,
  topK = TRAIN_DEFAULTS.reevalTopK, log = () => {}, onEvaluated,
}) {
  const pool = candidatePool(archive, topK);
  log(`re-evaluating ${pool.length} candidates (top ${topK} per niche): ${reevalHands} hands per probe, about ${TABLE_SIZE * reevalHands} self-play hands each`);
  const evaluations = await reevaluate({ candidates: pool, runAll, hands: reevalHands, seed: reevalSeed(seed), equityIterations, probeWeight });
  const evaluation = new Map(evaluations.map((e) => [e.id, e]));
  const byReevaluation = (a, b) => evaluation.get(b.id).lower - evaluation.get(a.id).lower || evaluation.get(b.id).score - evaluation.get(a.id).score;

  let done = 0;
  const total = pool.length * OPPONENTS.length;
  const quick = await runMatchups({
    personas: pool.map((c) => ({ id: String(c.id), dials: c.dials })), opponents: OPPONENTS, hands: gateHands, seed: quickGateSeed(seed),
    equityIterations, runAll, informational: false,
    onMatchup: (m) => {
      done += 1;
      log(`quick gate ${done}/${total}: candidate ${m.personaId} vs ${m.opponent}${m.adapt ? ' (adapt)' : ''} ${m.bbPer100.toFixed(1)} BB/100`);
    },
  });
  const worstMean = (c) => Math.min(...quick.filter((m) => m.personaId === String(c.id)).map((m) => m.bbPer100));
  onEvaluated?.(pool.map((c) => ({ id: c.id, niche: c.niche, fitness: c.fitness, ...evaluation.get(c.id), quickGateWorst: worstMean(c) })));

  const used = new Set();
  const picks = {};
  for (const niche of NICHES) {
    picks[niche] = pool.filter((c) => c.niche === niche).sort(byReevaluation).filter((c) => worstMean(c) > 0).slice(0, 2);
    picks[niche].forEach((c) => used.add(c.id));
  }
  const spare = pool.filter((c) => !used.has(c.id)).sort((a, b) => worstMean(b) - worstMean(a));
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

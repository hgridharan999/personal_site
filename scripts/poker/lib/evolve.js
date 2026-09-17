// scripts/poker/lib/evolve.js
// Evolutionary search over persona dials, with style niches (tight/loose x passive/aggressive).
import { DIALS, ARCHETYPES, clampDial, resolveDials } from '../../../src/private/trainers/poker/bots/dials.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';

export const NICHES = Object.freeze(['tight-aggressive', 'loose-aggressive', 'tight-passive', 'loose-passive']);
/** Measured in mixed training tables: VPIP at or above 0.23 is loose, postflop aggression frequency at or above 0.35 is aggressive. */
export const STYLE_THRESHOLDS = Object.freeze({ vpip: 0.23, aggFreq: 0.35 });
export const ANCHORS = Object.freeze(['rawEquity', 'tightPassive', 'callingStation', 'always3Bet', 'alwaysCbet', 'alwaysOverbetRiver']);

/**
 * @typedef {{ id:number, dials:Record<string,number>, bbWon:number, hands:number, profile:import('../../../src/private/trainers/poker/bots/contract.js').PlayerProfile }} Individual
 *   bbWon (relative to tablemates) and hands accumulate over every generation the individual survives.
 */

/** @returns {string} niche label from measured VPIP and aggression frequency */
export function nicheOf(profile) {
  const vpip = profile.stats.vpip.value ?? 0;
  const agg = profile.stats.aggFreq.value ?? 0;
  return `${vpip >= STYLE_THRESHOLDS.vpip ? 'loose' : 'tight'}-${agg >= STYLE_THRESHOLDS.aggFreq ? 'aggressive' : 'passive'}`;
}

/** BB won per 100 hands relative to tablemates (0 before any hands). */
export const fitnessOf = (ind) => (ind.hands > 0 ? (100 * ind.bbWon) / ind.hands : 0);

function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Each dial moves with probability `rate` by N(0, sigma * range), clamped. */
export function mutate(dials, rng, { rate = 0.3, sigma = 0.1 } = {}) {
  const out = { ...dials };
  for (const d of DIALS) {
    if (rng() < rate) out[d.key] = clampDial(d.key, out[d.key] + gaussian(rng) * sigma * (d.max - d.min));
  }
  return out;
}

/** Uniform crossover: each dial comes from either parent. */
export function crossover(a, b, rng) {
  return Object.fromEntries(DIALS.map((d) => [d.key, rng() < 0.5 ? a[d.key] : b[d.key]]));
}

export const newIndividual = (id, dials) => ({ id, dials: resolveDials(dials), bbWon: 0, hands: 0, profile: emptyProfile() });

/** The four archetypes unmutated, then mutated copies of them in turn. */
export function initialPopulation(size, rng) {
  const seeds = Object.values(ARCHETYPES);
  return Array.from({ length: size }, (_, i) => {
    const base = seeds[i % seeds.length];
    return newIndividual(i, i < seeds.length ? base : mutate(base, rng, { rate: 0.5, sigma: 0.15 }));
  });
}

/**
 * Random tables of five individuals plus one anchor bot, as index lists into `population`.
 * @returns {{ members:number[], anchor:string }[]}
 */
export function scheduleTables(populationSize, rng, perTable = 5) {
  const order = Array.from({ length: populationSize }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const tables = [];
  for (let t = 0; t * perTable < order.length; t += 1) {
    const members = order.slice(t * perTable, (t + 1) * perTable);
    while (members.length < perTable) members.push(order[Math.floor(rng() * order.length)]);
    tables.push({ members, anchor: ANCHORS[Math.floor(rng() * ANCHORS.length)] });
  }
  return tables;
}

/**
 * Keeps the best `perNiche` individuals per niche across all generations, each individual in its latest niche only.
 * @returns {Record<string, { dials:Record<string,number>, fitness:number, hands:number, style:{ vpip:number, pfr:number, aggFreq:number } }[]>}
 */
export function updateArchive(archive, population, { perNiche = 5, minHands = 1 } = {}) {
  const next = Object.fromEntries(NICHES.map((n) => [n, [...(archive[n] ?? [])]]));
  for (const ind of population) {
    if (ind.hands < minHands) continue;
    const entry = {
      id: ind.id,
      dials: ind.dials,
      fitness: fitnessOf(ind),
      hands: ind.hands,
      style: { vpip: ind.profile.stats.vpip.value ?? 0, pfr: ind.profile.stats.pfr.value ?? 0, aggFreq: ind.profile.stats.aggFreq.value ?? 0 },
    };
    for (const niche of NICHES) next[niche] = next[niche].filter((e) => e.id !== ind.id); // an individual lives in one niche
    const niche = nicheOf(ind.profile);
    next[niche].push(entry);
    next[niche].sort((a, b) => b.fitness - a.fitness);
    next[niche] = next[niche].slice(0, perNiche);
  }
  return next;
}

/**
 * Elitism (the best of each niche, then the best overall) plus children from tournament selection,
 * crossover and mutation. Survivors keep their accumulated results.
 */
export function nextGeneration(population, { rng, eliteCount = 10, nextId }) {
  const ranked = [...population].sort((a, b) => fitnessOf(b) - fitnessOf(a));
  const elites = [];
  for (const niche of NICHES) {
    const best = ranked.find((ind) => nicheOf(ind.profile) === niche);
    if (best && !elites.includes(best)) elites.push(best);
  }
  for (const ind of ranked) {
    if (elites.length >= eliteCount) break;
    if (!elites.includes(ind)) elites.push(ind);
  }
  const tournament = () => {
    let best = ranked[Math.floor(rng() * ranked.length)];
    for (let k = 0; k < 2; k += 1) {
      const other = ranked[Math.floor(rng() * ranked.length)];
      if (fitnessOf(other) > fitnessOf(best)) best = other;
    }
    return best;
  };
  let id = nextId;
  const children = [];
  while (elites.length + children.length < population.length) {
    const child = mutate(crossover(tournament().dials, tournament().dials, rng), rng);
    children.push(newIndividual(id, child));
    id += 1;
  }
  return { population: [...elites, ...children], nextId: id };
}

/** True when the best fitness has not improved by `minDelta` over the last `patience` generations. */
export function hasStalled(bestByGeneration, { patience, minDelta }) {
  if (bestByGeneration.length <= patience) return false;
  const recent = Math.max(...bestByGeneration.slice(-patience));
  const before = Math.max(...bestByGeneration.slice(0, -patience));
  return recent < before + minDelta;
}

/** Combines two profiles as if every observation had been folded into one. */
export function mergeProfiles(a, b) {
  const stats = {};
  for (const key of Object.keys(a.stats)) {
    const x = a.stats[key];
    const y = b.stats[key];
    const n = x.n + y.n;
    stats[key] = { value: n === 0 ? null : ((x.value ?? 0) * x.n + (y.value ?? 0) * y.n) / n, n };
  }
  return { hands: a.hands + b.hands, stats };
}

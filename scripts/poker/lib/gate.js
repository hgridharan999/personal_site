// scripts/poker/lib/gate.js
// Benchmark gate: every persona against every baseline and exploit probe, with duplicate deals.
// Matchup format: the opponent sits in the hero chair (player 0, the profiled subject) and five copies of the
// persona fill the other seats. Each deal is played in all 6 rotations. A persona passes a matchup when the lower
// bound of the 95% CI of its BB/100 is above 0. For probes this is stricter than "does not lose".
// Modes: baselines gate with adaptation off. Probes run twice: gating with adaptation on (personas profile the
// probe, as they profile the hero in production) and informational with adaptation off (reported, never gating).
import { emptyAcc, mergeAcc, summarize } from './ciStats.js';

export const BASELINES = Object.freeze(['callingStation', 'randomLegal', 'rawEquity', 'tightPassive']);
export const PROBES = Object.freeze(['always3Bet', 'alwaysCbet', 'alwaysOverbetRiver']);
export const OPPONENTS = Object.freeze([...BASELINES, ...PROBES]);

const SEATS = 6;
const PERSONA_SEATS = 5;
const UNITS_PER_BB = 2;
export const RELEASE_HANDS = 200_000;
export const SMOKE_HANDS = 3_000;

/**
 * @typedef {{ personaId:string, opponent:string, adapt:boolean, gating:boolean, hands:number, bbPer100:number,
 *   lower:number, upper:number, opponentBbPer100:number, passed:boolean }} Matchup
 *   gating: whether the matchup counts toward the verdict. Matchups without the field count (gating by default).
 */

/** Table jobs for one persona against one opponent, `hands` rounded up to whole deals of 6 hands. */
export function matchupJobs({ dials, opponent, hands, seed, equityIterations, chunkDeals = 250, adapt = false }) {
  const deals = Math.ceil(hands / SEATS);
  const players = [{ kind: 'brain', name: opponent }, ...Array.from({ length: PERSONA_SEATS }, () => ({ kind: 'dials', dials }))];
  const jobs = [];
  for (let first = 0; first < deals; first += chunkDeals) {
    jobs.push({ players, seed, firstDeal: first, deals: Math.min(chunkDeals, deals - first), equityIterations, subject: 0, adapt, trackStyles: false });
  }
  return jobs;
}

/**
 * Persona BB/100 per seat: the persona seats win what the opponent loses, over 5 seats and 6 hands per deal.
 * @returns {{ hands:number, bbPer100:number, lower:number, upper:number, opponentBbPer100:number, passed:boolean }}
 */
export function summarizeMatchup(results) {
  const acc = results.reduce((a, r) => mergeAcc(a, r.dealAccs[0]), emptyAcc());
  const s = summarize(acc, -100 / (SEATS * PERSONA_SEATS * UNITS_PER_BB));
  return { hands: acc.n * SEATS, bbPer100: s.mean, lower: s.lower, upper: s.upper, opponentBbPer100: -s.mean * PERSONA_SEATS, passed: s.lower > 0 };
}

/** The modes an opponent is played in: probes gate with adaptation and report without it; baselines gate without. */
const modesFor = (opponent) => (PROBES.includes(opponent)
  ? [{ adapt: true, gating: true }, { adapt: false, gating: false }]
  : [{ adapt: false, gating: true }]);

/**
 * Runs every persona against every opponent (in every mode) in one batch of jobs.
 * @param {{ personas:{ id:string, dials:Record<string,number> }[], opponents?:readonly string[], hands:number, seed:number,
 *   equityIterations:number, runAll:(jobs:object[]) => Promise<object[]>, chunkDeals?:number }} input
 * @returns {Promise<Matchup[]>}
 */
export async function runMatchups({ personas, opponents = OPPONENTS, hands, seed, equityIterations, runAll, chunkDeals }) {
  const plan = [];
  const jobs = [];
  for (const persona of personas) {
    for (const opponent of opponents) {
      for (const { adapt, gating } of modesFor(opponent)) {
        const mine = matchupJobs({ dials: persona.dials, opponent, hands, seed, equityIterations, chunkDeals, adapt });
        plan.push({ personaId: persona.id, opponent, adapt, gating, from: jobs.length, count: mine.length });
        jobs.push(...mine);
      }
    }
  }
  const results = await runAll(jobs);
  return plan.map(({ personaId, opponent, adapt, gating, from, count }) => ({
    personaId, opponent, adapt, gating, ...summarizeMatchup(results.slice(from, from + count)),
  }));
}

const isGating = (m) => m.gating !== false;
const opponentLabel = (m) => (m.adapt ? `${m.opponent} (adapt)` : m.opponent);

/** Verdict over gating matchups only; informational matchups never pass or fail the gate. @returns {{ passed:boolean, failures:string[] }} */
export function gateVerdict(matchups) {
  const gating = matchups.filter(isGating);
  const failures = gating
    .filter((m) => !m.passed)
    .map((m) => `${m.personaId} vs ${opponentLabel(m)}: ${m.bbPer100.toFixed(2)} BB/100, 95% CI [${m.lower.toFixed(2)}, ${m.upper.toFixed(2)}]`);
  return { passed: failures.length === 0 && gating.length > 0, failures };
}

function resultLabel(m) {
  if (m.passed) return 'pass';
  return isGating(m) ? 'FAIL' : 'below 0';
}

/** Fixed-width text table of matchup results. */
export function formatReport(matchups) {
  const header = `${'persona'.padEnd(10)}${'opponent'.padEnd(20)}${'adapt'.padEnd(7)}${'mode'.padEnd(6)}${'hands'.padStart(9)}${'BB/100'.padStart(10)}${'95% CI'.padStart(22)}  result`;
  const rows = matchups.map((m) => `${m.personaId.padEnd(10)}${m.opponent.padEnd(20)}${(m.adapt ? 'on' : 'off').padEnd(7)}${(isGating(m) ? 'gate' : 'info').padEnd(6)}${String(m.hands).padStart(9)}${m.bbPer100.toFixed(2).padStart(10)}${`[${m.lower.toFixed(2)}, ${m.upper.toFixed(2)}]`.padStart(22)}  ${resultLabel(m)}`);
  return [header, ...rows].join('\n');
}

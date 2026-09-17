// scripts/poker/lib/gate.js
// Benchmark gate: every persona against every baseline and exploit probe, with duplicate deals.
// Matchup format: the opponent sits in the hero chair (player 0, the profiled subject) and five copies of the
// persona fill the other seats. Each deal is played in all 6 rotations. A persona passes a matchup when the lower
// bound of the 95% CI of its BB/100 is above 0. For probes this is stricter than "does not lose".
// Modes: baselines gate with adaptation off. Probes run twice: gating with adaptation on (personas profile the
// probe, as they profile the hero in production) and informational with adaptation off (reported, never gating).
import { emptyAcc, mergeAcc, summarize, bbPer100Scale } from './ciStats.js';
import { ADAPT_JOB_DEALS } from './tableJob.js';

export const BASELINES = Object.freeze(['callingStation', 'randomLegal', 'rawEquity', 'tightPassive']);
export const PROBES = Object.freeze(['always3Bet', 'alwaysCbet', 'alwaysOverbetRiver']);
export const OPPONENTS = Object.freeze([...BASELINES, ...PROBES]);

const SEATS = 6;
const PERSONA_SEATS = 5;
export const RELEASE_HANDS = 200_000;
export const SMOKE_HANDS = 3_000;

// The opponent (subject) sits alone in seat 0 against 5 copies of the persona filling seats 1-5; every deal
// deals SEATS=6 duplicate hands, one per seat. The opponent's per-deal net (in units, 1 unit = 0.5 BB) is what
// the 5 persona seats win between them, so a persona seat's own BB/100 is the opponent's loss spread evenly
// over PERSONA_SEATS=5 seats and sign-flipped. bbPer100Scale(SEATS) is the units-per-deal -> BB/100 conversion
// for a deal with SEATS hands from one seat's point of view; dividing that by PERSONA_SEATS distributes the
// opponent's total deal loss across the 5 persona seats. The result is exactly the spec constant per persona
// seat-hand, -100 / (SEATS * PERSONA_SEATS * UNITS_PER_BB) = -100/(6*5*2) = -1/6, kept bit-for-bit equal by
// deriving it from the shared helper instead of duplicating the /2 (units-per-BB) conversion locally.
const PERSONA_SCALE = -bbPer100Scale(SEATS) / PERSONA_SEATS;

/**
 * @typedef {{ personaId:string, opponent:string, adapt:boolean, gating:boolean, n:number, hands:number,
 *   bbPer100:number, lower:number, upper:number, opponentBbPer100:number, passed:boolean }} Matchup
 *   gating: whether the matchup counts toward the verdict. Matchups without the field count (gating by default).
 *   n: deals played (may be < 30, in which case lower/upper are +-Infinity; see ciStats.summarize).
 */

/**
 * Table jobs for one persona against one opponent, `hands` rounded up to whole deals of 6 hands.
 * Non-adaptive (`adapt: false`, the default) jobs are chunked to `chunkDeals` deals, since deal `d`'s play
 * depends only on `(seed, d)` and results never depend on chunking. Adaptive (`adapt: true`) jobs ignore
 * `chunkDeals` and always use `ADAPT_JOB_DEALS`: the subject's profile starts empty at the top of every job
 * and warms up over that job's deals (see tableJob.js), so job size affects results and must be fixed
 * regardless of the caller or thread count. Only the last job of a matchup may be a partial (smaller) chunk.
 */
export function matchupJobs({ dials, opponent, hands, seed, equityIterations, chunkDeals = 250, adapt = false }) {
  const deals = Math.ceil(hands / SEATS);
  const dealsPerJob = adapt ? ADAPT_JOB_DEALS : chunkDeals;
  const players = [{ kind: 'brain', name: opponent }, ...Array.from({ length: PERSONA_SEATS }, () => ({ kind: 'dials', dials }))];
  const jobs = [];
  for (let first = 0; first < deals; first += dealsPerJob) {
    jobs.push({ players, seed, firstDeal: first, deals: Math.min(dealsPerJob, deals - first), equityIterations, subject: 0, adapt, trackStyles: false });
  }
  return jobs;
}

/**
 * Persona BB/100 per seat: the persona seats win what the opponent loses, over 5 seats and 6 hands per deal.
 * When `n` (deals) is below 30, `lower`/`upper` are +-Infinity (see ciStats.summarize) so the matchup can
 * never pass the gate on a tiny, noisy sample; callers must not treat that as a real (finite) bound.
 * @returns {{ n:number, hands:number, bbPer100:number, lower:number, upper:number, opponentBbPer100:number, passed:boolean }}
 */
export function summarizeMatchup(results) {
  const acc = results.reduce((a, r) => mergeAcc(a, r.dealAccs[0]), emptyAcc());
  const s = summarize(acc, PERSONA_SCALE);
  return { n: acc.n, hands: acc.n * SEATS, bbPer100: s.mean, lower: s.lower, upper: s.upper, opponentBbPer100: -s.mean * PERSONA_SEATS, passed: s.lower > 0 };
}

/** The modes an opponent is played in: probes gate with adaptation and report without it; baselines gate without. */
const modesFor = (opponent) => (PROBES.includes(opponent)
  ? [{ adapt: true, gating: true }, { adapt: false, gating: false }]
  : [{ adapt: false, gating: true }]);

/**
 * Runs every persona against every opponent (in every mode). Each matchup's jobs are submitted to the pool as
 * their own batch (rather than one flat batch for the whole run) so `onMatchup` can report progress as soon as
 * that matchup's jobs finish, while matchups still run concurrently against each other through the shared pool.
 * The returned array is always in deterministic (persona, opponent, mode) order, regardless of which matchup's
 * jobs happen to finish first.
 * @param {{ personas:{ id:string, dials:Record<string,number> }[], opponents?:readonly string[], hands:number, seed:number,
 *   equityIterations:number, runAll:(jobs:object[]) => Promise<object[]>, chunkDeals?:number,
 *   onMatchup?:(matchup:Matchup) => void, informational?:boolean }} input
 *   informational: false skips the non-gating modes (a quick gate that only needs the gating matchups).
 * @returns {Promise<Matchup[]>}
 */
export async function runMatchups({
  personas, opponents = OPPONENTS, hands, seed, equityIterations, runAll, chunkDeals, onMatchup, informational = true,
}) {
  const plan = [];
  for (const persona of personas) {
    for (const opponent of opponents) {
      for (const { adapt, gating } of modesFor(opponent).filter((mode) => informational || mode.gating)) {
        const jobs = matchupJobs({ dials: persona.dials, opponent, hands, seed, equityIterations, chunkDeals, adapt });
        plan.push({ personaId: persona.id, opponent, adapt, gating, jobs });
      }
    }
  }
  return Promise.all(plan.map(async ({ personaId, opponent, adapt, gating, jobs }) => {
    const results = await runAll(jobs);
    const matchup = { personaId, opponent, adapt, gating, ...summarizeMatchup(results) };
    onMatchup?.(matchup);
    return matchup;
  }));
}

const isGating = (m) => m.gating !== false;
const opponentLabel = (m) => (m.adapt ? `${m.opponent} (adapt)` : m.opponent);
/** Non-finite CI bounds (fewer than 30 deals; see ciStats.summarize) print as `n/a`, never as `Infinity`. */
const boundStr = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');

/** Verdict over gating matchups only; informational matchups never pass or fail the gate. @returns {{ passed:boolean, failures:string[] }} */
export function gateVerdict(matchups) {
  const gating = matchups.filter(isGating);
  const failures = gating
    .filter((m) => !m.passed)
    .map((m) => `${m.personaId} vs ${opponentLabel(m)}: ${m.bbPer100.toFixed(2)} BB/100, 95% CI [${boundStr(m.lower)}, ${boundStr(m.upper)}]`);
  return { passed: failures.length === 0 && gating.length > 0, failures };
}

function resultLabel(m) {
  if (m.passed) return 'pass';
  return isGating(m) ? 'FAIL' : 'below 0';
}

/** One fixed-width report row for a matchup; shared by {@link formatReport} and the CLI's per-matchup progress line. */
export function matchupLine(m) {
  return `${m.personaId.padEnd(10)}${m.opponent.padEnd(20)}${(m.adapt ? 'on' : 'off').padEnd(7)}${(isGating(m) ? 'gate' : 'info').padEnd(6)}${String(m.hands).padStart(9)}${m.bbPer100.toFixed(2).padStart(10)}${`[${boundStr(m.lower)}, ${boundStr(m.upper)}]`.padStart(22)}  ${resultLabel(m)}`;
}

/** Fixed-width text table of matchup results. */
export function formatReport(matchups) {
  const header = `${'persona'.padEnd(10)}${'opponent'.padEnd(20)}${'adapt'.padEnd(7)}${'mode'.padEnd(6)}${'hands'.padStart(9)}${'BB/100'.padStart(10)}${'95% CI'.padStart(22)}  result`;
  return [header, ...matchups.map(matchupLine)].join('\n');
}

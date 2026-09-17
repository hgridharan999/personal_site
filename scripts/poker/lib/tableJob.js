// scripts/poker/lib/tableJob.js
// One unit of offline work: a 6-seat table played for a range of duplicate deals. Pure given its input,
// so it runs the same inline, in a worker thread, or in a test.
import { mulberry32 } from '../../../src/private/trainers/core/rng.js';
import { playDuplicateDeal } from '../../../src/private/trainers/poker/bots/arena.js';
import { createBrain } from '../../../src/private/trainers/poker/bots/index.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';
import { accumulateProfile } from '../../../src/private/trainers/poker/bots/profileStats.js';
import { emptyAcc, addSample } from './ciStats.js';

/**
 * @typedef {{ kind:'dials', dials:Record<string,number> } | { kind:'brain', name:string }} PlayerSpec
 *   name: any fixed brain key (baselines and exploit probes, e.g. 'callingStation', 'always3Bet').
 * @typedef {{ players:PlayerSpec[], seed:number, firstDeal:number, deals:number, equityIterations:number,
 *   subject?:number|null, adapt?:boolean, trackStyles?:boolean }} TableJob
 *   subject: player index whose profile is tracked and passed to the others (the "hero" chair).
 *   adapt: when true (requires a subject) every brain sees the subject's profile, built up deal by deal from
 *   an empty profile. Defaults to false: brains always see `profile: null`.
 * @typedef {{ nets:number[], hands:number, dealAccs:import('./ciStats.js').Acc[], styles:object[]|null }} TableResult
 *   nets: units won per player; dealAccs: per-player accumulators of units won per deal (all rotations).
 */

/**
 * Fixed job size (in deals) that adaptive (`adapt: true`) callers must use. With `adapt: false` deal `d`'s play
 * depends only on `(seed, d)`, so results never depend on how deals are chunked into jobs. With `adapt: true` the
 * subject profile necessarily starts from empty at the top of every job and warms up over that job's deals, so a
 * job's results (and therefore the overall matchup's results) depend on job size. There is no way around this
 * without carrying the profile across worker boundaries, so callers must fix every adaptive job to this many
 * deals, regardless of thread count, so a run's results don't change when the number of worker threads changes.
 */
export const ADAPT_JOB_DEALS = 500;

/** Deterministic 32-bit seed for deal `index` of a run. */
export const dealSeed = (seed, index) => (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;

function playerFrom(spec, index, equityIterations) {
  if (spec.kind === 'dials') {
    const persona = { id: `p${index}`, name: `P${index}`, tag: 'TRN', style: 'training', brain: 'heuristic', dials: spec.dials };
    return { brain: createBrain(persona, { iterations: equityIterations, budgetMs: Infinity }), persona };
  }
  const persona = { id: spec.name, name: spec.name, tag: 'BAS', style: 'baseline', brain: spec.name };
  return { brain: createBrain(persona), persona };
}

/** @param {TableJob} job @returns {TableResult} */
export function runTableJob(job) {
  const { players: specs, seed, firstDeal, deals, equityIterations, subject = null, adapt = false, trackStyles = false } = job;
  if (adapt && subject === null) throw new Error('adapt requires a subject');
  const players = specs.map((spec, i) => playerFrom(spec, i, equityIterations));
  const nets = new Array(players.length).fill(0);
  let dealAccs = players.map(() => emptyAcc());
  const styles = trackStyles ? players.map(() => emptyProfile()) : null;
  let profile = adapt ? emptyProfile() : null;
  let hands = 0;
  const onHand = trackStyles
    ? (events, seatOf) => players.forEach((_, p) => { styles[p] = accumulateProfile(styles[p], seatOf(p), events); })
    : undefined;
  for (let d = firstDeal; d < firstDeal + deals; d += 1) {
    // A fresh decision RNG per deal, seeded only from (seed, d), so deal d plays identically no matter which
    // job (or how much of the job) it lands in — results don't depend on how deals are split across threads.
    const decisionRng = mulberry32(dealSeed(seed ^ 0x5bd1e995, d));
    const result = playDuplicateDeal({
      players, dealSeed: dealSeed(seed, d), decisionRng, button: d % players.length, subject, profile, adapt, onHand,
    });
    profile = result.profile;
    result.nets.forEach((x, p) => { nets[p] += x; });
    dealAccs = dealAccs.map((acc, p) => addSample(acc, result.nets[p]));
    hands += result.hands;
  }
  return { nets, hands, dealAccs, styles };
}

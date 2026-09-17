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
  const decisionRng = mulberry32(dealSeed(seed ^ 0x5bd1e995, firstDeal));
  const nets = new Array(players.length).fill(0);
  let dealAccs = players.map(() => emptyAcc());
  const styles = trackStyles ? players.map(() => emptyProfile()) : null;
  let profile = adapt ? emptyProfile() : null;
  const onHand = trackStyles
    ? (events, seatOf) => players.forEach((_, p) => { styles[p] = accumulateProfile(styles[p], seatOf(p), events); })
    : undefined;
  for (let d = firstDeal; d < firstDeal + deals; d += 1) {
    const result = playDuplicateDeal({
      players, dealSeed: dealSeed(seed, d), decisionRng, button: d % players.length, subject, profile, adapt, onHand,
    });
    profile = result.profile;
    result.nets.forEach((x, p) => { nets[p] += x; });
    dealAccs = dealAccs.map((acc, p) => addSample(acc, result.nets[p]));
  }
  return { nets, hands: deals * players.length, dealAccs, styles };
}

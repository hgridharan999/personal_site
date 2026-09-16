// src/private/trainers/poker/bots/adapt.js
// Exploit shifts against the profiled player (the hero). Each rule fires only once its stat has at least
// ADAPT_MIN_OBS observations, moves one dial by perUnit * distance past the threshold, is capped, is scaled
// by the persona's adaptStrength, and the result is clamped to the dial bounds.
import { clampDial } from './dials.js';

export const ADAPT_MIN_OBS = 30;

/** @type {readonly { stat:string, when:'above'|'below', threshold:number, dial:string, perUnit:number, cap:number, why:string }[]} */
export const EXPLOIT_RULES = Object.freeze([
  { stat: 'foldToCbetFlop', when: 'above', threshold: 0.55, dial: 'cbetFlop', perUnit: 1.5, cap: 0.35, why: 'folds to c-bets: c-bet more' },
  { stat: 'foldToCbetFlop', when: 'below', threshold: 0.35, dial: 'cbetFlop', perUnit: -1.5, cap: 0.35, why: 'calls c-bets: c-bet bluff less' },
  { stat: 'foldToCbetFlop', when: 'below', threshold: 0.35, dial: 'valueThresh', perUnit: -0.2, cap: 0.04, why: 'calls c-bets: value bet thinner' },
  { stat: 'foldToCbetTurn', when: 'above', threshold: 0.55, dial: 'cbetTurn', perUnit: 1.5, cap: 0.3, why: 'folds to barrels: barrel more' },
  { stat: 'foldToCbetTurn', when: 'below', threshold: 0.35, dial: 'cbetTurn', perUnit: -1.5, cap: 0.3, why: 'calls barrels: barrel less' },
  { stat: 'foldToRiverBet', when: 'above', threshold: 0.6, dial: 'bluffMul', perUnit: 3, cap: 0.8, why: 'over-folds the river: bluff more' },
  { stat: 'foldToRiverBet', when: 'below', threshold: 0.35, dial: 'bluffMul', perUnit: -3, cap: 0.8, why: 'calls the river: bluff less' },
  { stat: 'foldToRiverBet', when: 'below', threshold: 0.35, dial: 'valueThresh', perUnit: -0.25, cap: 0.05, why: 'calls the river: value bet thinner' },
  { stat: 'vpip', when: 'above', threshold: 0.35, dial: 'isoRaise', perUnit: 2, cap: 0.6, why: 'plays too many hands: isolate wider' },
  { stat: 'vpip', when: 'above', threshold: 0.35, dial: 'threeBet', perUnit: 1.5, cap: 0.4, why: 'plays too many hands: 3-bet wider for value' },
  { stat: 'threeBet', when: 'above', threshold: 0.12, dial: 'vs3betCall', perUnit: 3, cap: 0.5, why: '3-bets too much: defend wider' },
  { stat: 'threeBet', when: 'above', threshold: 0.12, dial: 'fourBet', perUnit: 3, cap: 0.6, why: '3-bets too much: 4-bet wider' },
  { stat: 'foldTo3Bet', when: 'above', threshold: 0.65, dial: 'threeBet', perUnit: 2.5, cap: 0.7, why: 'folds to 3-bets: 3-bet more' },
  { stat: 'pfr', when: 'above', threshold: 0.3, dial: 'bbDefend', perUnit: 1.5, cap: 0.3, why: 'raises too often: defend the big blind wider' },
  { stat: 'aggFreq', when: 'above', threshold: 0.55, dial: 'callThresh', perUnit: -0.4, cap: 0.12, why: 'over-aggressive: call down lighter' },
  { stat: 'aggFreq', when: 'above', threshold: 0.55, dial: 'trapFreq', perUnit: 0.6, cap: 0.15, why: 'over-aggressive: trap more' },
  { stat: 'wtsd', when: 'above', threshold: 0.35, dial: 'bluffMul', perUnit: -2, cap: 0.5, why: 'goes to showdown a lot: bluff less' },
  { stat: 'riverBetFreq', when: 'above', threshold: 0.5, dial: 'callThresh', perUnit: -0.3, cap: 0.1, why: 'bets the river a lot: call lighter' },
  { stat: 'cbetFlop', when: 'above', threshold: 0.75, dial: 'floatFreq', perUnit: 1.2, cap: 0.25, why: 'c-bets too much: float more' },
  { stat: 'cbetFlop', when: 'above', threshold: 0.75, dial: 'checkRaise', perUnit: 0.8, cap: 0.2, why: 'c-bets too much: check-raise more' },
  { stat: 'checkRaise', when: 'above', threshold: 0.2, dial: 'cbetFlop', perUnit: -1, cap: 0.15, why: 'check-raises a lot: c-bet less' },
]);

/**
 * @param {Record<string, number>} dials resolved dials (see resolveDials)
 * @param {import('./contract.js').PlayerProfile|null} profile
 * @returns {Record<string, number>} a new dial set; `dials` is not mutated
 */
export function adaptDials(dials, profile) {
  const out = { ...dials };
  if (!profile) return out;
  const strength = dials.adaptStrength;
  for (const rule of EXPLOIT_RULES) {
    const stat = profile.stats[rule.stat];
    if (!stat || stat.n < ADAPT_MIN_OBS || stat.value === null) continue;
    const past = rule.when === 'above' ? stat.value - rule.threshold : rule.threshold - stat.value;
    if (past <= 0) continue;
    const magnitude = Math.min(rule.cap, Math.abs(rule.perUnit) * past);
    out[rule.dial] = clampDial(rule.dial, out[rule.dial] + Math.sign(rule.perUnit) * magnitude * strength);
  }
  return out;
}

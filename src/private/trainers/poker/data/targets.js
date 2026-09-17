// src/private/trainers/poker/data/targets.js
// Target ranges for a winning 6-max No-Limit Hold'em cash player at 100 BB stacks, per profile stat
// (definitions: bots/profileStats.js) and, where position changes the answer most, per hero position.
//
// These are OUR OWN APPROXIMATE ranges, drawn from widely shared 6-max regular benchmarks and adjusted
// to our exact stat definitions. They are coaching guides, not solver output: being slightly outside a
// range is not automatically a leak. Values are fractions in [0, 1]; both ends are inclusive.

export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** Opportunities a stat needs before it gets a below/in/above flag (spec §5.5 uses 30 as well). */
export const TENDENCY_MIN_N = 30;

export const TARGETS = {
  vpip: {
    overall: [0.22, 0.28],
    byPosition: { UTG: [0.14, 0.19], HJ: [0.17, 0.23], CO: [0.24, 0.31], BTN: [0.38, 0.5], SB: [0.26, 0.36], BB: [0.3, 0.42] },
  },
  pfr: {
    overall: [0.17, 0.23],
    byPosition: { UTG: [0.13, 0.18], HJ: [0.16, 0.22], CO: [0.22, 0.29], BTN: [0.32, 0.44], SB: [0.2, 0.3], BB: [0.07, 0.13] },
  },
  threeBet: {
    overall: [0.06, 0.1],
    byPosition: { HJ: [0.04, 0.08], CO: [0.05, 0.09], BTN: [0.07, 0.12], SB: [0.08, 0.14], BB: [0.08, 0.14] },
  },
  foldTo3Bet: { overall: [0.45, 0.6] },
  cbetFlop: { overall: [0.5, 0.7] },
  cbetTurn: { overall: [0.45, 0.6] },
  foldToCbetFlop: { overall: [0.35, 0.5] },
  foldToCbetTurn: { overall: [0.35, 0.5] },
  checkRaise: { overall: [0.06, 0.14] },
  wtsd: { overall: [0.25, 0.32] },
  wsd: { overall: [0.49, 0.56] },
  aggFreq: { overall: [0.38, 0.52] },
  foldToRiverBet: { overall: [0.35, 0.5] },
  riverBetFreq: { overall: [0.3, 0.45] },
};

/** @returns {[number, number] | null} the positional range when defined, else the overall range */
export function targetFor(stat, position = null) {
  const target = TARGETS[stat];
  if (!target) return null;
  return (position && target.byPosition?.[position]) || target.overall;
}

/** @returns {'below'|'in'|'above'|null} null until the stat has a value and minN opportunities */
export function flagFor(value, n, target, minN = TENDENCY_MIN_N) {
  if (!target || value === null || value === undefined || n < minN) return null;
  if (value < target[0]) return 'below';
  if (value > target[1]) return 'above';
  return 'in';
}

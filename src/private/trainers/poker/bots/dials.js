// src/private/trainers/poker/bots/dials.js
// Persona dials: the numeric knobs of the heuristic brain. Training evolves these; personas ship them.

/** @typedef {{ key:string, min:number, max:number, def:number, meaning:string }} Dial */

/** @type {readonly Dial[]} */
export const DIALS = Object.freeze([
  // Preflop
  { key: 'openUTG', min: 0.5, max: 1.8, def: 1, meaning: 'UTG open range width multiplier' },
  { key: 'openHJ', min: 0.5, max: 1.8, def: 1, meaning: 'HJ open range width multiplier' },
  { key: 'openCO', min: 0.5, max: 1.8, def: 1, meaning: 'CO open range width multiplier' },
  { key: 'openBTN', min: 0.5, max: 1.8, def: 1, meaning: 'BTN open range width multiplier' },
  { key: 'openSB', min: 0.5, max: 1.8, def: 1, meaning: 'SB open range width multiplier' },
  { key: 'threeBet', min: 0.3, max: 2.5, def: 1, meaning: '3-bet and squeeze raise range width multiplier' },
  { key: 'coldCall', min: 0.3, max: 1.8, def: 1, meaning: 'flat-call width facing an open or limpers (not the BB)' },
  { key: 'bbDefend', min: 0.5, max: 1.6, def: 1, meaning: 'big blind call width facing an open' },
  { key: 'fourBet', min: 0.3, max: 2.5, def: 1, meaning: 'raise width facing a 3-bet or 4-bet' },
  { key: 'vs3betCall', min: 0.4, max: 1.8, def: 1, meaning: 'call width facing a 3-bet or 4-bet' },
  { key: 'isoRaise', min: 0.5, max: 2, def: 1, meaning: 'raise width facing limpers' },
  { key: 'limpFreq', min: 0, max: 0.3, def: 0, meaning: 'chance an unopened raise becomes a limp' },
  { key: 'openSize', min: 2, max: 3.5, def: 2.5, meaning: 'open raise size in BB (+1 BB from the SB and per limper)' },
  { key: 'jamCall', min: 0.8, max: 1.3, def: 1, meaning: 'multiplier on the equity needed to call a big preflop bet' },
  // Postflop
  { key: 'valueThresh', min: 0.52, max: 0.8, def: 0.62, meaning: 'heads-up-equivalent equity needed to bet for value' },
  { key: 'aggression', min: 0.5, max: 1.8, def: 1, meaning: 'scales bluffs and thin value bets' },
  { key: 'bluffMul', min: 0, max: 2.5, def: 1, meaning: 'multiplier on the balanced bluff frequency bet/(pot+2*bet)' },
  { key: 'cbetFlop', min: 0, max: 1, def: 0.55, meaning: 'flop c-bet chance with non-value hands as the preflop aggressor' },
  { key: 'cbetTurn', min: 0, max: 1, def: 0.35, meaning: 'turn barrel chance with non-value hands as the flop aggressor' },
  { key: 'sizeBias', min: -1, max: 1, def: 0, meaning: 'shift along the 1/3, 1/2, 3/4, pot size menu' },
  { key: 'callThresh', min: 0.75, max: 1.35, def: 1, meaning: 'multiplier on the pot-odds equity needed to call (low = sticky)' },
  { key: 'raiseValue', min: 0.65, max: 0.92, def: 0.78, meaning: 'heads-up-equivalent equity needed to raise a bet for value' },
  { key: 'semiBluffRaise', min: 0, max: 0.6, def: 0.15, meaning: 'chance to raise a strong draw facing a bet' },
  { key: 'floatFreq', min: 0, max: 0.5, def: 0.15, meaning: 'chance to float a flop bet in position with weak equity' },
  { key: 'trapFreq', min: 0, max: 0.6, def: 0.15, meaning: 'chance to slow-play a monster on the flop or turn' },
  { key: 'drawImplied', min: 0, max: 0.12, def: 0.05, meaning: 'equity credited to draws for implied odds' },
  { key: 'checkRaise', min: 0, max: 0.5, def: 0.15, meaning: 'chance to check a value hand out of position to check-raise' },
  { key: 'mdfDefend', min: 0, max: 1, def: 0.3, meaning: 'minimum-defence floor: share of MDF (by range percentile) that calls a postflop bet' },
  { key: 'multiwayTight', min: 0, max: 0.15, def: 0.05, meaning: 'extra value and raise threshold per extra opponent' },
  // Adaptation
  { key: 'adaptStrength', min: 0, max: 1, def: 0.6, meaning: 'scale of exploit shifts against the profiled player' },
]);

const BY_KEY = Object.fromEntries(DIALS.map((d) => [d.key, d]));

export const clampDial = (key, value) => Math.min(BY_KEY[key].max, Math.max(BY_KEY[key].min, value));

/** Every dial at its default. */
export const defaultDials = () => Object.fromEntries(DIALS.map((d) => [d.key, d.def]));

/** Fills missing dials with defaults, clamps the rest and drops unknown keys. */
export function resolveDials(partial = {}) {
  const out = {};
  for (const d of DIALS) {
    const v = partial[d.key];
    out[d.key] = typeof v === 'number' && Number.isFinite(v) ? clampDial(d.key, v) : d.def;
  }
  return out;
}

const opens = (x) => ({ openUTG: x, openHJ: x, openCO: x, openBTN: x, openSB: x });

/** Starting dial sets for the four style niches. */
export const ARCHETYPES = Object.freeze({
  'tight-aggressive': resolveDials({
    ...opens(0.9), threeBet: 1.2, coldCall: 0.8, bbDefend: 0.9, valueThresh: 0.6, aggression: 1.3, bluffMul: 1.2,
    cbetFlop: 0.65, cbetTurn: 0.45, callThresh: 1.05,
  }),
  'loose-aggressive': resolveDials({
    ...opens(1.35), threeBet: 1.8, coldCall: 1.1, bbDefend: 1.2, isoRaise: 1.6, valueThresh: 0.58, aggression: 1.6,
    bluffMul: 1.8, cbetFlop: 0.8, cbetTurn: 0.55, semiBluffRaise: 0.35, callThresh: 0.95,
  }),
  'tight-passive': resolveDials({
    ...opens(0.8), threeBet: 0.6, valueThresh: 0.68, aggression: 0.7, bluffMul: 0.4, cbetFlop: 0.35, cbetTurn: 0.2,
    trapFreq: 0.35, checkRaise: 0.25, mdfDefend: 0.5,
  }),
  'loose-passive': resolveDials({
    ...opens(1.2), threeBet: 0.7, coldCall: 1.5, bbDefend: 1.4, limpFreq: 0.15, valueThresh: 0.66, aggression: 0.7,
    bluffMul: 0.5, cbetFlop: 0.4, cbetTurn: 0.2, callThresh: 0.9, floatFreq: 0.3, mdfDefend: 0.6,
  }),
});

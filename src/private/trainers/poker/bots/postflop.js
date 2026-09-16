// src/private/trainers/poker/bots/postflop.js
// Postflop decisions from equity, pot odds, texture, position, SPR and opponent count.
export const SIZE_MENU = Object.freeze([1 / 3, 1 / 2, 3 / 4, 1]);
// Rough share of a betting range that is value, and share of hands too weak to show down, by street.
const VALUE_SHARE = { flop: 0.35, turn: 0.3, river: 0.25 };
const WEAK_SHARE = 0.45;
const ALL_IN_SHARE = 0.6; // bets committing at least this share of the stack go all-in

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Converts multiway equity (share of the pot) to a heads-up-equivalent equity. */
export const huEquity = (equity, nOpp) => (nOpp <= 1 ? equity : Math.max(0, equity) ** (1 / nOpp));

/** Share of bluffs in a balanced betting range for a bet of size `bet` into `pot`. */
export const bluffShare = (bet, pot) => bet / (pot + 2 * bet);

/** Balanced chance to bluff with a weak hand, before persona and context multipliers. */
export function balancedBluffChance(street, frac) {
  const r = bluffShare(frac, 1);
  return (VALUE_SHARE[street] / WEAK_SHARE) * (r / (1 - r));
}

/** Index into SIZE_MENU: 1/2 pot on the flop, 3/4 later, one step bigger on wet boards, shifted by sizeBias. */
export function sizeIndex(street, wetness, sizeBias) {
  return clamp((street === 'flop' ? 1 : 2) + (wetness > 0.55 ? 1 : 0) + Math.round(sizeBias), 0, SIZE_MENU.length - 1);
}

function betTo(c, frac) {
  const amount = Math.round(c.currentBet + frac * (c.pot + c.toCall));
  if (amount >= ALL_IN_SHARE * c.maxRaiseTo) return { action: c.currentBet === 0 ? 'bet' : 'raise', amount: c.maxRaiseTo };
  return { action: c.currentBet === 0 ? 'bet' : 'raise', amount };
}

/**
 * @param {{ street:'flop'|'turn'|'river', equity:number, nOpp:number, pot:number, toCall:number, currentBet:number,
 *   maxRaiseTo:number, canRaise:boolean, ip:boolean, aggressor:boolean, betsThisStreet:number, spr:number,
 *   wetness:number, draw:boolean, dials:Record<string,number>, rng:() => number }} c
 *   equity: share of the pot vs the live opponents' ranges; draw: flush draw or open-ended straight draw.
 * @returns {{ action:string, amount?:number }} an intended choice (pass through legalize)
 */
export function postflopDecision(c) {
  const d = c.dials;
  const hu = huEquity(c.equity, c.nOpp);
  const frac = SIZE_MENU[sizeIndex(c.street, c.wetness, d.sizeBias)];
  const multiway = d.multiwayTight * (c.nOpp - 1);

  if (c.toCall === 0) {
    const valueT = d.valueThresh + multiway + (c.street === 'river' ? 0.03 : 0) - (c.ip ? 0.02 : 0);
    if (hu >= valueT) {
      if (c.street !== 'river' && hu >= 0.85 && c.rng() < d.trapFreq) return { action: 'check' };
      if (!c.ip && c.nOpp === 1 && c.rng() < d.checkRaise) return { action: 'check' };
      return betTo(c, frac);
    }
    let p = d.bluffMul * d.aggression * balancedBluffChance(c.street, frac);
    if (c.aggressor && c.street === 'flop') p = Math.max(p, d.cbetFlop * (1 - 0.4 * c.wetness));
    if (c.aggressor && c.street === 'turn') p = Math.max(p, d.cbetTurn * (c.draw ? 1.3 : 0.8));
    if (c.draw) p *= 1.5;
    if (c.street === 'river' && hu > 0.35) p *= 0.25; // showdown value: mostly check
    if (c.street !== 'river' && hu >= valueT - 0.1) p = Math.max(p, 0.25 * (d.aggression - 0.5)); // thin value
    p *= 0.5 ** (c.nOpp - 1);
    return c.rng() < Math.min(0.95, p) ? betTo(c, frac) : { action: 'check' };
  }

  const need = c.toCall / (c.pot + c.toCall);
  const implied = c.draw && c.street !== 'river' && c.spr > 2 ? d.drawImplied : 0;
  const eq = c.equity + implied;
  const raiseT = d.raiseValue + multiway + 0.04 * Math.max(0, c.betsThisStreet - 1);
  if (c.canRaise && hu >= raiseT) {
    if (c.street !== 'river' && c.rng() < d.trapFreq * 0.5) return { action: 'call' };
    return betTo(c, SIZE_MENU[clamp(2 + Math.round(d.sizeBias), 0, SIZE_MENU.length - 1)]);
  }
  if (c.canRaise && c.draw && c.street !== 'river' && c.betsThisStreet === 1 && c.rng() < d.semiBluffRaise * (c.nOpp === 1 ? 1 : 0.3)) {
    return betTo(c, SIZE_MENU[2]);
  }
  const callT = need * d.callThresh;
  if (eq >= callT) return { action: 'call' };
  if (eq >= 0.8 * callT && c.rng() < d.mdfDefend * 0.5) return { action: 'call' };
  if (c.street === 'flop' && c.ip && c.nOpp === 1 && c.betsThisStreet === 1 && eq >= 0.6 * callT && c.rng() < d.floatFreq) {
    return { action: 'call' };
  }
  return { action: 'fold' };
}

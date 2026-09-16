// src/private/trainers/poker/bots/postflop.js
// Postflop decisions from equity, pot odds, texture, position, SPR and opponent count.
export const SIZE_MENU = Object.freeze([1 / 3, 1 / 2, 3 / 4, 1]);
// Rough share of a betting range that is value, and share of hands too weak to show down, by street.
const VALUE_SHARE = { flop: 0.35, turn: 0.3, river: 0.25 };
const WEAK_SHARE = 0.45;
const ALL_IN_SHARE = 0.6; // bets committing at least this share of the stack go all-in
const BEHIND_SHARE = 0.5; // bets leaving less than this share of the resulting pot behind go all-in
// Shape of the range-percentile estimate from equity, by street (see rangePercentile).
const PCT_SHAPE = { flop: 2.3, turn: 3, river: 4 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Converts multiway equity (share of the pot) to a heads-up-equivalent equity: equity ** k with
 * k = ln 0.5 / ln(1 / (nOpp + 1)), so the average share 1 / (nOpp + 1) maps to 0.5 and 0 and 1 stay put.
 */
export const huEquity = (equity, nOpp) =>
  nOpp <= 1 ? equity : Math.max(0, equity) ** (Math.log(0.5) / Math.log(1 / (nOpp + 1)));

/**
 * Estimated percentile (0 = weakest, 1 = strongest) of a hand within the defending range, from its heads-up-equivalent
 * equity against the bettor's range: 1 - (1 - hu) ** PCT_SHAPE[street]. Fitted to the equities heuristic bots hold
 * when facing a postflop bet in self-play (medians about 0.27 flop, 0.21 turn, 0.09 river): betting ranges are
 * value-heavy, and more so on later streets, so equities skew low.
 */
export const rangePercentile = (hu, street = 'flop') => 1 - (1 - clamp(hu, 0, 1)) ** PCT_SHAPE[street];

/**
 * Minimum-defence floor: share of the defending range that must continue facing a bet. mdfDefend scales the minimum
 * defence frequency (pot before the bet) / (pot after it), and multiway the floor is split among the opponents.
 * @param {number} pot the pot including the bet faced
 */
export const defendShare = (mdfDefend, pot, toCall, nOpp) => (mdfDefend * Math.max(0, pot - toCall)) / Math.max(pot, 1) / Math.max(1, nOpp);

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

/** At SPR below 1 the stacks go in soon anyway: a threshold moves toward 0.5 in proportion, halfway at SPR 0. */
const lowSpr = (threshold, spr) => (spr < 1 ? 0.5 + (threshold - 0.5) * (0.5 + 0.5 * Math.max(0, spr)) : threshold);

// Bets frac of the pot after calling. Goes all-in when that commits most of the stack, or when it would leave
// less than BEHIND_SHARE of the pot (after the bet is called) behind: an awkward non-jam.
function betTo(c, frac) {
  const action = c.currentBet === 0 ? 'bet' : 'raise';
  const amount = Math.round(c.currentBet + frac * (c.pot + c.toCall));
  const mine = c.currentBet - c.toCall; // already in front of us this street
  const potIfCalled = c.pot + (amount - mine) + (amount - c.currentBet);
  if (amount >= ALL_IN_SHARE * c.maxRaiseTo || c.maxRaiseTo - amount < BEHIND_SHARE * potIfCalled) {
    return { action, amount: c.maxRaiseTo };
  }
  return { action, amount };
}

/**
 * @param {{ street:'flop'|'turn'|'river', equity:number, nOpp:number, pot:number, toCall:number, currentBet:number,
 *   maxRaiseTo:number, canRaise:boolean, ip:boolean, aggressor:boolean, betsThisStreet:number, spr:number,
 *   wetness:number, draw:boolean, dials:Record<string,number>, rng:() => number, rangePct?:number|null }} c
 *   equity: share of the pot vs the live opponents' ranges; draw: flush draw or open-ended straight draw;
 *   rangePct: the hand's equity percentile within its own tracked range (0 = weakest), estimated from equity when absent.
 * @returns {{ action:string, amount?:number }} an intended choice (pass through legalize)
 */
export function postflopDecision(c) {
  const d = c.dials;
  const hu = huEquity(c.equity, c.nOpp);
  const frac = SIZE_MENU[sizeIndex(c.street, c.wetness, d.sizeBias)];
  const multiway = d.multiwayTight * (c.nOpp - 1);

  if (c.toCall === 0) {
    const valueT = lowSpr(d.valueThresh + multiway + (c.street === 'river' ? 0.03 : 0) - (c.ip ? 0.02 : 0), c.spr);
    if (hu >= valueT) {
      if (c.street !== 'river' && hu >= 0.85 && c.rng() < d.trapFreq) return { action: 'check' };
      if (!c.ip && c.nOpp === 1 && c.rng() < d.checkRaise) return { action: 'check' };
      return betTo(c, frac);
    }
    let p = d.bluffMul * d.aggression * balancedBluffChance(c.street, frac);
    if (c.aggressor && c.street === 'flop') p = Math.max(p, d.cbetFlop * (1 - 0.4 * c.wetness));
    if (c.draw) p *= 1.5;
    // The turn barrel carries its own draw adjustment, so it is applied after the general draw bonus.
    if (c.aggressor && c.street === 'turn') p = Math.max(p, d.cbetTurn * (c.draw ? 1.3 : 0.8));
    if (c.street === 'river' && hu > 0.35) p *= 0.25; // showdown value: mostly check
    if (c.street !== 'river' && hu >= valueT - 0.1) p = Math.max(p, 0.25 * (d.aggression - 0.5)); // thin value
    p *= 0.5 ** (c.nOpp - 1);
    return c.rng() < Math.min(0.95, p) ? betTo(c, frac) : { action: 'check' };
  }

  const need = c.toCall / (c.pot + c.toCall);
  const implied = c.draw && c.street !== 'river' && c.spr > 2 ? d.drawImplied : 0;
  const eq = c.equity + implied;
  const raiseT = lowSpr(d.raiseValue + multiway + 0.04 * Math.max(0, c.betsThisStreet - 1), c.spr);
  if (c.canRaise && hu >= raiseT) {
    if (c.street !== 'river' && c.rng() < d.trapFreq * 0.5) return { action: 'call' };
    return betTo(c, SIZE_MENU[clamp(2 + Math.round(d.sizeBias), 0, SIZE_MENU.length - 1)]);
  }
  if (c.canRaise && c.draw && c.street !== 'river' && c.betsThisStreet === 1 && c.rng() < d.semiBluffRaise * (c.nOpp === 1 ? 1 : 0.3)) {
    return betTo(c, SIZE_MENU[2]);
  }
  const callT = need * d.callThresh;
  if (eq >= callT) return { action: 'call' };
  // Minimum-defence floor: the strongest defendShare of the range calls even without the pot odds.
  const pct = typeof c.rangePct === 'number' ? c.rangePct : rangePercentile(huEquity(eq, c.nOpp), c.street);
  if (pct >= 1 - defendShare(d.mdfDefend, c.pot, c.toCall, c.nOpp)) return { action: 'call' };
  if (c.street === 'flop' && c.ip && c.nOpp === 1 && c.betsThisStreet === 1 && eq >= 0.6 * callT && c.rng() < d.floatFreq) {
    return { action: 'call' };
  }
  return { action: 'fold' };
}

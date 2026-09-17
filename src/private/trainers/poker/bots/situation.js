// src/private/trainers/poker/bots/situation.js
// Reads positions and betting context from what a seat may see (view + its events). No hidden cards.
import { seatsFromButton } from '../engine/handState.js';

const MIDDLE = ['UTG', 'HJ', 'CO'];

/** @returns {Record<number, 'UTG'|'HJ'|'CO'|'BTN'|'SB'|'BB'>} position label per seat */
export function positionsOf(view) {
  const order = seatsFromButton(view); // left of the button first, button last
  const out = {};
  if (order.length === 2) {
    out[order[1]] = 'SB'; // heads-up: the button posts the small blind
    out[order[0]] = 'BB';
    return out;
  }
  out[order[0]] = 'SB';
  out[order[1]] = 'BB';
  out[order[order.length - 1]] = 'BTN';
  const middle = order.slice(2, -1);
  middle.forEach((seat, i) => {
    out[seat] = MIDDLE[MIDDLE.length - middle.length + i];
  });
  return out;
}

/** Acts grouped by street, using board events as street boundaries. */
export function actsByStreet(events) {
  const streets = { preflop: [], flop: [], turn: [], river: [] };
  const names = ['preflop', 'flop', 'turn', 'river'];
  let i = 0;
  for (const e of events) {
    if (e.type === 'board') i += 1;
    else if (e.type === 'act') streets[names[i]].push(e);
  }
  return streets;
}

/** Postflop acting order index: 0 acts first. */
function postflopOrder(view) {
  const order = seatsFromButton(view);
  return Object.fromEntries(order.map((seat, i) => [seat, i]));
}

/**
 * Preflop spot for `seat` given the preflop acts so far.
 * kind: 'open' (no voluntary action yet), 'vsLimp' (limpers, no raise), 'vsOpen' (one raise, no callers after it),
 * 'squeeze' (one raise with callers), 'vs3bet' (two raises, seat made the first), 'vs4bet' (three or more raises,
 * or two raises that seat was not part of).
 * @returns {{ kind:string, position:string, raiser:number|null, raiserPosition:string|null, raises:number,
 *   limpers:number, callers:number, ip:boolean }} ip: seat acts after the last raiser postflop
 */
export function preflopSpot(view, preflopActs, seat) {
  const positions = positionsOf(view);
  const raisers = [];
  let limpers = 0;
  let callers = 0;
  for (const a of preflopActs) {
    if (a.action === 'raise') {
      raisers.push(a.seat);
      callers = 0;
    } else if (a.action === 'call') {
      if (raisers.length === 0) limpers += 1;
      else callers += 1;
    }
  }
  const raiser = raisers.length ? raisers[raisers.length - 1] : null;
  const order = postflopOrder(view);
  const ip = raiser === null ? false : order[seat] > order[raiser];
  let kind;
  if (raisers.length === 0) kind = limpers > 0 ? 'vsLimp' : 'open';
  else if (raisers.length === 1) kind = callers > 0 ? 'squeeze' : 'vsOpen';
  else if (raisers.length === 2 && raisers[0] === seat) kind = 'vs3bet';
  else kind = 'vs4bet';
  return {
    kind,
    position: positions[seat],
    raiser,
    raiserPosition: raiser === null ? null : positions[raiser],
    raises: raisers.length,
    limpers,
    callers,
    ip,
  };
}

const FALLBACK = { UTG: 'HJ', HJ: 'CO', CO: 'BTN', BTN: 'SB', SB: 'BB' };

/** Chart key for a preflop spot, falling back to the nearest existing chart. */
export function chartKeyFor(spot, hasChart) {
  const { kind, position, raiserPosition, ip } = spot;
  const candidates = [];
  if (kind === 'open') candidates.push(`open.${position}`, 'open.UTG');
  if (kind === 'vsLimp') candidates.push(`vsLimp.${position}`, 'vsLimp.HJ');
  if (kind === 'vsOpen') {
    let rp = raiserPosition;
    while (rp && !hasChart(`vsOpen.${position}.${rp}`)) rp = FALLBACK[rp];
    if (rp) candidates.push(`vsOpen.${position}.${rp}`);
    candidates.push(`squeeze.${position}`, 'squeeze.CO');
  }
  if (kind === 'squeeze') candidates.push(`squeeze.${position}`, 'squeeze.CO');
  if (kind === 'vs3bet') candidates.push(`vs3bet.${position}.${ip ? 'ip' : 'oop'}`, `vs3bet.CO.${ip ? 'ip' : 'oop'}`);
  if (kind === 'vs4bet') candidates.push(`vs4bet.${ip ? 'ip' : 'oop'}`);
  const key = candidates.find(hasChart);
  if (!key) throw new Error(`No chart for ${kind} ${position}`);
  return key;
}

/**
 * Betting context for `seat` on the current postflop street.
 * @returns {{ street:string, pot:number, toCall:number, stack:number, nOpp:number, ip:boolean,
 *   aggressor:boolean, betsThisStreet:number, spr:number, pfAggressor:number|null }}
 *   aggressor: seat made the last bet or raise of the previous street (the preflop raise on the flop).
 */
export function postflopContext(view, events, seat, legal) {
  const acts = actsByStreet(events);
  const me = view.players.find((p) => p.seat === seat);
  const live = view.players.filter((p) => !p.folded);
  const order = postflopOrder(view);
  const canAct = live.filter((p) => !p.allIn || p.seat === seat);
  const ip = canAct.every((p) => order[p.seat] <= order[seat]);
  const lastAggressor = (list) => {
    const agg = list.filter((a) => a.action === 'bet' || a.action === 'raise');
    return agg.length ? agg[agg.length - 1].seat : null;
  };
  const previous = { flop: 'preflop', turn: 'flop', river: 'turn' }[view.street];
  const pot = view.players.reduce((sum, p) => sum + p.total, 0);
  return {
    street: view.street,
    pot,
    toCall: legal.toCall,
    stack: me.stack,
    nOpp: live.length - 1,
    ip,
    aggressor: lastAggressor(acts[previous]) === seat,
    betsThisStreet: acts[view.street].filter((a) => a.action === 'bet' || a.action === 'raise').length,
    spr: pot > 0 ? me.stack / pot : Infinity,
    pfAggressor: lastAggressor(acts.preflop),
  };
}

// The options graded at one decision (spec §7.1): fold, check/call, bet or raise at 1/3, 1/2, 3/4 and pot
// of the pot after calling (postflop) or the standard preflop size, all-in, and the hero's own size.
import { legalActions } from '../engine/handState.js';
import { potTotal } from '../lib/pot.js';
import { clampRaise } from '../lib/sizing.js';

export const SIZE_FRACTIONS = Object.freeze([1 / 3, 1 / 2, 3 / 4, 1]);

/** 'fold' | 'check' | 'call' | 'bet:<units>' | 'raise:<units>' (the evByOption keys). */
export const optionKey = (action, size = null) => (size === null || size === undefined ? action : `${action}:${size}`);

/** @returns {{ action:string, size:number|null }} */
export function parseOptionKey(key) {
  const [action, size] = String(key).split(':');
  return { action, size: size === undefined ? null : Number(size) };
}

/**
 * @param {object} state engine state with a player to act
 * @param {{ preflopRaiseTo?:number|null, chosen?:{ action:string, amount?:number }|null }} [extras]
 * @returns {{ key:string, action:string, size:number|null }[]}
 */
export function optionsFor(state, { preflopRaiseTo = null, chosen = null } = {}) {
  const legal = legalActions(state);
  if (!legal) throw new Error('nobody is to act');
  const out = [];
  const seen = new Set();
  const add = (action, size = null) => {
    const key = optionKey(action, size);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, action, size });
  };
  if (!legal.canCheck) add('fold');
  add(legal.canCheck ? 'check' : 'call');
  if (legal.canRaise) {
    const kind = legal.raiseKind;
    if (state.street === 'preflop') {
      if (Number.isFinite(preflopRaiseTo)) add(kind, clampRaise(legal, preflopRaiseTo));
    } else {
      const potAfterCall = potTotal(state) + legal.toCall;
      for (const f of SIZE_FRACTIONS) add(kind, clampRaise(legal, state.currentBet + f * potAfterCall));
    }
    add(kind, legal.maxRaiseTo);
  }
  if (chosen) {
    const aggressive = chosen.action === 'bet' || chosen.action === 'raise';
    add(chosen.action, aggressive ? chosen.amount : null);
  }
  return out;
}

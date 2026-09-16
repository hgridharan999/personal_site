import { describe, it, expect } from 'vitest';
import { reduceHand, legalActions } from '../engine/handState.js';
import { parseCards } from '../engine/cards.js';
import {
  PRESETS, SIZING_CLOSED, clampRaise, presetRaiseTo, sizingReducer, resolveRaise, callLabel, raiseLabel,
} from './sizing.js';
import { potTotal } from './pot.js';

const deck = parseCards('AhKhQhJhTh9h');
const hole = (seat) => ({ type: 'hole', seat, cards: [deck[seat * 2], deck[seat * 2 + 1]] });

// 3 players: seat 0 button, seat 1 SB, seat 2 BB. Seat 0 acts first preflop.
function preflop(stacks = [200, 200, 200]) {
  return [
    { type: 'start', seats: stacks.map((stack, seat) => ({ seat, stack })), button: 0, sb: 1, bb: 2 },
    hole(0), hole(1), hole(2),
  ];
}

// Everyone calls or checks to the flop: pot 6, seat 1 first to act, nothing bet.
function flop() {
  return [
    ...preflop(),
    { type: 'act', seat: 0, action: 'call' },
    { type: 'act', seat: 1, action: 'call' },
    { type: 'act', seat: 2, action: 'check' },
    { type: 'board', cards: parseCards('2c3c4d') },
  ];
}

const spot = (events) => {
  const view = reduceHand(events);
  return { view, legal: legalActions(view) };
};

describe('presets', () => {
  it('lists third, half, two thirds, pot and all-in', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['third', 'half', 'twoThirds', 'pot', 'allIn']);
  });

  it('sizes a preflop open as call, then raise by a fraction of the pot', () => {
    const { view, legal } = spot(preflop());
    expect(potTotal(view)).toBe(3);
    // pot after the call = 3 + 2 = 5
    expect(presetRaiseTo(view, legal, 3)).toBe(7); // 2 + 5
    expect(presetRaiseTo(view, legal, 2)).toBe(5); // 2 + round(3.33)
    expect(presetRaiseTo(view, legal, 1)).toBe(5); // 2 + round(2.5)
    expect(presetRaiseTo(view, legal, 0)).toBe(4); // 2 + round(1.67), also the min raise
    expect(presetRaiseTo(view, legal, 4)).toBe(200);
  });

  it('sizes a flop bet as a fraction of the pot', () => {
    const { view, legal } = spot(flop());
    expect(legal.raiseKind).toBe('bet');
    expect(presetRaiseTo(view, legal, 0)).toBe(2);
    expect(presetRaiseTo(view, legal, 1)).toBe(3);
    expect(presetRaiseTo(view, legal, 2)).toBe(4);
    expect(presetRaiseTo(view, legal, 3)).toBe(6);
  });

  it('counts chips the hero already committed when facing a raise', () => {
    // Seat 0 raises to 6. Seat 1 (SB, committed 1) owes 5; pot 9, so the pot after the call is 14.
    const { view, legal } = spot([...preflop(), { type: 'act', seat: 0, action: 'raise', amount: 6 }]);
    expect(legal.seat).toBe(1);
    expect(presetRaiseTo(view, legal, 3)).toBe(20); // 6 + 14
    expect(presetRaiseTo(view, legal, 1)).toBe(13); // 6 + 7
    expect(presetRaiseTo(view, legal, 0)).toBe(11); // 6 + round(4.67), above the min of 10
  });

  it('clamps presets to the legal range', () => {
    const { view, legal } = spot(preflop([6, 200, 200]));
    expect(legal.maxRaiseTo).toBe(6);
    expect(presetRaiseTo(view, legal, 3)).toBe(6);
    expect(presetRaiseTo(view, legal, 0)).toBe(4);
  });

  it('returns null when raising is not allowed or the preset is unknown', () => {
    const { view, legal } = spot(preflop());
    expect(presetRaiseTo(view, { ...legal, canRaise: false, minRaiseTo: null, maxRaiseTo: null }, 3)).toBeNull();
    expect(presetRaiseTo(view, legal, 9)).toBeNull();
  });
});

describe('clampRaise', () => {
  const legal = { canRaise: true, minRaiseTo: 4, maxRaiseTo: 200, raiseKind: 'raise', seat: 0 };
  it('rounds and clamps', () => {
    expect(clampRaise(legal, 1)).toBe(4);
    expect(clampRaise(legal, 9.4)).toBe(9);
    expect(clampRaise(legal, 999)).toBe(200);
    expect(clampRaise({ canRaise: false }, 10)).toBeNull();
  });
});

describe('sizingReducer', () => {
  const { view, legal } = spot(preflop());
  const run = (commands, start = SIZING_CLOSED) => commands.reduce((s, c) => sizingReducer(s, c, { view, legal }), start);

  it('opens at the minimum raise', () => {
    expect(run([{ type: 'openSizing' }])).toEqual({ open: true, amount: 4, text: '2' });
  });

  it('applies a preset', () => {
    expect(run([{ type: 'preset', index: 3 }])).toEqual({ open: true, amount: 7, text: '3.5' });
  });

  it('nudges from the typed or current amount and clamps', () => {
    expect(run([{ type: 'openSizing' }, { type: 'nudge', units: 1 }])).toEqual({ open: true, amount: 5, text: '2.5' });
    expect(run([{ type: 'text', text: '10' }, { type: 'nudge', units: 10 }])).toEqual({ open: true, amount: 30, text: '15' });
    expect(run([{ type: 'openSizing' }, { type: 'nudge', units: -10 }])).toEqual({ open: true, amount: 4, text: '2' });
    expect(run([{ type: 'nudge', units: 1 }])).toEqual({ open: true, amount: 5, text: '2.5' });
  });

  it('keeps typed text unclamped until it is confirmed', () => {
    expect(run([{ type: 'text', text: '1' }])).toEqual({ open: true, amount: 2, text: '1' });
    expect(run([{ type: 'text', text: 'x' }])).toEqual({ open: true, amount: null, text: 'x' });
  });

  it('cancels, and stays closed when raising is not allowed', () => {
    expect(run([{ type: 'openSizing' }, { type: 'cancel' }])).toBe(SIZING_CLOSED);
    const noRaise = { ...legal, canRaise: false, minRaiseTo: null, maxRaiseTo: null };
    expect(sizingReducer(SIZING_CLOSED, { type: 'openSizing' }, { view, legal: noRaise })).toBe(SIZING_CLOSED);
  });

  it('ignores unknown commands and presets', () => {
    const open = run([{ type: 'openSizing' }]);
    expect(sizingReducer(open, { type: 'fold' }, { view, legal })).toBe(open);
    expect(sizingReducer(open, { type: 'preset', index: 7 }, { view, legal })).toBe(open);
  });
});

describe('all-in is the only raise (minRaiseTo === maxRaiseTo)', () => {
  // Seat 0 has 3 units facing the big blind: any raise is all-in to 3.
  const { view, legal } = spot(preflop([3, 200, 200]));

  it('sizes every preset, nudge and typed amount to the all-in', () => {
    expect(legal).toMatchObject({ canRaise: true, minRaiseTo: 3, maxRaiseTo: 3 });
    for (let index = 0; index < PRESETS.length; index += 1) expect(presetRaiseTo(view, legal, index)).toBe(3);
    expect(sizingReducer(SIZING_CLOSED, { type: 'openSizing' }, { view, legal })).toEqual({ open: true, amount: 3, text: '1.5' });
    expect(sizingReducer(SIZING_CLOSED, { type: 'nudge', units: 10 }, { view, legal })).toEqual({ open: true, amount: 3, text: '1.5' });
    expect(sizingReducer(SIZING_CLOSED, { type: 'nudge', units: -10 }, { view, legal })).toEqual({ open: true, amount: 3, text: '1.5' });
    expect(resolveRaise({ open: true, amount: null, text: '50' }, legal)).toEqual({ action: 'raise', amount: 3 });
    expect(raiseLabel(legal, 3)).toBe('All-in 1.5');
  });
});

describe('resolveRaise', () => {
  const { legal } = spot(preflop());
  it('turns the entered size into a legal raise', () => {
    expect(resolveRaise({ open: true, amount: null, text: '1' }, legal)).toEqual({ action: 'raise', amount: 4 });
    expect(resolveRaise({ open: true, amount: 7, text: '3.5' }, legal)).toEqual({ action: 'raise', amount: 7 });
    expect(resolveRaise({ open: true, amount: 9, text: 'x' }, legal)).toEqual({ action: 'raise', amount: 9 });
    expect(resolveRaise({ open: true, amount: null, text: 'x' }, legal)).toBeNull();
    expect(resolveRaise(SIZING_CLOSED, legal)).toBeNull();
  });
});

describe('labels', () => {
  it('labels the check and call button', () => {
    expect(callLabel({ canCheck: true, toCall: 0 }, 200)).toBe('Check');
    expect(callLabel({ canCheck: false, toCall: 4 }, 200)).toBe('Call 2.0');
    expect(callLabel({ canCheck: false, toCall: 25 }, 25)).toBe('Call all-in 12.5');
  });

  it('labels bet, raise and all-in', () => {
    expect(raiseLabel({ raiseKind: 'bet', maxRaiseTo: 200 }, 6)).toBe('Bet 3.0');
    expect(raiseLabel({ raiseKind: 'raise', maxRaiseTo: 200 }, 7)).toBe('Raise to 3.5');
    expect(raiseLabel({ raiseKind: 'raise', maxRaiseTo: 200 }, 200)).toBe('All-in 100.0');
  });
});

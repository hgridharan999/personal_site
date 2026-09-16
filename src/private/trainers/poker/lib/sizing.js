// Bet sizing for the hero: pot-relative presets, clamping to legal bounds and the sizing panel reducer.
// All amounts are integer units and "raise to" street totals, as in engine act events.
import { formatBb, formatBbInput, parseBbInput } from './format.js';
import { potTotal } from './pot.js';

export const PRESETS = [
  { key: 'third', label: '⅓', num: 1, den: 3 },
  { key: 'half', label: '½', num: 1, den: 2 },
  { key: 'twoThirds', label: '⅔', num: 2, den: 3 },
  { key: 'pot', label: 'Pot', num: 1, den: 1 },
  { key: 'allIn', label: 'All-in', num: null, den: null },
];

export const SIZING_CLOSED = Object.freeze({ open: false, amount: null, text: '' });

/** Rounds to a whole unit and clamps into [minRaiseTo, maxRaiseTo]. Null when raising is not allowed. */
export function clampRaise(legal, amount) {
  if (!legal?.canRaise) return null;
  return Math.min(Math.max(Math.round(amount), legal.minRaiseTo), legal.maxRaiseTo);
}

/**
 * Raise-to amount for preset `index` (0..4 = 1/3, 1/2, 2/3, pot, all-in).
 * A fraction f means: call first, then raise by f x (pot after the call).
 */
export function presetRaiseTo(view, legal, index) {
  const preset = PRESETS[index];
  if (!legal?.canRaise || !preset) return null;
  if (preset.num === null) return legal.maxRaiseTo;
  const hero = view.players.find((p) => p.seat === legal.seat);
  const toCall = Math.max(view.currentBet - hero.committed, 0);
  const potAfterCall = potTotal(view) + toCall;
  return clampRaise(legal, view.currentBet + Math.round((preset.num * potAfterCall) / preset.den));
}

const openAt = (amount) => ({ open: true, amount, text: formatBbInput(amount) });

/**
 * Sizing panel state machine. `command` comes from keys.js or the panel's buttons:
 * openSizing | preset {index} | nudge {units} | text {text} | cancel. Anything else is ignored.
 */
export function sizingReducer(sizing, command, { view, legal }) {
  if (!legal?.canRaise) return SIZING_CLOSED;
  switch (command.type) {
    case 'openSizing':
      return sizing.open ? sizing : openAt(legal.minRaiseTo);
    case 'preset':
      return PRESETS[command.index] ? openAt(presetRaiseTo(view, legal, command.index)) : sizing;
    case 'nudge': {
      const base = sizing.open ? (parseBbInput(sizing.text) ?? sizing.amount ?? legal.minRaiseTo) : legal.minRaiseTo;
      return openAt(clampRaise(legal, base + command.units));
    }
    case 'text':
      return { open: true, amount: parseBbInput(command.text), text: command.text };
    case 'cancel':
      return SIZING_CLOSED;
    default:
      return sizing;
  }
}

/** The act choice for a confirmed size, clamped to legal bounds. Null if nothing valid is entered. */
export function resolveRaise(sizing, legal) {
  if (!sizing.open || !legal?.canRaise) return null;
  const amount = parseBbInput(sizing.text) ?? sizing.amount;
  if (amount === null) return null;
  return { action: legal.raiseKind, amount: clampRaise(legal, amount) };
}

/** "Check", "Call 2.0", "Call all-in 12.5". `stack` is the hero's stack behind. */
export function callLabel(legal, stack) {
  if (legal.canCheck) return 'Check';
  if (legal.toCall >= stack) return `Call all-in ${formatBb(legal.toCall)}`;
  return `Call ${formatBb(legal.toCall)}`;
}

/** "Bet 3.0", "Raise to 7.0", "All-in 100.0". */
export function raiseLabel(legal, amount) {
  if (amount === legal.maxRaiseTo) return `All-in ${formatBb(amount)}`;
  return `${legal.raiseKind === 'bet' ? 'Bet' : 'Raise to'} ${formatBb(amount)}`;
}

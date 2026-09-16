// Display formatting. Money is integer units (1 unit = 0.5 BB); the UI shows BB with one decimal.
import { RANKS } from '../engine/cards.js';

const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const BB_INPUT = /^(\d+(\.\d*)?|\.\d+)$/;

export const formatBb = (units) => (units / 2).toFixed(1);

export const formatBbLabel = (units) => `${formatBb(units)} BB`;

/** "+12.5", "−3.0" (U+2212 minus) or "0.0". */
export function formatNetBb(units) {
  if (units > 0) return `+${formatBb(units)}`;
  if (units < 0) return `−${formatBb(-units)}`;
  return formatBb(0);
}

/** Size-input text: "12" or "12.5" (no trailing ".0"). */
export const formatBbInput = (units) => String(units / 2);

/** Parses typed BB ("12", "12.5", ".5") into units, rounded to the nearest unit. Null if not a number. */
export function parseBbInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!BB_INPUT.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 2);
}

/** "Ace of hearts" */
export const cardLabel = (card) => `${RANK_NAMES[card >> 2]} of ${SUIT_NAMES[card & 3]}`;

/** "A♥", "10♣" */
export function cardText(card) {
  const rank = RANKS[card >> 2];
  return `${rank === 'T' ? '10' : rank}${SUIT_SYMBOLS[card & 3]}`;
}

/** Diamonds and hearts are red. */
export const isRedCard = (card) => (card & 3) === 1 || (card & 3) === 2;

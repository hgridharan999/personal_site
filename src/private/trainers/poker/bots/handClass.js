// The 169 starting-hand classes and the 1,326 two-card combos.
// Class index = row * 13 + col with ranks 0..12 = 2..A:
//   row === col: pair, row > col: suited (row is the high rank), row < col: offsuit (col is the high rank).
import { RANKS } from '../engine/cards.js';

export const CLASS_COUNT = 169;
export const COMBO_COUNT = 1326;

/** @returns {number} class index 0..168 for two distinct cards */
export function classOf(c1, c2) {
  const r1 = c1 >> 2;
  const r2 = c2 >> 2;
  const hi = r1 > r2 ? r1 : r2;
  const lo = r1 > r2 ? r2 : r1;
  if (hi === lo) return hi * 13 + hi;
  return (c1 & 3) === (c2 & 3) ? hi * 13 + lo : lo * 13 + hi;
}

/** @returns {'pair'|'suited'|'offsuit'} */
export function kindOf(cls) {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  if (row === col) return 'pair';
  return row > col ? 'suited' : 'offsuit';
}

/** e.g. 168 -> 'AA', 167 -> 'AKs', 155 -> 'AKo' */
export function className(cls) {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  if (row === col) return RANKS[row] + RANKS[row];
  return row > col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`;
}

/** Inverse of className. Throws on malformed input. */
export function parseClass(text) {
  const hi = RANKS.indexOf(text[0]);
  const lo = RANKS.indexOf(text[1]);
  if (hi < 0 || lo < 0) throw new Error(`Bad class: ${text}`);
  if (text.length === 2 && hi === lo) return hi * 13 + hi;
  if (text.length === 3 && hi > lo && text[2] === 's') return hi * 13 + lo;
  if (text.length === 3 && hi > lo && text[2] === 'o') return lo * 13 + hi;
  throw new Error(`Bad class: ${text}`);
}

/** Combos per class: 6 pairs, 4 suited, 12 offsuit. */
export const combosIn = (cls) => ({ pair: 6, suited: 4, offsuit: 12 })[kindOf(cls)];

// COMBO_CARDS[2i], COMBO_CARDS[2i+1] are the cards of combo i (low card first).
export const COMBO_CARDS = new Uint8Array(COMBO_COUNT * 2);
export const COMBO_CLASS = new Uint8Array(COMBO_COUNT);
const COMBO_INDEX = new Int16Array(52 * 52).fill(-1);
/** @type {number[][]} combo indices for each class */
export const CLASS_COMBOS = Array.from({ length: CLASS_COUNT }, () => []);

let next = 0;
for (let a = 0; a < 52; a += 1) {
  for (let b = a + 1; b < 52; b += 1) {
    COMBO_CARDS[2 * next] = a;
    COMBO_CARDS[2 * next + 1] = b;
    COMBO_CLASS[next] = classOf(a, b);
    COMBO_INDEX[a * 52 + b] = next;
    COMBO_INDEX[b * 52 + a] = next;
    CLASS_COMBOS[COMBO_CLASS[next]].push(next);
    next += 1;
  }
}

/** @returns {number} combo index 0..1325 */
export const comboOf = (c1, c2) => COMBO_INDEX[c1 * 52 + c2];

/** Expands 169 class weights into 1,326 combo weights. */
export function classWeightsToCombos(classWeights) {
  const out = new Float32Array(COMBO_COUNT);
  for (let i = 0; i < COMBO_COUNT; i += 1) out[i] = classWeights[COMBO_CLASS[i]];
  return out;
}

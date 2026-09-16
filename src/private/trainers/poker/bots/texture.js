// src/private/trainers/poker/bots/texture.js
// Board texture and draw detection.
import { evaluate } from '../engine/evaluator.js';
import { COMBO_COUNT, COMBO_CARDS } from './handClass.js';

const WHEEL_ACE = 13; // rank bit 13 stands for an ace playing low

function rankMask(cards) {
  let mask = 0;
  for (const c of cards) mask |= 1 << (c >> 2);
  if (mask & (1 << 12)) mask |= 1 << WHEEL_ACE;
  return mask;
}

const bits = (x) => {
  let n = 0;
  for (let v = x; v; v &= v - 1) n += 1;
  return n;
};

// 5-rank windows, lowest = A2345 (bits 13,0,1,2,3) ... highest = TJQKA.
const WINDOWS = [(1 << WHEEL_ACE) | 0b1111, ...Array.from({ length: 9 }, (_, i) => 0b11111 << i)];

/**
 * @param {number[]} board 3-5 cards
 * @returns {{ paired:boolean, monotone:boolean, twoTone:boolean, maxSuit:number, straightWindows:number, wetness:number, highRank:number }}
 *   wetness in [0, 1]: how many strong draws and completed draws the board allows.
 */
export function boardTexture(board) {
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[c & 3] += 1;
  const maxSuit = Math.max(...suits);
  const ranks = new Set(board.map((c) => c >> 2));
  const mask = rankMask(board);
  const straightWindows = WINDOWS.filter((w) => bits(mask & w) >= 3).length;
  const flushiness = maxSuit >= 3 ? 1 : maxSuit === 2 && board.length < 5 ? 0.5 : 0;
  const straightiness = Math.min(1, straightWindows / 3);
  const paired = ranks.size < board.length;
  const wetness = Math.max(0, Math.min(1, 0.5 * flushiness + 0.5 * straightiness - (paired ? 0.15 : 0)));
  return {
    paired,
    monotone: maxSuit >= 3 && board.length === 3,
    twoTone: maxSuit === 2,
    maxSuit,
    straightWindows,
    wetness,
    highRank: Math.max(...board.map((c) => c >> 2)),
  };
}

/**
 * Draws that use at least one hole card. Returns no draws on the river or once the hand is already a straight or better.
 * @returns {{ category:number, flushDraw:boolean, straightDraw:'oesd'|'gutshot'|null }}
 */
export function handFeatures(hole, board) {
  const category = evaluate([...hole, ...board]) >> 20;
  if (board.length >= 5 || category >= 4) return { category, flushDraw: false, straightDraw: null };
  const suitCount = (cards, suit) => cards.filter((c) => (c & 3) === suit).length;
  const flushDraw = hole.some((h) => suitCount([...hole, ...board], h & 3) === 4 && suitCount(board, h & 3) < 4);
  const all = rankMask([...hole, ...board]);
  const boardOnly = rankMask(board);
  const drawWindows = WINDOWS.filter((w) => bits(all & w) === 4 && bits(boardOnly & w) < 4);
  let straightDraw = null;
  if (drawWindows.length >= 2) straightDraw = 'oesd';
  else if (drawWindows.length === 1) straightDraw = 'gutshot';
  return { category, flushDraw, straightDraw };
}

/**
 * Uint8Array(1326): 1 when a combo holds a flush draw or an open-ended (or double gutshot) straight draw that uses
 * its own cards on a flop or turn board. Combos touching the board, made straights and made flushes get 0.
 */
export function comboDraws(board) {
  const out = new Uint8Array(COMBO_COUNT);
  if (board.length >= 5) return out;
  const suits = [0, 0, 0, 0];
  const onBoard = new Uint8Array(52);
  for (const c of board) {
    suits[c & 3] += 1;
    onBoard[c] = 1;
  }
  const boardMask = rankMask(board);
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    const a = COMBO_CARDS[2 * i];
    const b = COMBO_CARDS[2 * i + 1];
    if (onBoard[a] || onBoard[b]) continue;
    const flushDraw = (a & 3) === (b & 3) ? suits[a & 3] === 2 : suits[a & 3] === 3 || suits[b & 3] === 3;
    let mask = boardMask | (1 << (a >> 2)) | (1 << (b >> 2));
    if (mask & (1 << 12)) mask |= 1 << WHEEL_ACE;
    let draws = 0;
    let made = false;
    for (const w of WINDOWS) {
      const n = bits(mask & w);
      if (n === 5) made = true;
      else if (n === 4 && bits(boardMask & w) < 4) draws += 1;
    }
    out[i] = flushDraw || (!made && draws >= 2) ? 1 : 0;
  }
  return out;
}

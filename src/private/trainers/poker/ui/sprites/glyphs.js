// Hand-drawn pixel bitmaps: 'X' = filled pixel, '.' = empty. Ported from the approved Midnight Indigo mockup.
import { RANKS } from '../../engine/cards.js';

/** 3x5 rank glyphs keyed by RANKS character; T (10) is 5x5. */
export const RANK_GLYPHS = {
  2: ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  3: ['XXX', '..X', '.XX', '..X', 'XXX'],
  4: ['X.X', 'X.X', 'XXX', '..X', '..X'],
  5: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  6: ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
  7: ['XXX', '..X', '.X.', '.X.', '.X.'],
  8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  9: ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  T: ['X.XXX', 'X.X.X', 'X.X.X', 'X.X.X', 'X.XXX'],
  J: ['..X', '..X', '..X', 'X.X', '.X.'],
  Q: ['.X.', 'X.X', 'X.X', 'XX.', '.XX'],
  K: ['X.X', 'XX.', 'X..', 'XX.', 'X.X'],
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
};

/** 9-wide suit glyphs indexed by suit (0..3 = c, d, h, s). The spade is the redrawn, approved version. */
export const SUIT_GLYPHS = [
  ['...XXX...', '...XXX...', '.XX.X.XX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '...XXX...'],
  ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
  ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
  ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '..XXXXX..'],
];

/** 7x7 chip for bets and stacks. */
export const CHIP_GLYPH = ['..XXX..', '.X...X.', 'X.XXX.X', 'X.X.X.X', 'X.XXX.X', '.X...X.', '..XXX..'];

export const rankGlyph = (card) => RANK_GLYPHS[RANKS[card >> 2]];
export const suitGlyph = (card) => SUIT_GLYPHS[card & 3];

/** Horizontal runs of filled pixels, so an SVG needs one <rect> per run. */
export function bitmapRuns(rows) {
  const runs = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== 'X') {
        x += 1;
      } else {
        let end = x;
        while (row[end] === 'X') end += 1;
        runs.push({ x, y, w: end - x });
        x = end;
      }
    }
  });
  return runs;
}

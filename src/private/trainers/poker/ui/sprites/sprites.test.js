import { describe, it, expect } from 'vitest';
import { parseCard, RANKS } from '../../engine/cards.js';
import { RANK_GLYPHS, SUIT_GLYPHS, CHIP_GLYPH, rankGlyph, suitGlyph, bitmapRuns } from './glyphs.js';
import { TABLE_W, TABLE_H, tableTone, tableRuns } from './tableGrid.js';

const isRect = (rows, width, height) => rows.length === height && rows.every((r) => r.length === width && /^[X.]+$/.test(r));

describe('glyphs', () => {
  it('has a 3x5 glyph for every rank and a 5x5 ten', () => {
    for (const r of RANKS) expect(isRect(RANK_GLYPHS[r], r === 'T' ? 5 : 3, 5), r).toBe(true);
  });

  it('has 9-wide suit glyphs, including the approved 9-row spade', () => {
    expect(SUIT_GLYPHS).toHaveLength(4);
    for (const rows of SUIT_GLYPHS) expect(rows.every((r) => r.length === 9 && /^[X.]+$/.test(r))).toBe(true);
    expect(SUIT_GLYPHS[3]).toEqual([
      '....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '..XXXXX..',
    ]);
    expect(isRect(CHIP_GLYPH, 7, 7)).toBe(true);
  });

  it('looks glyphs up by card', () => {
    expect(rankGlyph(parseCard('Th'))).toBe(RANK_GLYPHS.T);
    expect(suitGlyph(parseCard('Th'))).toBe(SUIT_GLYPHS[2]);
    expect(rankGlyph(parseCard('2c'))).toBe(RANK_GLYPHS[2]);
  });

  it('compresses rows into horizontal runs', () => {
    expect(bitmapRuns(['X.XX', '....', 'XXXX'])).toEqual([
      { x: 0, y: 0, w: 1 }, { x: 2, y: 0, w: 2 }, { x: 0, y: 2, w: 4 },
    ]);
    const filled = SUIT_GLYPHS[3].join('').split('').filter((ch) => ch === 'X').length;
    expect(bitmapRuns(SUIT_GLYPHS[3]).reduce((sum, run) => sum + run.w, 0)).toBe(filled);
  });
});

// Reference: the mockup generator's table() loop, with palette colors replaced by tone names.
function mockupTone(x, y) {
  const W = 120, H = 56, cx = W / 2, cy = H / 2, a = W / 2 - 1, b = H / 2 - 1;
  const dx = (x + 0.5 - cx) / a, dy = (y + 0.5 - cy) / b;
  const d = Math.abs(dx) ** 5 + dy * dy;
  const di = Math.abs((x + 0.5 - cx) / (a - 5)) ** 5 + ((y + 0.5 - cy) / (b - 5)) ** 2;
  const dl = Math.abs((x + 0.5 - cx) / (a - 9)) ** 5 + ((y + 0.5 - cy) / (b - 9)) ** 2;
  let c = null;
  if (d <= 1) {
    if (di > 1) c = (y < cy - b + 3 || (di > 1.35 && y < cy)) ? 'railHi' : 'rail';
    else if (dl > 0.93 && dl < 1.07) c = 'line';
    else {
      const v = dx * dx + dy * dy;
      c = ((x + y) % 2 === 0 && v > 0.55) ? 'feltDk' : 'felt';
      if (((x * 7 + y * 13) % 23) === 0) c = 'feltHi';
    }
  }
  return c;
}

describe('table art', () => {
  it('matches the approved mockup pixel for pixel', () => {
    expect([TABLE_W, TABLE_H]).toEqual([120, 56]);
    for (let y = 0; y < TABLE_H; y += 1) {
      for (let x = 0; x < TABLE_W; x += 1) expect(tableTone(x, y), `${x},${y}`).toBe(mockupTone(x, y));
    }
  });

  it('has empty corners, a highlighted top rail, a betting line and felt in the middle', () => {
    expect(tableTone(0, 0)).toBeNull();
    expect(tableTone(119, 55)).toBeNull();
    expect(tableTone(60, 1)).toBe('railHi');
    expect(tableTone(109, 28)).toBe('line');
    expect(tableTone(60, 28)).toBe('felt');
  });

  it('covers every table pixel exactly once with same-tone runs', () => {
    const runs = tableRuns();
    let pixels = 0;
    for (let y = 0; y < TABLE_H; y += 1) for (let x = 0; x < TABLE_W; x += 1) if (tableTone(x, y)) pixels += 1;
    expect(runs.reduce((sum, r) => sum + r.w, 0)).toBe(pixels);
    for (const r of runs) {
      for (let x = r.x; x < r.x + r.w; x += 1) expect(tableTone(x, r.y)).toBe(r.tone);
    }
  });
});

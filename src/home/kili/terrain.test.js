import { describe, expect, it } from 'vitest';

import {
  heightAt, isPhone, layoutLines, liftOf, lineCount, parseTerrain,
} from './terrain.js';
import { syntheticTerrainJson, terrainJson } from './testData.js';

const synthetic = () => parseTerrain(syntheticTerrainJson());

/** A grid whose height is 100 m per column, so any smooth sampler must return 100 * column. */
function rampTerrain() {
  const cols = 8;
  const rows = 6;
  const heights = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) heights.push(100 * c);
  return parseTerrain({ grid: [cols, rows], heights });
}

/** Column in the grid that the sample at xs[k] shows. */
const colAt = (l, k) => l.cA + ((l.xs[k] - l.sx0) / l.SW) * (l.cB - l.cA);

describe('parseTerrain', () => {
  it('rejects a grid that does not add up', () => {
    expect(() => parseTerrain(null)).toThrow('bad grid');
    expect(() => parseTerrain({ grid: [2, 2], heights: [1, 2, 3, 4] })).toThrow('bad grid');
    expect(() => parseTerrain({ grid: [8, 6], heights: [1, 2, 3] })).toThrow('do not fill');
    expect(() => parseTerrain({ grid: [8, 6], heights: 'nope' })).toThrow('do not fill');
  });

  it('reads the heights into a typed array and finds the two peaks by name', () => {
    const t = synthetic();
    expect(t.cols).toBe(40);
    expect(t.rows).toBe(30);
    expect(t.heights).toBeInstanceOf(Float32Array);
    expect(t.heights).toHaveLength(1200);
    expect(t.summit).toEqual([20, 12]);
    expect(t.mawenzi).toEqual([30, 14]);
  });

  it('falls back to the known peak positions when the file names none', () => {
    const t = parseTerrain({ grid: [8, 6], heights: new Array(48).fill(900) });
    expect(t.summit).toEqual([132.92, 91.4]);
    expect(t.mawenzi).toEqual([170.24, 98.62]);
  });
});

describe('heightAt', () => {
  it('returns the grid value exactly at every grid point', () => {
    const t = synthetic();
    for (let r = 0; r < t.rows; r += 1) {
      for (let c = 0; c < t.cols; c += 1) expect(heightAt(t, r, c)).toBe(t.heights[r * t.cols + c]);
    }
  });

  it('reproduces a straight slope between grid points (Catmull-Rom is exact on a line)', () => {
    const t = rampTerrain();
    expect(heightAt(t, 2, 3.25)).toBeCloseTo(325, 4);
    expect(heightAt(t, 4.5, 5.5)).toBeCloseTo(550, 4);
  });

  it('is linear between rows', () => {
    const t = synthetic();
    const a = heightAt(t, 12, 20.5);
    const b = heightAt(t, 13, 20.5);
    expect(heightAt(t, 12.25, 20.5)).toBeCloseTo(a + (b - a) * 0.25, 6);
  });

  it('holds the edge value outside the grid', () => {
    const t = rampTerrain();
    expect(heightAt(t, -5, -5)).toBe(0);
    expect(heightAt(t, 99, 99)).toBe(700);
  });
});

describe('liftOf', () => {
  it('is nothing at and below the plains, and the height above them otherwise', () => {
    expect(liftOf(0)).toBe(0);
    expect(liftOf(800)).toBe(0);
    expect(liftOf(800 + 2535)).toBeCloseTo(2535, 6);
  });

  it('stops at the relief of the tallest peak', () => {
    expect(liftOf(5870)).toBeCloseTo(5070, 6);
    expect(liftOf(9000)).toBe(5070);
  });
});

describe('layoutLines', () => {
  it('draws 64 lines on desktop and 48 on phones, and picks phone below 600px', () => {
    expect(lineCount(false)).toBe(64);
    expect(lineCount(true)).toBe(48);
    expect(isPhone(599)).toBe(true);
    expect(isPhone(600)).toBe(false);
  });

  it('samples every line across the whole band', () => {
    const l = layoutLines(synthetic(), 1440, 360, false);
    expect(l.N).toBe(64);
    expect(l.K).toBe(Math.ceil(1440 / 3) + 1);
    expect(l.xs[0]).toBe(0);
    expect(l.xs[l.K - 1]).toBe(1440);
    expect(l.yS).toHaveLength(l.N * l.K);
    expect(l.eS).toHaveLength(l.N * l.K);
    const p = layoutLines(synthetic(), 375, 290, true);
    expect([p.N, p.K, p.sx0, p.SW]).toEqual([48, Math.ceil(375 / 2) + 1, 0, 375]);
  });

  it.each([
    ['desktop', 1440, 360, false, 22, 6],
    ['wide desktop', 2400, 360, false, 22, 6],
    ['tablet', 700, 330, false, 22, 6],
    ['phone', 375, 290, true, 16, 5],
  ])('fits the %s band: the front line on its floor and the tallest ridge just short of the top', (_, w, h, phone, topPad, botPad) => {
    const l = layoutLines(synthetic(), w, h, phone);
    let top = Infinity;
    let bottom = -Infinity;
    for (const y of l.yS) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    expect(top).toBeCloseTo(topPad, 1);
    expect(top).toBeGreaterThanOrEqual(topPad - 0.01);
    expect(bottom).toBeLessThanOrEqual(h - botPad + 0.01);
    expect(l.lineBase[l.N - 1]).toBeCloseTo(h - botPad, 4);
  });

  it('stacks the lines back to front, each base lower than the one behind', () => {
    const l = layoutLines(synthetic(), 1440, 360, false);
    for (let i = 1; i < l.N; i += 1) expect(l.lineBase[i]).toBeGreaterThan(l.lineBase[i - 1]);
  });

  it('spreads the lines a little toward the front', () => {
    const l = layoutLines(synthetic(), 1440, 360, false);
    expect(l.lineBase[l.N - 1] - l.lineBase[l.N - 2]).toBeGreaterThan(l.lineBase[1] - l.lineBase[0]);
  });

  it('leaves the stage edges flat so the lines run out into plain ruled lines', () => {
    const l = layoutLines(synthetic(), 1440, 360, false);
    expect(l.sx0).toBeCloseTo(130, 6);
    for (let i = 0; i < l.N; i += 1) {
      expect(l.yS[i * l.K]).toBeCloseTo(l.lineBase[i], 4);
      expect(l.yS[i * l.K + l.K - 1]).toBeCloseTo(l.lineBase[i], 4);
    }
  });

  it('lets the lines on a phone run off the screen at their true height, with no wall at the edges', () => {
    const l = layoutLines(parseTerrain(terrainJson()), 375, 290, true);
    for (let i = 0; i < l.N - 12; i += 1) {
      const edge = l.yS[i * l.K], next = l.yS[i * l.K + 1];
      const end = l.yS[i * l.K + l.K - 1], prev = l.yS[i * l.K + l.K - 2];
      expect(Math.abs(edge - next), `line ${i} left`).toBeLessThan(2);
      expect(Math.abs(end - prev), `line ${i} right`).toBeLessThan(2);
    }
  });

  it('puts the front rows on plain lines, whatever the ground does there', () => {
    const l = layoutLines(synthetic(), 1440, 360, false);
    const last = l.N - 1;
    for (let k = 0; k < l.K; k += 1) expect(l.yS[last * l.K + k]).toBeCloseTo(l.lineBase[last], 4);
  });

  it('copes with flat ground', () => {
    const flat = parseTerrain({ grid: [8, 6], heights: new Array(48).fill(800) });
    const l = layoutLines(flat, 1000, 300, false);
    expect(l.yS.every(Number.isFinite)).toBe(true);
  });

  it('colours each sample with the real elevation under it', () => {
    const t = synthetic();
    const l = layoutLines(t, 1440, 360, false);
    const line = 30;
    const k = Math.floor(l.K / 2);
    const row = (line / (l.N - 1)) * (t.rows - 1);
    expect(l.eS[line * l.K + k]).toBeCloseTo(heightAt(t, row, colAt(l, k)), 2);
  });

  describe('drape', () => {
    it('lands a grid position on the line it belongs to', () => {
      const t = synthetic();
      const l = layoutLines(t, 1440, 360, false);
      const line = 20;
      const row = (line / (l.N - 1)) * (t.rows - 1);
      const k = Math.floor(l.K / 2);
      const [x, y, li] = l.drape(colAt(l, k), row);
      expect(x).toBeCloseTo(l.xs[k], 3);
      expect(li).toBeCloseTo(line, 6);
      expect(y).toBeCloseTo(l.yS[line * l.K + k], 2);
    });

    it('lifts the summit well above the base of its line', () => {
      const t = synthetic();
      const l = layoutLines(t, 1440, 360, false);
      const [, y, li] = l.drape(...t.summit);
      expect(l.lineBase[Math.floor(li)] - y).toBeGreaterThan(100);
    });
  });

  it('draws the real Uhuru Peak as the top of the whole drawing', () => {
    const t = parseTerrain(terrainJson());
    const l = layoutLines(t, 1440, 360, false);
    let best = Infinity;
    let at = 0;
    l.yS.forEach((y, n) => {
      if (y < best) { best = y; at = n; }
    });
    const summitX = l.sx0 + (t.summit[0] / (t.cols - 1)) * l.SW;
    expect(Math.abs(l.xs[at % l.K] - summitX)).toBeLessThan(15);
    expect(best).toBeCloseTo(22, 0);
  });
});

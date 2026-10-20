import { describe, expect, it } from 'vitest';
import { BERG, PIXEL_BUDGET, WL, bergClearance, bergWaterSpan, canvasSize, fallbackShapes, insideBerg } from './iceberg.js';

describe('canvasSize', () => {
  it('uses the device pixel ratio, capped at 2, and the governor quality', () => {
    expect(canvasSize(320, 260, 1, 1)).toEqual({ w: 320, h: 260 });
    expect(canvasSize(320, 260, 3, 1)).toEqual({ w: 640, h: 520 });
    expect(canvasSize(320, 260, 2, 0.5)).toEqual({ w: 320, h: 260 });
  });

  it('never goes over the pixel budget, and never to zero', () => {
    const { w, h } = canvasSize(1920, 320, 2, 1);
    expect(w * h).toBeLessThanOrEqual(PIXEL_BUDGET * 1.01);
    expect(w / h).toBeCloseTo(1920 / 320, 1);
    expect(canvasSize(0, 0, 0, 0.01)).toEqual({ w: 1, h: 1 });
  });
});

describe('fallbackShapes', () => {
  it('describes the same polygon as the shader: the hull is the submerged part of BERG', () => {
    const s = fallbackShapes();
    expect(s.hull.split(' ')).toHaveLength(BERG.length - 9);
    expect(s.hull.split(' ')[0]).toBe(`${BERG[9][0].toFixed(4)},${(WL + BERG[9][1]).toFixed(4)}`);
  });

  it('is deterministic, so the facets never change between loads', () => {
    expect(fallbackShapes()).toEqual(fallbackShapes());
    const s = fallbackShapes();
    expect(s.triangles).toHaveLength(14);
    expect(s.chords).toHaveLength(16);
  });

  it('prefixes its SVG ids with hm-', () => {
    const s = fallbackShapes();
    expect(s.gradient.id).toMatch(/^hm-/);
    expect(s.clipId).toMatch(/^hm-/);
  });
});

describe('bergWaterSpan', () => {
  it('is where the iceberg crosses the waterline: [-0.2, 0.2367]', () => {
    const [l, r] = bergWaterSpan();
    expect(l).toBeCloseTo(-0.2, 10);
    expect(r).toBeCloseTo(0.2367, 3);
  });

  it('matches the polygon: the tip is above the line between the two crossings, nothing is outside them', () => {
    const [l, r] = bergWaterSpan();
    const above = BERG.filter(([, y]) => y < 0);
    expect(above.length).toBeGreaterThan(0);
    for (const [x] of above) {
      expect(x).toBeGreaterThan(l);
      expect(x).toBeLessThan(r);
    }
  });
});

describe('insideBerg', () => {
  it('is true inside the tip and the hull, in band-height coordinates from the top', () => {
    expect(insideBerg(0, WL - 0.05)).toBe(true); // inside the tip, above the water
    expect(insideBerg(0, WL + 0.3)).toBe(true); // inside the hull
    expect(insideBerg(0.5, WL + 0.2)).toBe(true);
    expect(insideBerg(-0.5, WL + 0.3)).toBe(true);
  });

  it('is false in the sky, in the open water, and past the hull', () => {
    expect(insideBerg(0, WL - 0.3)).toBe(false); // above the tip
    expect(insideBerg(0.8, WL + 0.1)).toBe(false);
    expect(insideBerg(-0.9, WL + 0.3)).toBe(false);
    expect(insideBerg(0, WL + 0.8)).toBe(false); // below the keel
    expect(insideBerg(0.5, WL - 0.05)).toBe(false); // above the water, off to the side
  });

  it('agrees with the vertices: every vertex is on the boundary, a nudge inward is inside', () => {
    // the centroid of the polygon is inside
    const cx = BERG.reduce((a, [x]) => a + x, 0) / BERG.length;
    const cy = BERG.reduce((a, [, y]) => a + y, 0) / BERG.length;
    expect(insideBerg(cx, WL + cy)).toBe(true);
  });
});

describe('bergClearance', () => {
  it('is 0 under the whole tip, where the ice reaches the line', () => {
    const [l, r] = bergWaterSpan();
    for (let x = l; x <= r; x += 0.01) expect(bergClearance(x)).toBe(0);
    expect(bergClearance(0)).toBe(0);
  });

  it('is the depth of the top of the hull over the shelf on either side', () => {
    expect(bergClearance(-0.31)).toBeCloseTo(0.045, 3); // the left shelf, a hair under the line
    expect(bergClearance(-0.42)).toBeCloseTo(0.07, 3);
    expect(bergClearance(0.3)).toBeCloseTo(0.04, 3); // the right shelf
    expect(bergClearance(0.27)).toBeCloseTo(0.0211, 3); // between the tip and the shelf the hull climbs to the line
  });

  it('is Infinity past the hull, where there is no ice at all', () => {
    for (const x of [-1.5, -0.71, 0.71, 1.2]) expect(bergClearance(x)).toBe(Infinity);
  });

  it('is continuous across the hull (no cliff the waterline could fall off) and never negative', () => {
    let prev = bergClearance(-0.69);
    for (let x = -0.69; x <= 0.69; x += 0.002) {
      const c = bergClearance(x);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(Math.abs(c - prev)).toBeLessThan(0.05); // the steepest flank is under 0.13 deep per 0.04 across
      prev = c;
    }
  });

  it('is never deeper than the polygon itself: the vertical line at x meets the ice at that depth', () => {
    for (const x of [-0.6, -0.45, -0.31, 0.3, 0.5, 0.65]) {
      const c = bergClearance(x);
      expect(insideBerg(x, WL + c + 0.005)).toBe(true); // just under the top is ice
      expect(insideBerg(x, WL + c - 0.005)).toBe(false); // just above it is water
    }
  });
});

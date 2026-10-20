import { describe, expect, it } from 'vitest';
import { BERG, PIXEL_BUDGET, WL, canvasSize, fallbackShapes } from './iceberg.js';

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

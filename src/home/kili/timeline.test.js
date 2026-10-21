import { describe, expect, it } from 'vitest';

import {
  BAND_AT, BAND_PERIOD, BAND_RISE, createPlayhead, lifeState, lineProgress, ROUTE_AT, ROUTE_DUR,
  STAGGER, stillState, TIDE, totalDraw,
} from './timeline.js';

describe('the draw-in', () => {
  it('takes the stagger across all lines plus one line to draw', () => {
    expect(totalDraw(64)).toBeCloseTo(63 * STAGGER + 0.8, 10);
    expect(totalDraw(48)).toBeLessThan(totalDraw(64));
  });

  it('draws line 0 first, later lines later, and finishes them all by the end', () => {
    expect(lineProgress(-1, 0)).toBe(0);
    expect(lineProgress(0, 0)).toBe(0);
    expect(lineProgress(0.4, 0)).toBeGreaterThan(0);
    expect(lineProgress(0.4, 0)).toBeGreaterThan(lineProgress(0.4, 30));
    expect(lineProgress(0.1, 20)).toBe(0);
    expect(lineProgress(totalDraw(64), 63)).toBe(1);
    expect(lineProgress(totalDraw(64) + 5, 0)).toBe(1);
  });
});

describe('life: the colour tide, the route and the band of light', () => {
  const total = 1000;

  it('has nothing before life begins', () => {
    expect(lifeState(-1, total)).toEqual({ tideH: -1e9, routeLen: 0, bandH: -1e9, bandAmp: 0 });
  });

  it('raises the colour from the plains to above the summit in 3.6 s', () => {
    expect(lifeState(0, total).tideH).toBe(500);
    expect(lifeState(TIDE, total).tideH).toBeCloseTo(6500, 6);
    let prev = 0;
    for (let t = 0; t <= TIDE; t += 0.1) {
      const h = lifeState(t, total).tideH;
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it('draws the route after a short wait, and has drawn all of it before the band of light', () => {
    expect(lifeState(ROUTE_AT, total).routeLen).toBe(0);
    expect(lifeState(ROUTE_AT + ROUTE_DUR / 2, total).routeLen).toBeCloseTo(500, 3);
    expect(lifeState(ROUTE_AT + ROUTE_DUR, total).routeLen).toBe(total);
    expect(ROUTE_AT + ROUTE_DUR).toBeLessThan(BAND_AT);
  });

  it('keeps the band of light for after the colour has settled', () => {
    expect(lifeState(BAND_AT - 0.01, total).bandAmp).toBe(0);
    expect(lifeState(BAND_AT + 1, total).bandAmp).toBe(0.55);
    // each rise fades in from nothing, so the glow never pops on at the start of a cycle
    expect(lifeState(BAND_AT + 0.001, total).bandAmp).toBeLessThan(0.01);
  });

  it('rises through the zones, then rests, every 8 s', () => {
    const rise = BAND_PERIOD * BAND_RISE;
    expect(lifeState(BAND_AT, total).bandH).toBeCloseTo(250, 3);
    expect(lifeState(BAND_AT + rise / 2, total).bandH).toBeCloseTo(250 + 3250, 0);
    expect(lifeState(BAND_AT + rise - 0.001, total).bandH).toBeCloseTo(6750, 0);
    expect(lifeState(BAND_AT + rise + 0.5, total).bandAmp).toBe(0);
    expect(lifeState(BAND_AT + BAND_PERIOD + 1, total).bandH).toBeCloseTo(lifeState(BAND_AT + 1, total).bandH, 6);
  });

  it('has a finished frame with all colour, the whole route and no band of light', () => {
    const s = stillState(total);
    expect(s.tideH).toBeCloseTo(6500, 6);
    expect(s.routeLen).toBe(total);
    expect([s.bandH, s.bandAmp]).toEqual([-1e9, 0]);
  });
});

describe('the playhead', () => {
  it('starts idle', () => {
    const p = createPlayhead();
    expect([p.drawT, p.lifeT, p.done, p.still, p.started]).toEqual([-1, -1, false, false, false]);
    expect(p.lifeNow).toBe(-1);
  });

  it('draws in, then moves into life when the last line is down', () => {
    const p = createPlayhead();
    p.begin(64, false);
    expect(p.drawT).toBe(0);
    expect(p.advance(0.5, 64)).toBe(true);
    expect(p.done).toBe(false);
    expect(p.advance(totalDraw(64), 64)).toBe(true);
    expect(p.done).toBe(true);
    expect(p.lifeT).toBe(0);
    expect(p.advance(0.25, 64)).toBe(true);
    expect(p.lifeT).toBeCloseTo(0.25, 10);
  });

  it('does nothing before it begins', () => {
    const p = createPlayhead();
    expect(p.advance(1, 64)).toBe(false);
    expect(p.drawT).toBe(-1);
  });

  it('jumps straight to the finished frame when begun frozen, and then needs no frames', () => {
    const p = createPlayhead();
    p.begin(64, true);
    expect([p.done, p.still, p.started]).toEqual([true, true, true]);
    expect(p.lifeNow).toBe(BAND_AT);
    expect(p.life(500).routeLen).toBe(500);
    expect(p.advance(1, 64)).toBe(false);
  });

  it('begins only once', () => {
    const p = createPlayhead();
    p.begin(64, false);
    p.advance(1, 64);
    p.begin(64, false);
    expect(p.drawT).toBeCloseTo(1, 10);
  });

  it('freezes mid draw-in and carries on from the first band of light when thawed', () => {
    const p = createPlayhead();
    p.begin(64, false);
    p.advance(0.5, 64);
    p.freeze(64);
    expect(p.still).toBe(true);
    expect(p.thaw()).toBe(true);
    expect([p.still, p.lifeT]).toEqual([false, BAND_AT]);
    expect(p.advance(0.1, 64)).toBe(true);
    expect(p.lifeT).toBeCloseTo(BAND_AT + 0.1, 10);
    expect(p.thaw()).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  createPlayhead, lifeState, LIFE_END, lineProgress, ROUTE_AT, ROUTE_DUR, STAGGER, stillState, TIDE, totalDraw,
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

describe('life: the colour tide and the route', () => {
  const total = 1000;

  it('has nothing before life begins', () => {
    expect(lifeState(-1, total)).toEqual({ tideH: -1e9, routeLen: 0 });
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

  it('draws the route after a short wait, and all of it by the end of life', () => {
    expect(lifeState(ROUTE_AT, total).routeLen).toBe(0);
    expect(lifeState(ROUTE_AT + ROUTE_DUR / 2, total).routeLen).toBeCloseTo(500, 3);
    expect(lifeState(LIFE_END, total).routeLen).toBe(total);
  });

  it('ends when both the colour and the route are done', () => {
    expect(LIFE_END).toBeCloseTo(Math.max(TIDE, ROUTE_AT + ROUTE_DUR), 10);
    expect(lifeState(LIFE_END, total).tideH).toBeCloseTo(6500, 6);
  });

  it('has no band of light in it: that is a CSS overlay now', () => {
    expect(Object.keys(lifeState(2, total)).sort()).toEqual(['routeLen', 'tideH']);
  });

  it('has a finished frame with all the colour and the whole route', () => {
    const s = stillState(total);
    expect(s.tideH).toBeCloseTo(6500, 6);
    expect(s.routeLen).toBe(total);
  });
});

describe('the playhead', () => {
  it('starts idle', () => {
    const p = createPlayhead();
    expect([p.drawT, p.lifeT, p.done, p.still, p.glow, p.started]).toEqual([-1, -1, false, false, false, false]);
    expect(p.lifeNow).toBe(-1);
    expect(p.advance(1, 64)).toBe('idle');
  });

  it('draws in, then moves into life when the last line is down', () => {
    const p = createPlayhead();
    p.begin();
    expect(p.drawT).toBe(0);
    expect(p.advance(0.5, 64)).toBe('run');
    expect(p.done).toBe(false);
    expect(p.advance(totalDraw(64), 64)).toBe('run');
    expect(p.done).toBe(true);
    expect(p.lifeT).toBe(0);
    expect(p.advance(0.25, 64)).toBe('run');
    expect(p.lifeT).toBeCloseTo(0.25, 10);
  });

  it('settles once, when life ends, and then has no work left', () => {
    const p = createPlayhead();
    p.begin();
    p.advance(totalDraw(64), 64);
    let steps = 0;
    let last = 'run';
    while (last === 'run') {
      last = p.advance(1 / 60, 64);
      steps += 1;
    }
    expect(last).toBe('settle');
    expect(steps).toBeGreaterThan(LIFE_END * 60 - 2);
    expect(steps).toBeLessThan(LIFE_END * 60 + 2);
    expect([p.still, p.glow, p.lifeT]).toEqual([true, true, LIFE_END]);
    for (let n = 0; n < 5; n += 1) expect(p.advance(1, 64)).toBe('idle');
    expect(p.life(500).routeLen).toBe(500);
  });

  it('begins only once', () => {
    const p = createPlayhead();
    p.begin();
    p.advance(1, 64);
    p.begin();
    expect(p.drawT).toBeCloseTo(1, 10);
  });

  it('freezes straight to the finished frame, without the light', () => {
    const p = createPlayhead();
    p.begin();
    p.advance(0.5, 64);
    p.freeze(64);
    expect([p.done, p.still, p.glow, p.started, p.lifeNow]).toEqual([true, true, false, true, LIFE_END]);
    expect(p.life(500).routeLen).toBe(500);
    expect(p.advance(1, 64)).toBe('idle');
  });

  it('lets the light start after a freeze, once and only once', () => {
    const p = createPlayhead();
    p.freeze(64);
    expect(p.thaw()).toBe(true);
    expect(p.glow).toBe(true);
    expect(p.thaw()).toBe(false);
  });

  it('has nothing to thaw while it is still moving', () => {
    const p = createPlayhead();
    p.begin();
    expect(p.thaw()).toBe(false);
    expect(p.glow).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  createPlayhead, lifeState, LIFE_END, lineProgress, ROUTE_AT, ROUTE_DUR, STAGGER, stillState, totalDraw,
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

  it('has no route before life begins, but the colour is already there', () => {
    expect(lifeState(-1, total)).toEqual({ tideH: Infinity, routeLen: 0 });
  });

  it('colours every line fully from the first frame: the drawing looks finished as it draws in', () => {
    for (const t of [-1, 0, 1, LIFE_END]) expect(lifeState(t, total).tideH).toBe(Infinity);
  });

  it('draws the route after a short wait, and all of it by the end of life', () => {
    expect(lifeState(ROUTE_AT, total).routeLen).toBe(0);
    expect(lifeState(ROUTE_AT + ROUTE_DUR / 2, total).routeLen).toBeCloseTo(500, 3);
    expect(lifeState(LIFE_END, total).routeLen).toBe(total);
  });

  it('ends when the route is done', () => {
    expect(LIFE_END).toBeCloseTo(ROUTE_AT + ROUTE_DUR, 10);
    expect(lifeState(LIFE_END, total).routeLen).toBe(total);
  });

  it('has no band of light in it: that is a CSS overlay now', () => {
    expect(Object.keys(lifeState(2, total)).sort()).toEqual(['routeLen', 'tideH']);
  });

  it('has a finished frame with all the colour and the whole route', () => {
    const s = stillState(total);
    expect(s.tideH).toBe(Infinity);
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

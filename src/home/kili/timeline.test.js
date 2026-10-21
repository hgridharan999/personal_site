import { describe, expect, it } from 'vitest';

import { createPlayhead, lineProgress, STAGGER, stillState, totalDraw } from './timeline.js';

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

describe('what the canvas shows besides the lines', () => {
  it('is every zone colour and the whole route, from the first frame', () => {
    expect(stillState(1000)).toEqual({ tideH: Infinity, routeLen: 1000 });
  });
});

describe('the playhead', () => {
  it('starts idle', () => {
    const p = createPlayhead();
    expect(p.advance(1 / 60, 64)).toBe('idle');
    expect([p.started, p.done, p.still, p.lifeNow]).toEqual([false, false, false, -1]);
  });

  it('draws in, then settles once when the last line is down, and is a still picture from then on', () => {
    const p = createPlayhead();
    p.begin();
    expect(p.advance(1 / 60, 64)).toBe('run');
    expect(p.lifeNow).toBe(-1);
    let step = 'run';
    let settles = 0;
    for (let n = 0; n < 600 && step !== 'idle'; n += 1) {
      step = p.advance(1 / 60, 64);
      if (step === 'settle') settles += 1;
    }
    expect(settles).toBe(1);
    expect([p.done, p.still, p.lifeNow]).toEqual([true, true, 0]);
    expect(p.drawT).toBeCloseTo(totalDraw(64), 10);
    expect(p.advance(1, 64)).toBe('idle');
  });

  it('freezes straight to the finished frame', () => {
    const p = createPlayhead();
    p.freeze(64);
    expect([p.started, p.done, p.still]).toEqual([true, true, true]);
    expect(p.drawT).toBe(totalDraw(64));
    expect(p.advance(1 / 60, 64)).toBe('idle');
  });

  it('begins only once', () => {
    const p = createPlayhead();
    p.begin();
    p.advance(0.5, 64);
    p.begin();
    expect(p.drawT).toBeCloseTo(0.5, 10);
  });
});

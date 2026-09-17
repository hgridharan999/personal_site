import { describe, it, expect } from 'vitest';
import { thinkTimeMs, withPacing, isBigDecision, PACE } from './pacing.js';
import { contextAfter } from './testHands.js';

const ctxOf = (steps) => {
  const cx = contextAfter(steps);
  return { view: cx.view, seat: cx.seat, legal: cx.legal, events: cx.seatEvents, persona: null, profile: null, bb: 2 };
};

describe('thinkTimeMs', () => {
  it('stays inside the fast and normal windows for small decisions', () => {
    const ctx = ctxOf([]);
    const call = { action: 'call' };
    expect(thinkTimeMs({ speed: 'fast', ctx, choice: call, rng: () => 0 })).toBe(250);
    expect(thinkTimeMs({ speed: 'fast', ctx, choice: call, rng: () => 0.999999 })).toBe(600);
    expect(thinkTimeMs({ speed: 'normal', ctx, choice: call, rng: () => 0.5 })).toBe(1200);
    expect(PACE.normal).toEqual([600, 1800]);
  });

  it('takes 1.6x longer for all-ins and actions of 20 BB or more', () => {
    const ctx = ctxOf([]);
    const jam = { action: 'raise', amount: ctx.legal.maxRaiseTo };
    expect(isBigDecision(ctx, jam)).toBe(true);
    expect(isBigDecision(ctx, { action: 'raise', amount: 5 })).toBe(false);
    expect(thinkTimeMs({ speed: 'normal', ctx, choice: jam, rng: () => 0 })).toBe(960);
    const small = ctxOf(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'c 1', 'B Kh8d4s', 'b 1 10']);
    expect(isBigDecision(small, { action: 'call' })).toBe(false);
    const big = ctxOf(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'c 1', 'B Kh8d4s', 'b 1 40']);
    expect(isBigDecision(big, { action: 'call' })).toBe(true);
    expect(isBigDecision(big, { action: 'fold' })).toBe(false);
  });
});

describe('withPacing', () => {
  it('waits only the remainder of the think time and passes dispose through', async () => {
    let t = 0;
    const slept = [];
    let disposed = false;
    const inner = {
      decide: async () => {
        t += 100; // compute took 100 ms
        return { action: 'call' };
      },
      dispose: () => {
        disposed = true;
      },
    };
    const paced = withPacing(inner, { speed: 'fast', rng: () => 0, now: () => t, sleep: async (ms) => slept.push(ms) });
    expect(await paced.decide(ctxOf([]))).toEqual({ action: 'call' });
    expect(slept).toEqual([150]);
    paced.dispose();
    expect(disposed).toBe(true);
  });
});

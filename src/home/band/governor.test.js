import { describe, expect, it } from 'vitest';
import { GOVERNOR, createGovernor } from './governor.js';

/** A struggling GPU: fast frames mixed with long ones, averaging ~39ms. */
const SLOW_GPU = (i) => [16.7, 50, 50][i % 3];
/** A healthy 60Hz display. */
const HEALTHY = () => 16.7;
/** A 30fps rAF cap (iOS Low Power Mode) on an idle GPU: steady, with a little timing jitter. */
const CAPPED_30 = (i) => 33.3 + ((i * 7) % 5) * 0.4 - 0.8;

/**
 * Feed `count` frames whose gaps come from gap(i). Records every state change by tick:
 * quality steps (up or down) and half rate switching on or off.
 */
function feed(gov, count, gap, state = { ts: 1000, tick: 0 }) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const before = { q: gov.quality, half: gov.halfRate };
    state.ts += gap(state.tick++);
    gov.tick(state.ts);
    if (gov.quality !== before.q) events.push({ tick: state.tick, quality: gov.quality });
    if (gov.halfRate !== before.half) events.push({ tick: state.tick, halfRate: gov.halfRate });
  }
  return { events, state };
}

describe('frame governor: stepping down', () => {
  it('leaves a healthy 60fps (or 144fps) loop alone', () => {
    for (const ms of [16.7, 6.9]) {
      const gov = createGovernor();
      const { events } = feed(gov, 2000, () => ms);
      expect(events).toEqual([]);
      expect(gov.quality).toBe(1);
      expect(gov.halfRate).toBe(false);
    }
  });

  it('sheds resolution x0.8 at a time down past 0.55, then halves the frame rate', () => {
    const gov = createGovernor();
    const { events } = feed(gov, 300, SLOW_GPU);
    expect(events.map((e) => e.quality ?? 'half')).toEqual([
      expect.closeTo(0.8, 10), expect.closeTo(0.64, 10), expect.closeTo(0.512, 10), 'half',
    ]);
    expect(gov.quality).toBeCloseTo(0.512, 10); // 0.512 is below the 0.55 floor: no further shrinking
  });

  it('waits out the EMA and 45 consecutive slow frames before each step', () => {
    const gov = createGovernor();
    const ticks = feed(gov, 300, SLOW_GPU).events.map((e) => e.tick);
    // first step: the EMA (starting at 16.7ms, weight .08) needs a few frames to pass 27ms, then 46 slow frames
    expect(ticks[0]).toBeGreaterThanOrEqual(GOVERNOR.slowFrames + 3);
    expect(ticks[0]).toBeLessThanOrEqual(GOVERNOR.slowFrames + 15);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBe(GOVERNOR.slowFrames + 1);
  });

  it('does not count a short stall, and resets the streak when the frames are fast again', () => {
    const gov = createGovernor();
    const state = { ts: 1000, tick: 0 };
    feed(gov, 20, SLOW_GPU, state); // streak ~12
    expect(feed(gov, 20, SLOW_GPU, state).events).toEqual([]); // ~32
    expect(feed(gov, 60, HEALTHY, state).events).toEqual([]); // the EMA falls under 27ms and the streak zeroes
    expect(feed(gov, 30, SLOW_GPU, state).events).toEqual([]); // builds again, never reaching 46 in a row
    expect(feed(gov, 60, SLOW_GPU, state).events).not.toEqual([]); // an unbroken run still steps down
  });

  it('ignores gaps over 120ms (tab switches) as measurements, but caps the dt it reports', () => {
    const gov = createGovernor();
    let ts = 1000;
    gov.tick(ts);
    for (let i = 0; i < 500; i++) {
      ts += 500;
      const step = gov.tick(ts);
      expect(step.resize).toBe(false);
      expect(step.dt).toBe(GOVERNOR.maxDtSeconds);
    }
    expect(gov.quality).toBe(1);
  });

  it('reports dt in seconds, and 0 on the first frame after a restart', () => {
    const gov = createGovernor();
    expect(gov.tick(1000).dt).toBe(0);
    expect(gov.tick(1016).dt).toBeCloseTo(0.016, 10);
    gov.restart();
    expect(gov.tick(9000).dt).toBe(0); // the pause between runs is not a slow frame
    expect(gov.tick(9017).dt).toBeCloseTo(0.017, 10);
  });
});

describe('frame governor: a 30fps rAF cap is not a slow GPU', () => {
  it('never degrades on a steady ~33ms cadence, and draws every frame', () => {
    const gov = createGovernor();
    let ts = 1000;
    let draws = 0;
    for (let i = 0; i < 3000; i++) {
      ts += CAPPED_30(i);
      const step = gov.tick(ts);
      if (step.draw) draws++;
      expect(step.resize).toBe(false);
    }
    expect(gov.quality).toBe(1);
    expect(gov.halfRate).toBe(false);
    expect(draws).toBe(3000);
  });

  it('also ends up whole when the cap switches on mid-session (Low Power Mode turned on)', () => {
    const gov = createGovernor();
    const state = { ts: 1000, tick: 0 };
    feed(gov, 600, HEALTHY, state);
    feed(gov, 6000, CAPPED_30, state);
    // at worst it dips once while the old 60fps gaps leave its window, and it must then climb back
    expect(gov.quality).toBe(1);
    expect(gov.halfRate).toBe(false);
  });

  it('still catches a GPU that is slow: a mix of fast and slow gaps', () => {
    const gov = createGovernor();
    expect(feed(gov, 300, SLOW_GPU).events.length).toBeGreaterThan(0);
  });
});

describe('frame governor: recovery', () => {
  /** Get to half rate at quality 0.512 with a struggling GPU, then continue on that clock. */
  function degraded() {
    const gov = createGovernor();
    const { state } = feed(gov, 300, SLOW_GPU);
    expect(gov.halfRate).toBe(true);
    return { gov, state };
  }

  it('leaves half rate, then wins resolution back one step at a time, once frames stay healthy', () => {
    const { gov, state } = degraded();
    const { events } = feed(gov, 1500, HEALTHY, state);
    expect(events.map((e) => (e.quality === undefined ? 'full rate' : e.quality))).toEqual([
      'full rate', expect.closeTo(0.64, 10), expect.closeTo(0.8, 10), 1,
    ]);
    expect(gov.quality).toBe(1);
    expect(gov.halfRate).toBe(false);
    // each step takes a full run of healthy frames
    events.slice(1).forEach((e, i) => expect(e.tick - events[i].tick).toBe(GOVERNOR.recoverFrames));
  });

  it('does not recover while the frames are still slow', () => {
    const { gov, state } = degraded();
    const { events } = feed(gov, 1500, (i) => [16.7, 33.3, 33.3][i % 3], state); // mean 27.8: above the 27ms limit
    expect(events.filter((e) => e.quality === 1 || e.halfRate === false)).toEqual([]);
    expect(gov.halfRate).toBe(true);
  });

  it('recovers on a 30fps cap too: those frames are healthy for that clock', () => {
    const { gov, state } = degraded();
    feed(gov, 3000, CAPPED_30, state);
    expect(gov.halfRate).toBe(false);
    expect(gov.quality).toBe(1);
  });

  it('waits twice as long after a recovery is undone, so it cannot flap every few seconds', () => {
    const { gov, state } = degraded();
    // recover from half rate, then the GPU struggles again shortly after
    feed(gov, GOVERNOR.recoverFrames + 40, HEALTHY, state);
    expect(gov.halfRate).toBe(false);
    feed(gov, 200, SLOW_GPU, state);
    expect(gov.halfRate).toBe(true);
    // now one run of 300 healthy frames is no longer enough ...
    expect(feed(gov, GOVERNOR.recoverFrames + 20, HEALTHY, state).events.some((e) => e.halfRate === false)).toBe(false);
    // ... but 600 is
    feed(gov, GOVERNOR.recoverFrames * 2, HEALTHY, state);
    expect(gov.halfRate).toBe(false);
  });

  it('caps the backoff', () => {
    const { gov, state } = degraded();
    for (let round = 0; round < 12; round++) {
      feed(gov, GOVERNOR.recoverMax + 100, HEALTHY, state);
      feed(gov, 150, SLOW_GPU, state);
    }
    // however often it flapped, a recoverMax-long healthy run always recovers
    feed(gov, GOVERNOR.recoverMax + 100, HEALTHY, state);
    expect(gov.halfRate).toBe(false);
  });
});

describe('frame governor: the 60fps draw cap', () => {
  /** Draw rate and the gaps between draws for `seconds` of a display refreshing every `ms`. */
  function cap(ms, seconds = 10) {
    const gov = createGovernor();
    let ts = 1000;
    let lastDraw = null;
    let draws = 0;
    let dtSum = 0;
    const gaps = [];
    for (let i = 0; i < (seconds * 1000) / ms; i++) {
      ts += ms;
      const step = gov.tick(ts);
      dtSum += step.dt;
      if (!step.draw) continue;
      draws++;
      if (lastDraw !== null) gaps.push(ts - lastDraw);
      lastDraw = ts;
    }
    return { fps: draws / seconds, gaps, dtSum };
  }

  it('draws at 60fps on a 120Hz display, never closer than 15ms apart', () => {
    const { fps, gaps } = cap(1000 / 120);
    expect(fps).toBeGreaterThan(59);
    expect(fps).toBeLessThan(61);
    gaps.forEach((g) => expect(g).toBeGreaterThanOrEqual(15));
  });

  it('draws at 60fps on a 240Hz display, and no more than ~72fps at 144Hz', () => {
    expect(cap(1000 / 240).fps).toBeLessThan(61);
    const fps144 = cap(1000 / 144).fps;
    expect(fps144).toBeGreaterThan(55);
    expect(fps144).toBeLessThanOrEqual(73);
  });

  it('does not touch 60Hz, 75Hz, 90Hz or 30Hz: every frame draws', () => {
    for (const hz of [60, 75, 90, 30]) expect(cap(1000 / hz).fps).toBeCloseTo(hz, 0);
  });

  it('keeps the clock whole: dt still adds up to real time on skipped frames', () => {
    expect(cap(1000 / 120, 5).dtSum).toBeCloseTo(5, 1);
  });

  it('half rate draws every other frame', () => {
    const gov = createGovernor();
    const { state } = feed(gov, 300, SLOW_GPU);
    expect(gov.halfRate).toBe(true);
    const draws = [];
    for (let i = 0; i < 10; i++) draws.push(gov.tick((state.ts += 40)).draw);
    expect(draws.filter(Boolean)).toHaveLength(5);
    expect(draws[0]).not.toBe(draws[1]);
  });
});

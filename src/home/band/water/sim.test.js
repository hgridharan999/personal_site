import { describe, expect, it } from 'vitest';
import { WL } from '../iceberg.js';
import { SIM, SPLASH } from './constants.js';
import { createWater } from './sim.js';

const W = 1000;
const H = 320;
const FRAME = 1 / 60;

const make = (opts = {}) => {
  const water = createWater({ dropN: 32, seed: 1, ...opts });
  water.resize(W, H);
  return water;
};

/**
 * Sweep the pointer along a path while advancing in frames of `frame` seconds. Pointer events arrive
 * `eventHz` times a second (carrying the path's position at their own time).
 */
function sweep(water, path, seconds, { frame = FRAME, eventHz = 60, drag = false, onFrame } = {}) {
  let nextEvent = 0;
  const frames = Math.round(seconds / frame);
  for (let f = 0; f < frames; f++) {
    const end = (f + 1) * frame;
    for (; nextEvent < end - 1e-9; nextEvent += 1 / eventHz) {
      const [x, y] = path(Math.max(nextEvent, 0));
      water.point(x, y, drag);
    }
    water.advance(frame);
    onFrame?.(f, water);
  }
}

const alive = (water) => water.snapshot().drops.length;
const surfaceEnergy = (water) => water.energy().surface;
const fieldEnergy = (water) => water.energy().field;

describe('stepping', () => {
  it('takes whole 1/120 s steps, at most 6 a frame, and none for no time', () => {
    const water = make();
    expect(water.advance(0)).toBe(0);
    expect(water.advance(-1)).toBe(0);
    expect(water.advance(NaN)).toBe(0);
    expect(water.advance(SIM.dt)).toBe(1);
    expect(water.advance(FRAME)).toBe(2);
    expect(water.advance(0.1)).toBe(SIM.maxSteps); // a hitch is cut off, never spiralled
    expect(water.advance(10)).toBe(SIM.maxSteps);
    expect(water.steps).toBe(1 + 2 + 2 * SIM.maxSteps);
  });

  it('carries the part of a step it could not take: three frames of 1/90 s make four steps', () => {
    const water = make();
    expect([1, 2, 3].map(() => water.advance(1 / 90))).toEqual([1, 1, 2]);
  });

  it('does nothing before it has a size', () => {
    const water = createWater({ dropN: 8 });
    expect(water.advance(FRAME)).toBe(0);
    expect(water.view().on).toBe(false);
  });

  it('never steps outside advance(): input, views, snapshots, resizes and resets only record', () => {
    const water = make();
    const before = water.steps;
    water.point(0.5, 0.5, true);
    water.press(0.5, 0.5);
    water.leave();
    water.view();
    water.view();
    water.snapshot();
    water.resize(W, H);
    water.resize(W * 2, H);
    water.reset();
    expect(water.steps).toBe(before);
  });
});

describe('frame rate and event rate do not change the water', () => {
  /** A stroke 2 band heights a second, just under the line, across the open water and the iceberg. */
  const stroke = (t) => [-0.9 + 2 * t, WL + 0.03];

  it('gives the same result for 1/60 s and 1/120 s frames: bitwise', () => {
    const a = make();
    const b = make();
    sweep(a, stroke, 1.2, { frame: 1 / 60, eventHz: 60 });
    sweep(b, stroke, 1.2, { frame: 1 / 120, eventHz: 60 });
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.view()).toEqual(b.view());
    expect(a.steps).toBe(b.steps);
  });

  it('includes the splashes: a plunge gives identical drops either way', () => {
    const plunge = (t) => [0.9, 0.1 + 2 * t];
    const a = make();
    const b = make();
    sweep(a, plunge, 0.25, { frame: 1 / 60, eventHz: 60 }); // the drops are still in the air
    sweep(b, plunge, 0.25, { frame: 1 / 120, eventHz: 60 });
    expect(alive(a)).toBeGreaterThan(0);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('deposits the same amount at 30, 60 and 240 pointer events a second (within 3%), and the same energy (within 10%)', () => {
    const results = [30, 60, 240].map((hz) => {
      const water = make();
      sweep(water, stroke, 1.2, { eventHz: hz });
      const { stats } = water.snapshot();
      return { deposit: stats.trench + stats.stir, surface: surfaceEnergy(water), field: fieldEnergy(water) };
    });
    const [lo, mid, hi] = results;
    for (const r of [lo, hi]) {
      expect(Math.abs(r.deposit / mid.deposit - 1)).toBeLessThan(0.03);
      expect(Math.abs(r.surface / mid.surface - 1)).toBeLessThan(0.1);
      expect(Math.abs(r.field / mid.field - 1)).toBeLessThan(0.1);
    }
    expect(mid.deposit).toBeGreaterThan(0);
  });

  it('is repeatable: same seed, same water; a different seed throws different drops', () => {
    const run = (seed) => {
      const water = make({ seed });
      sweep(water, (t) => [0.9, 0.1 + 2 * t], 0.4);
      return water.snapshot().drops;
    };
    expect(run(1)).toEqual(run(1));
    expect(run(1)).not.toEqual(run(2));
  });
});

describe('a still pointer', () => {
  it('does nothing: no energy, no drops, and the view says to draw nothing', () => {
    const water = make();
    water.point(0.4, WL + 0.2, false);
    for (let i = 0; i < 300; i++) {
      water.advance(FRAME);
      expect(surfaceEnergy(water)).toBe(0);
      expect(fieldEnergy(water)).toBe(0);
    }
    expect(alive(water)).toBe(0);
    expect(water.view().on).toBe(false);
  });

  it('stays quiet when it merely hovers in from the side and stops', () => {
    const water = make();
    sweep(water, (t) => [Math.min(-0.5 + t * 0.5, -0.45), WL - 0.3], 1); // moving slowly above the line, then still
    sweep(water, () => [-0.45, WL - 0.3], 2);
    expect(alive(water)).toBe(0);
    expect(water.view().on).toBe(false);
  });
});

describe('splashes', () => {
  const plunge = (x = 0.9) => (t) => [x, 0.1 + 2 * t];

  it('a plunge at 2 band heights a second spawns 3 to 10 drops, and every one lands within 2 seconds', () => {
    const water = make();
    let most = 0;
    sweep(water, plunge(), 0.5, { onFrame: () => { most = Math.max(most, alive(water)); } });
    expect(most).toBeGreaterThanOrEqual(3);
    expect(most).toBeLessThanOrEqual(10);
    sweep(water, () => [0.9, 0.7], 2); // the pointer stays down in the water
    expect(alive(water)).toBe(0);
    expect(water.view().on).toBe(true); // the splash left ripples behind
  });

  it('thrown drops end up kicking the surface and the field when they land', () => {
    const water = make();
    sweep(water, plunge(), 0.2);
    const before = water.energy();
    // let the drops come down while the pointer sits still deep in the water
    sweep(water, () => [0.9, 0.9], 0.8);
    expect(water.energy().surface).toBeGreaterThan(0);
    expect(before.surface).toBeGreaterThan(0);
  });

  it('a plunge into the iceberg\'s own columns throws nothing', () => {
    const water = make();
    sweep(water, plunge(0.0), 0.5, { onFrame: (f, w) => { expect(alive(w)).toBe(0); } });
  });

  it('a slow wade across the line throws no drops', () => {
    const water = make();
    sweep(water, (t) => [0.9, WL - 0.05 + 0.1 * t], 2, { onFrame: (f, w) => { expect(alive(w)).toBe(0); } });
  });

  // The surface dips toward a cursor coming up from below, so the line can pass the cursor between two
  // steps without the cursor itself crossing it: the exit must still be seen.
  it('lifting out of the water throws a few drops up', () => {
    const water = make();
    let most = 0;
    sweep(water, (t) => [0.9, 0.7 - 2 * t], 0.5, { onFrame: () => { most = Math.max(most, alive(water)); } });
    expect(most).toBeGreaterThanOrEqual(2);
  });

  it('skimming along the line sprays', () => {
    const water = make();
    let most = 0;
    sweep(water, (t) => [-1.2 + 3 * t, WL], 0.8, { onFrame: () => { most = Math.max(most, alive(water)); } });
    expect(most).toBeGreaterThan(0);
  });

  it('still moves the water when there are no drops to throw', () => {
    const water = make({ dropN: 0 });
    sweep(water, plunge(), 0.5);
    expect(alive(water)).toBe(0);
    expect(surfaceEnergy(water)).toBeGreaterThan(0);
    expect(water.view().on).toBe(true);
  });
});

describe('presses', () => {
  const press = (x, y) => {
    const water = make();
    water.point(x, y, true);
    water.press(x, y);
    water.advance(SIM.dt);
    return water;
  };

  it('at the surface: a crown of drops, a kick and foam', () => {
    const water = press(0.9, WL + 0.01);
    expect(alive(water)).toBeGreaterThanOrEqual(10);
    expect(alive(water)).toBeLessThanOrEqual(SPLASH.crown);
    expect(surfaceEnergy(water)).toBeGreaterThan(0);
    expect(water.snapshot().surface.foam.some((f) => f > 0.1)).toBe(true);
  });

  it('in the air: a single drip that is let go and falls in', () => {
    const water = press(0.9, WL - 0.2);
    expect(alive(water)).toBe(1);
    const [drop] = water.snapshot().drops;
    expect(drop.vx).toBeCloseTo(0, 6);
    sweep(water, () => [0.9, WL - 0.2], 1.5);
    expect(alive(water)).toBe(0);
    expect(surfaceEnergy(water)).toBeGreaterThan(0); // it landed and kicked the surface
  });

  it('under water: a ring in the field, no drops', () => {
    const water = press(0.9, WL + 0.4);
    expect(alive(water)).toBe(0);
    expect(fieldEnergy(water)).toBeGreaterThan(0);
    expect(surfaceEnergy(water)).toBe(0);
  });

  it('handles a burst of presses without losing the sim: at most a few a step, the rest queue', () => {
    const water = make();
    for (let i = 0; i < 50; i++) water.press(0.9, WL + 0.4);
    water.advance(0.1);
    expect(water.steps).toBe(SIM.maxSteps);
    expect(fieldEnergy(water)).toBeGreaterThan(0);
  });
});

describe('reset and view', () => {
  const busy = () => {
    const water = make();
    sweep(water, (t) => [0.9, 0.1 + 2 * t], 0.4);
    water.press(0.2, WL + 0.01);
    water.advance(FRAME);
    return water;
  };

  it('reset() returns to a perfectly calm sea, and the view says so', () => {
    const water = busy();
    expect(water.view().on).toBe(true);
    water.reset();
    const fresh = make().snapshot();
    const snap = water.snapshot();
    expect(snap.surface).toEqual(fresh.surface);
    expect(snap.field).toEqual(fresh.field);
    expect(snap.drops).toEqual([]);
    const view = water.view();
    expect(view.on).toBe(false);
    expect([...view.surf].every((b, i) => b === (i % 4 === 3 ? 0 : 128))).toBe(true);
    expect([...view.field].every((b, i) => b === (i % 4 === 3 ? 0 : 128))).toBe(true);
  });

  it('forgets the pointer: the next point() snaps and nothing is injected across the gap', () => {
    const water = busy();
    water.reset();
    water.point(-0.9, WL + 0.3, true);
    water.advance(0.1);
    expect(surfaceEnergy(water)).toBe(0);
  });

  it('view() is idempotent: asking twice changes nothing, and uploads are versioned', () => {
    const water = busy();
    const a = water.view();
    const aSurf = Uint8Array.from(a.surf);
    const aDrops = Float32Array.from(a.drops);
    const versions = [a.surfVersion, a.fieldVersion];
    const b = water.view();
    expect([b.surfVersion, b.fieldVersion]).toEqual(versions);
    expect([...b.surf]).toEqual([...aSurf]);
    expect([...b.drops]).toEqual([...aDrops]);
    water.advance(FRAME);
    const c = water.view();
    expect(c.surfVersion).toBeGreaterThan(versions[0]);
    expect(c.fieldVersion).toBeGreaterThan(versions[1]);
  });

  it('puts the drops in the view: dead slots at y = -10, live ones near where the snapshot says', () => {
    const water = busy();
    const { drops } = water.snapshot();
    const view = water.view();
    expect(view.drops).toHaveLength(32 * 4);
    const liveSlots = drops.map((d) => d.slot);
    for (let i = 0; i < 32; i++) {
      if (!liveSlots.includes(i)) expect(view.drops[4 * i + 1]).toBe(SPLASH.dead);
    }
    expect(drops.length).toBeGreaterThan(0);
    expect(view.dropBox[0]).toBeLessThan(view.dropBox[2]);
  });

  it('an idle sea has nothing to draw: on = false, versions still', () => {
    const water = make();
    const a = water.view();
    water.advance(FRAME);
    const b = water.view();
    expect(a.on).toBe(false);
    expect(b.on).toBe(false);
    expect(b.surfVersion).toBe(a.surfVersion);
    expect(b.fieldVersion).toBe(a.fieldVersion);
  });
});

describe('resize', () => {
  it('reports the grids it made', () => {
    const water = make();
    expect(water.dims).toEqual({ aspect: W / H, cols: 500, nx: 200, ny: 50 });
  });

  it('keeps the water when the size is the same, and starts calm when the grid changes', () => {
    const water = make();
    sweep(water, (t) => [0.9, 0.1 + 2 * t], 0.4);
    const energy = surfaceEnergy(water);
    expect(energy).toBeGreaterThan(0);
    water.resize(W, H);
    expect(surfaceEnergy(water)).toBe(energy);
    water.resize(W * 2, H); // a different aspect: a different grid
    expect(surfaceEnergy(water)).toBe(0);
    expect(water.view().on).toBe(false);
    expect(water.dims.aspect).toBe(2 * W / H);
  });

  it('ignores a zero, negative or junk size', () => {
    const water = make();
    const dims = water.dims;
    for (const [w, h] of [[0, 0], [0, 100], [100, 0], [-5, 100], [NaN, 100], [100, NaN], [Infinity, 1]]) water.resize(w, h);
    expect(water.dims).toBe(dims);
  });

  it('caps the grids at the GPU texture size', () => {
    const water = createWater({ dropN: 8, maxTexture: 128 });
    water.resize(4000, 100);
    expect(water.dims.cols).toBeLessThanOrEqual(128);
    expect(water.dims.nx).toBeLessThanOrEqual(128);
  });
});

describe('robustness', () => {
  it('stays finite and inside its limits through 600 frames of the biggest hitch with random pointer abuse', () => {
    const water = make();
    let s = 9;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 600; i++) {
      water.point((rand() - 0.5) * 3, rand(), rand() < 0.5);
      if (rand() < 0.1) water.press((rand() - 0.5) * 3, rand());
      if (rand() < 0.05) water.leave();
      water.advance(0.1);
    }
    const snap = water.snapshot();
    for (const x of [...snap.surface.h, ...snap.surface.v, ...snap.field.u, ...snap.field.v]) expect(Number.isFinite(x)).toBe(true);
    for (const d of snap.drops) for (const k of ['x', 'y', 'vx', 'vy']) expect(Number.isFinite(d[k])).toBe(true);
    const view = water.view();
    expect([...view.surf, ...view.field].every((b) => b >= 0 && b <= 255)).toBe(true);
  });
});

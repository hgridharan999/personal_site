import { describe, expect, it } from 'vitest';
import { WL } from '../iceberg.js';
import { SIM } from './constants.js';
import { createWater } from './sim.js';

const W = 1000;
const H = 320;
const FRAME = 1 / 60;

const make = (opts = {}) => {
  const water = createWater(opts);
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

const surfaceEnergy = (water) => water.energy().surface;
const fieldEnergy = (water) => water.energy().field;
const foam = (water) => water.snapshot().surface.foam;

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
    const water = createWater();
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

  it('includes the impacts: a plunge leaves identical water either way', () => {
    const plunge = (t) => [0.9, 0.1 + 2 * t];
    const a = make();
    const b = make();
    sweep(a, plunge, 0.6, { frame: 1 / 60, eventHz: 60 });
    sweep(b, plunge, 0.6, { frame: 1 / 120, eventHz: 60 });
    expect(a.snapshot().stats.plunges).toBe(1);
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

  it('is repeatable: the same input gives the same water', () => {
    const run = () => {
      const water = make();
      sweep(water, (t) => [0.9, 0.1 + 2 * t], 0.4);
      return water.snapshot();
    };
    expect(run()).toEqual(run());
  });
});

describe('a still pointer', () => {
  it('does nothing: no energy, and the view says to draw nothing', () => {
    const water = make();
    water.point(0.4, WL + 0.2, false);
    for (let i = 0; i < 300; i++) {
      water.advance(FRAME);
      expect(surfaceEnergy(water)).toBe(0);
      expect(fieldEnergy(water)).toBe(0);
    }
    expect(water.view().on).toBe(false);
  });

  it('stays quiet when it merely hovers in from the side and stops', () => {
    const water = make();
    sweep(water, (t) => [Math.min(-0.5 + t * 0.5, -0.45), WL - 0.3], 1); // moving slowly above the line, then still
    sweep(water, () => [-0.45, WL - 0.3], 2);
    expect(water.view().on).toBe(false);
  });
});

describe('impacts at the waterline', () => {
  const plunge = (x = 0.9) => (t) => [x, 0.1 + 2 * t];

  it('a plunge at 2 band heights a second pushes the water down and leaves foam, and the waves keep ringing', () => {
    const water = make();
    sweep(water, plunge(), 0.5);
    expect(water.snapshot().stats.plunges).toBe(1);
    expect(foam(water).some((f) => f > 0.1)).toBe(true);
    sweep(water, () => [0.9, 0.7], 1); // the pointer stays down in the water
    expect(surfaceEnergy(water)).toBeGreaterThan(0);
    expect(water.view().on).toBe(true);
  });

  it('a slow wade across the line is not an impact', () => {
    const water = make();
    sweep(water, (t) => [0.9, WL - 0.05 + 0.1 * t], 2);
    const { stats } = water.snapshot();
    expect([stats.plunges, stats.exits]).toEqual([0, 0]);
    expect(foam(water).every((f) => f === 0)).toBe(true);
  });

  // The surface dips toward a cursor coming up from below, so the line can pass the cursor between two
  // steps without the cursor itself crossing it: the exit must still be seen.
  it('coming out of the water pulls the line up, once', () => {
    const water = make();
    sweep(water, (t) => [0.9, 0.7 - 2 * t], 0.7);
    expect(water.snapshot().stats.exits).toBe(1);
  });

  it('skimming along the line is not a splash: the view carries no drops', () => {
    const water = make();
    sweep(water, (t) => [-1.2 + 3 * t, WL], 0.8);
    const view = water.view();
    expect(Object.keys(view).sort()).toEqual(['dims', 'field', 'fieldVersion', 'on', 'surf', 'surfVersion']);
    expect(water.snapshot().drops).toBeUndefined();
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

  it('at the surface: a kick and foam send waves out, and nothing is thrown', () => {
    const water = press(0.9, WL + 0.01);
    expect(water.snapshot().stats.presses).toBe(1);
    expect(surfaceEnergy(water)).toBeGreaterThan(0);
    expect(foam(water).some((f) => f > 0.1)).toBe(true);
    expect(fieldEnergy(water)).toBe(0);
    sweep(water, () => [0.9, WL + 0.01], 0.5);
    const { h } = water.snapshot().surface;
    expect(Math.max(...h.map(Math.abs))).toBeGreaterThan(0.002); // real waves, a pixel or more
  });

  it('in the air: nothing happens', () => {
    const water = press(0.9, WL - 0.2);
    expect(water.snapshot().stats.presses).toBe(0);
    expect(surfaceEnergy(water)).toBe(0);
    expect(fieldEnergy(water)).toBe(0);
    expect(water.view().on).toBe(false);
  });

  it('under water: a ring in the field and a calm surface', () => {
    const water = press(0.9, WL + 0.4);
    expect(water.snapshot().stats.presses).toBe(1);
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

describe('the water is the same everywhere across the band', () => {
  // 0.9375 is exactly 150 surface columns and 60 field cells at 1000 x 320, so a stroke at x = 0.9375
  // and the same stroke at x = 0 (in the middle of the iceberg) sit on identical grid phases.
  const SHIFT = 0.9375;
  const SURF_SHIFT = 150;
  const FIELD_SHIFT = 60;

  const scenarios = {
    'a plunge through the line': (x) => (w) => sweep(w, (t) => [x, 0.1 + 2 * Math.min(t, 0.4)], 0.6),
    'a press at the surface': (x) => (w) => {
      w.point(x, WL + 0.01, true);
      w.press(x, WL + 0.01);
      sweep(w, () => [x, WL + 0.01], 0.6, { drag: true });
    },
    'a press under water': (x) => (w) => {
      w.point(x, 0.55, true);
      w.press(x, 0.55);
      sweep(w, () => [x, 0.55], 0.6, { drag: true });
    },
    'a circle under water': (x) => (w) => sweep(w, (t) => [x + 0.1 * Math.cos(6 * t), 0.55 + 0.1 * Math.sin(6 * t)], 0.6),
    'coming out of the water': (x) => (w) => sweep(w, (t) => [x, 0.8 - 2 * Math.min(t, 0.5)], 0.6),
  };

  describe.each(Object.entries(scenarios))('%s', (name, build) => {
    const over = make();
    const open = make();
    build(0)(over); // over the iceberg
    build(SHIFT)(open); // over open water

    it('does the same to the cursor bookkeeping: same crossings, deposits and presses', () => {
      const a = over.snapshot().stats;
      const b = open.snapshot().stats;
      for (const key of ['plunges', 'exits', 'presses']) expect(a[key]).toBe(b[key]);
      expect(a.trench).toBeCloseTo(b.trench, 9);
      expect(a.stir).toBeCloseTo(b.stir, 9);
    });

    it('leaves the same energy in the surface and in the field', () => {
      const a = over.energy();
      const b = open.energy();
      expect(a.surface + a.field).toBeGreaterThan(0);
      // equal to a few parts in a million: the pulses have just begun to feel the nearer band edge
      for (const key of ['surface', 'field']) expect(Math.abs(a[key] - b[key])).toBeLessThanOrEqual(1e-5 * Math.max(a[key], b[key]));
    });

    it('and the same waves and ripples, shifted by the offset', () => {
      const sa = over.snapshot();
      const sb = open.snapshot();
      const { cols, nx, ny, aspect } = over.dims;
      const midCol = Math.round(aspect / 2 / (aspect / cols) - 0.5);
      for (let d = -60; d <= 60; d++) expect(sb.surface.h[midCol + SURF_SHIFT + d]).toBeCloseTo(sa.surface.h[midCol + d], 8);
      const midCell = Math.round(aspect / 2 / (aspect / nx) - 0.5);
      let seen = 0;
      for (let j = 0; j < ny; j++) {
        for (let d = -20; d <= 20; d++) {
          const here = sa.field.u[j * nx + midCell + d];
          expect(sb.field.u[j * nx + midCell + FIELD_SHIFT + d]).toBeCloseTo(here, 8);
          seen = Math.max(seen, Math.abs(here));
        }
      }
      if (name.includes('under water') || name.includes('plunge')) expect(seen).toBeGreaterThan(1e-4);
    });
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
    const versions = [a.surfVersion, a.fieldVersion];
    const b = water.view();
    expect([b.surfVersion, b.fieldVersion]).toEqual(versions);
    expect([...b.surf]).toEqual([...aSurf]);
    water.advance(FRAME);
    const c = water.view();
    expect(c.surfVersion).toBeGreaterThan(versions[0]);
    expect(c.fieldVersion).toBeGreaterThan(versions[1]);
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
    expect(water.dims.aspect).toBe((2 * W) / H);
  });

  it('ignores a zero, negative or junk size', () => {
    const water = make();
    const dims = water.dims;
    for (const [w, h] of [[0, 0], [0, 100], [100, 0], [-5, 100], [NaN, 100], [100, NaN], [Infinity, 1]]) water.resize(w, h);
    expect(water.dims).toBe(dims);
  });

  it('caps the grids at the GPU texture size', () => {
    const water = createWater({ maxTexture: 128 });
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
    const view = water.view();
    expect([...view.surf, ...view.field].every((b) => b >= 0 && b <= 255)).toBe(true);
  });
});

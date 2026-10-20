import { describe, expect, it } from 'vitest';
import { WL } from '../iceberg.js';
import { FIELD, SIM } from './constants.js';
import { createField, fieldDims, fieldStability, psi } from './field.js';
import { applyCursor } from './interact.js';
import { createSurface } from './surface.js';

const A = 3.125;
const STEPS_PER_SECOND = Math.round(1 / SIM.dt);
const ASPECTS = [1, 1.5, 3, 6, 8, 12];

const run = (f, steps) => {
  for (let i = 0; i < steps; i++) f.step();
};

describe('grid and stability', () => {
  it('about 24k cells, cells never finer than 1/64, columns capped at 512 and at the GPU limit', () => {
    for (const aspect of ASPECTS) {
      const d = fieldDims(aspect);
      expect(d.nx * d.ny).toBeLessThanOrEqual(FIELD.cells * 1.05);
      expect(d.nx).toBeLessThanOrEqual(FIELD.nxMax);
      expect(d.cell).toBeGreaterThanOrEqual(FIELD.cellMin - 1e-12);
      expect(d.nx * d.dx).toBeCloseTo(aspect, 12);
      expect(d.ny * d.dy).toBeCloseTo(FIELD.depth, 12);
    }
    expect(fieldDims(12, 100).nx).toBe(100);
    expect(fieldDims(3, 30).ny).toBeLessThanOrEqual(30);
  });

  it('keeps c dt sqrt(1/dx^2 + 1/dy^2) at or under 0.5 for every aspect ratio (the limit is 1)', () => {
    for (const aspect of ASPECTS) expect(fieldStability(fieldDims(aspect))).toBeLessThanOrEqual(0.5);
    expect(fieldStability(fieldDims(A))).toBeCloseTo(0.3, 1);
  });
});

describe('the stir kernel', () => {
  it('psi sums to zero over the grid: stirring adds no net velocity', () => {
    const f = createField(A);
    f.addImpulse(0.8, WL + 0.3, 1, 0.025);
    const { v } = f.snapshot();
    const sum = v.reduce((a, b) => a + b, 0);
    const abs = v.reduce((a, b) => a + Math.abs(b), 0);
    expect(abs).toBeGreaterThan(1);
    expect(Math.abs(sum) / abs).toBeLessThan(1e-4);
  });

  it('is a ring: positive in the middle, negative around it', () => {
    expect(psi(0, 0.03)).toBe(1);
    expect(psi(0.03, 0.03)).toBeCloseTo(0, 12);
    expect(psi(0.05, 0.03)).toBeLessThan(0);
  });
});

describe('energy', () => {
  it('decays (the maximum over each window drops), and goes to exactly 0 and inactive', () => {
    const f = createField(A);
    f.addImpulse(1.0, WL + 0.3, 2, 0.03); // open water, right of the iceberg
    const window = 40;
    const maxima = [];
    for (let w = 0; w < (6 * STEPS_PER_SECOND) / window; w++) {
      let m = 0;
      for (let i = 0; i < window; i++) {
        f.step();
        m = Math.max(m, f.energy());
      }
      maxima.push(m);
    }
    for (let i = 1; i < maxima.length; i++) expect(maxima[i]).toBeLessThan(maxima[i - 1]);
    run(f, 20 * STEPS_PER_SECOND);
    expect(f.active).toBe(false);
    expect(f.snapshot().u.every((x) => x === 0)).toBe(true);
    expect(f.snapshot().v.every((x) => x === 0)).toBe(true);
    expect(f.energy()).toBe(0);
  });

  it('does not let a checkerboard grow', () => {
    const f = createField(A);
    const { nx, ny } = f.dims;
    const u = Array.from({ length: nx * ny }, (_, k) => (((k % nx) + Math.floor(k / nx)) % 2 ? 1 : -1) * 1e-3);
    f.load({ u });
    const E0 = f.energy();
    let peak = 0;
    let eMax = 0;
    for (let i = 0; i < 1000; i++) {
      f.step();
      peak = Math.max(peak, ...f.snapshot().u.map(Math.abs));
      eMax = Math.max(eMax, f.energy());
    }
    // the free surface at the top mixes modes, so a cell can swing a bit past where it started, but the energy never grows
    expect(peak).toBeLessThanOrEqual(1e-3 * 3);
    expect(eMax).toBeLessThanOrEqual(E0 * 1.5); // semi-implicit Euler: the energy ripples by omega dt / 2 per period, but is bounded
    expect(f.energy()).toBeLessThanOrEqual(E0);
  });

  it('stays finite under heavy random stirring at the largest step the sim ever takes', () => {
    const f = createField(A);
    let s = 3;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 3000; i++) {
      f.addImpulse((rand() - 0.5) * A, WL + rand() * 0.78, (rand() - 0.5) * 40, 0.03);
      f.step();
    }
    for (const x of f.snapshot().u) expect(Number.isFinite(x)).toBe(true);
  });

  it('radiates: the ring spreads outward at about c', () => {
    const f = createField(A);
    const sx = 1.0; // open water, right of the iceberg
    f.addImpulse(sx, WL + 0.4, 2, 0.03);
    run(f, Math.round(0.4 * STEPS_PER_SECOND)); // 0.4 s at c = 0.4 is about 0.16 band heights out
    const { u } = f.snapshot();
    const { nx, dx } = f.dims;
    const row = Math.round(0.4 / f.dims.dy);
    let peak = 0;
    let at = 0;
    for (let i = Math.floor((sx + A / 2) / dx); i < nx; i++) {
      if (Math.abs(u[row * nx + i]) > peak) {
        peak = Math.abs(u[row * nx + i]);
        at = -A / 2 + (i + 0.5) * dx - sx;
      }
    }
    expect(at).toBeGreaterThan(0.08);
    expect(at).toBeLessThan(0.3);
  });
});

describe('cursor strokes (sampling and beading)', () => {
  const ctxFor = () => {
    const surface = createSurface(A);
    const field = createField(A);
    return { surface, field, time: 0, coolPlunge: 0, coolExit: 0, lastD: null, stats: { trench: 0, stir: 0, plunges: 0, exits: 0, presses: 0 } };
  };
  const seg = (x0, y0, x1, y1) => ({ active: true, jumped: false, x0, y0, x1, y1, dragMix: 0 });

  it('one long segment stirs the same as ten short ones (within 2%)', () => {
    const y = WL + 0.3;
    const x0 = 0.85; // open water
    const whole = ctxFor();
    applyCursor(whole, seg(x0, y, x0 + 0.1, y)); // 0.1 in a step: far faster than real, so it takes many samples
    const pieces = ctxFor();
    for (let i = 0; i < 10; i++) applyCursor(pieces, seg(x0 + i * 0.01, y, x0 + (i + 1) * 0.01, y));
    // both are fast enough to be at full strength, so the fields can be compared directly
    const a = whole.field.snapshot().v;
    const b = pieces.field.snapshot().v;
    const ra = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    const rb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
    expect(rb).toBeGreaterThan(0);
    expect(ra / rb).toBeGreaterThan(0.98);
    expect(ra / rb).toBeLessThan(1.02);
    const diff = Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
    expect(diff / rb).toBeLessThan(0.02);
  });

  it('a straight stroke is uniform along its centreline (no beads), CV under 5%', () => {
    const f = ctxFor();
    const { dy, nx, dx } = f.field.dims;
    const row = Math.round(0.7 / dy); // below the iceberg's keel, so the stroke runs through open water
    const y = WL + (row + 0.5) * dy; // exactly on a row of cells, so there is no vertical phase to see
    const step = 1.2 / 120; // the cursor moving at 1.2 band heights per second
    for (let x = -1; x < 1; x += step) applyCursor(f, seg(x, y, x + step, y));
    const { v } = f.field.snapshot();
    const along = [];
    for (let i = 0; i < nx; i++) {
      const x = -A / 2 + (i + 0.5) * dx;
      if (x > -0.8 && x < 0.8) along.push(v[row * nx + i]);
    }
    const mean = along.reduce((a, b) => a + b, 0) / along.length;
    const sd = Math.sqrt(along.reduce((a, b) => a + (b - mean) ** 2, 0) / along.length);
    expect(mean).toBeGreaterThan(0.1);
    expect(sd / mean).toBeLessThan(0.05);
  });
});

describe('what the shader reads', () => {
  it('encodes ripple height and gradient, with exactly 128 at rest', () => {
    const f = createField(A);
    const { nx, ny } = f.dims;
    const out = new Uint8Array(nx * ny * 4);
    f.encode(out);
    for (let k = 0; k < nx * ny; k++) expect([...out.slice(4 * k, 4 * k + 4)]).toEqual([128, 128, 128, 0]);
    f.addImpulse(0.9, WL + 0.3, 0.5, 0.03);
    run(f, 20);
    f.encode(out);
    expect(out.some((b, i) => i % 4 < 3 && b !== 128)).toBe(true);
  });
});

describe('the iceberg is not in the field', () => {
  it('a ring under the iceberg is the same ring as in open water, shifted (60 cells = 0.9375)', () => {
    const shift = 60;
    const a = createField(A);
    const b = createField(A);
    const { nx, ny } = a.dims;
    a.addImpulse(0.9375, WL + 0.3, 3, 0.03);
    b.addImpulse(0, WL + 0.3, 3, 0.03);
    run(a, 60);
    run(b, 60); // 0.5 s: the rings are 0.2 out, nowhere near a side wall
    const ua = a.snapshot().u;
    const ub = b.snapshot().u;
    const mid = Math.round(A / 2 / a.dims.dx - 0.5);
    let peak = 0;
    for (let j = 0; j < ny; j++) {
      for (let d = -25; d <= 25; d++) {
        expect(ua[j * nx + mid + shift + d]).toBeCloseTo(ub[j * nx + mid + d], 10);
        peak = Math.max(peak, Math.abs(ub[j * nx + mid + d]));
      }
    }
    expect(peak).toBeGreaterThan(1e-3); // and it was a real ring, not two empty windows
  });

  it('stirring anywhere moves the water, including in the middle of the iceberg', () => {
    const f = createField(A);
    f.addImpulse(0, WL + 0.3, 3, 0.03);
    expect(f.snapshot().v.some((x) => x !== 0)).toBe(true);
    run(f, 20);
    expect(f.energy()).toBeGreaterThan(0);
  });

  it('encodes the same way everywhere: nothing is held at rest under the ice', () => {
    const f = createField(A);
    const { nx, ny } = f.dims;
    const u = Array.from({ length: nx * ny }, (_, k) => 0.01 * Math.sin(k * 0.37));
    f.load({ u });
    const out = new Uint8Array(nx * ny * 4);
    f.encode(out);
    const centre = 30 * nx + Math.round(A / 2 / f.dims.dx - 0.5); // inside the hull
    expect(out.slice(4 * centre, 4 * centre + 3).some((b) => b !== 128)).toBe(true);
  });
});

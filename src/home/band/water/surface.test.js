import { describe, expect, it } from 'vitest';
import { SIM, SURFACE } from './constants.js';
import { ENC, decodeSigned } from './pack.js';
import { createSurface, phaseSpeed, surfaceCols, surfaceStability } from './surface.js';

const A = 3.125; // a 1000 x 320 band
const STEPS_PER_SECOND = Math.round(1 / SIM.dt);

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** The surface with `amount` of velocity kicked in at x. */
function kicked(aspect, x, amount = 0.5, width = 0.05) {
  const s = createSurface(aspect);
  s.addVelocity(x, width, amount);
  return s;
}

const run = (s, steps) => {
  for (let i = 0; i < steps; i++) s.step();
};

describe('columns and stability', () => {
  it('N = clamp(ceil(A * 160), 64, 1024), and never wider than the GPU texture', () => {
    expect(surfaceCols(1)).toBe(160);
    expect(surfaceCols(3.125)).toBe(500);
    expect(surfaceCols(0.1)).toBe(64);
    expect(surfaceCols(20)).toBe(1024);
    expect(surfaceCols(3.125, 256)).toBe(256);
  });

  it('keeps omega * dt well under the explicit limit for every aspect ratio', () => {
    for (const aspect of [1, 1.5, 3, 6, 8, 12]) {
      const { dims } = createSurface(aspect);
      expect(surfaceStability(dims).omegaDt).toBeLessThan(0.6);
    }
  });

  it('uses the whole aspect: n columns of dx cover the band', () => {
    const { dims } = createSurface(A);
    expect(dims.n * dims.dx).toBeCloseTo(A, 12);
  });
});

describe('energy', () => {
  it('decays (the maximum over each window drops), and E(10s) is below 1e-4 of the start', () => {
    const s = kicked(A, 0.9);
    const E0 = s.energy();
    expect(E0).toBeGreaterThan(0);
    const window = 40;
    const maxima = [];
    for (let w = 0; w < (10 * STEPS_PER_SECOND) / window; w++) {
      let m = 0;
      for (let i = 0; i < window; i++) {
        s.step();
        m = Math.max(m, s.energy());
      }
      maxima.push(m);
    }
    for (let i = 1; i < maxima.length; i++) expect(maxima[i]).toBeLessThan(maxima[i - 1]);
    // damping acts on the velocity only, so energy falls as e^(-damp t): 3e-4 after 8s, 5e-5 after 10s
    expect(s.energy()).toBeLessThan(1e-4 * E0);
  });

  it('comes to exactly 0 and goes inactive once everything has stopped', () => {
    const s = kicked(A, -0.9);
    run(s, 25 * STEPS_PER_SECOND);
    expect(s.active).toBe(false);
    const snap = s.snapshot();
    for (const key of ['h', 'v', 'foam']) expect(snap[key].every((x) => x === 0)).toBe(true);
    expect(s.energy()).toBe(0);
  });

  it('a step on an inactive surface does nothing', () => {
    const s = createSurface(A);
    expect(s.active).toBe(false);
    run(s, 100);
    expect(s.snapshot().h.every((x) => x === 0)).toBe(true);
  });
});

describe('stability under abuse', () => {
  it('stays finite and inside its clamps under 3600 steps of random forcing', () => {
    const s = createSurface(A);
    const rand = rng(11);
    for (let i = 0; i < 600 * SIM.maxSteps; i++) {
      s.addVelocity((rand() - 0.5) * A, 0.01 + 0.05 * rand(), (rand() - 0.5) * 20);
      s.addPressure((rand() - 0.5) * A, 0.02, (rand() - 0.5) * 2);
      s.addFoam((rand() - 0.5) * A, 0.03, rand());
      s.step();
    }
    const { h, v, foam } = s.snapshot();
    for (const x of [...h, ...v, ...foam]) expect(Number.isFinite(x)).toBe(true);
    expect(Math.max(...h.map(Math.abs))).toBeLessThanOrEqual(SURFACE.hMax + 1e-12);
    expect(Math.max(...v.map(Math.abs))).toBeLessThanOrEqual(SURFACE.vMax + 1e-12);
  });

  it('does not let a checkerboard (the grid\'s fastest mode) grow', () => {
    const s = createSurface(A);
    const n = s.dims.n;
    const h = Array.from({ length: n }, (_, i) => (i % 2 ? 1 : -1) * 1e-3);
    s.load({ h });
    const E0 = s.energy();
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      s.step();
      peak = Math.max(peak, ...s.snapshot().h.map(Math.abs));
    }
    expect(peak).toBeLessThanOrEqual(1e-3 * 1.001);
    expect(s.energy()).toBeLessThanOrEqual(E0);
  });
});

describe('one basin across the band', () => {
  it('is a single run of columns with walls at the band edges (the iceberg is not in the water)', () => {
    const s = createSurface(A);
    const { n } = s.dims;
    s.addVelocity(0, 0.03, 1); // right under the iceberg: it is water like any other
    run(s, 10);
    expect(Math.max(...s.snapshot().h.map(Math.abs))).toBeGreaterThan(1e-5);
    s.addVelocity(-A / 2 + 0.01, 0.03, 1);
    s.addVelocity(A / 2 - 0.01, 0.03, 1); // the first and last columns take kicks too
    expect(s.snapshot().v[0]).toBeGreaterThan(0.9);
    expect(s.snapshot().v[n - 1]).toBeGreaterThan(0.9);
  });

  it('a kick anywhere reaches everywhere: waves travel straight across the columns under the iceberg and on', () => {
    const s = kicked(A, 0.9, 1);
    run(s, 4 * STEPS_PER_SECOND);
    const { h } = s.snapshot();
    const near = (x0, x1) => Math.max(...h.filter((_, j) => { const x = -A / 2 + (j + 0.5) * s.dims.dx; return x > x0 && x < x1; }).map(Math.abs));
    expect(near(-0.2, 0.24)).toBeGreaterThan(1e-4); // under the tip
    expect(near(-1.5, -0.8)).toBeGreaterThan(1e-4); // and the far side
  });

  it('is the same wave over the iceberg as over open water: a kick at x = 0 is a kick at x = 0.9375, shifted', () => {
    const shift = 150; // 0.9375 is exactly 150 columns here, so the two grids line up
    const a = kicked(A, 0.9375, 0.7, 0.04);
    const b = kicked(A, 0, 0.7, 0.04);
    run(a, 48);
    run(b, 48); // 0.4 s: the waves are 0.3 out and nothing has reached a wall
    const ha = a.snapshot().h;
    const hb = b.snapshot().h;
    const mid = Math.round(A / 2 / a.dims.dx - 0.5); // the column at x = 0
    expect(mid).toBeGreaterThan(100);
    for (let d = -60; d <= 60; d++) expect(ha[mid + shift + d]).toBeCloseTo(hb[mid + d], 9); // the same, up to rounding
  });

  it('conserves water: the mean height stays 0', () => {
    const s = createSurface(A);
    const rand = rng(5);
    for (let i = 0; i < 1500; i++) {
      if (i % 20 === 0) {
        s.addVelocity((rand() - 0.5) * A, 0.02 + 0.03 * rand(), (rand() - 0.5) * 2);
        s.addPressure((rand() - 0.5) * A, 0.03, rand() * 0.01);
      }
      s.step();
    }
    const sum = s.snapshot().h.reduce((acc, x) => acc + x, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-12);
  });

  it('reflects waves at the band edges: a pulse comes back from the wall', () => {
    const s = createSurface(A);
    s.addVelocity(-A / 2 + 0.4, 0.03, 0.5);
    run(s, Math.round(1.2 * STEPS_PER_SECOND)); // the left-going half reaches the wall (0.4 away) and returns
    const { h } = s.snapshot();
    expect(Math.max(...h.slice(0, 20).map(Math.abs))).toBeGreaterThan(1e-5); // some water at the wall
    expect(s.energy()).toBeGreaterThan(0);
  });
});

describe('dispersion', () => {
  /** Frequency of the standing mode m across the whole basin, from the zero crossings of one probe column. */
  function measure(m) {
    const s = createSurface(A);
    const { n, dx } = s.dims;
    const h = new Array(n).fill(0);
    for (let i = 0; i < n; i++) h[i] = 1e-3 * Math.cos((m * Math.PI * (i + 0.5)) / n);
    s.load({ h });
    const probe = Math.floor(n * 0.05);
    const crossings = [];
    let prev = s.snapshot().h[probe];
    for (let i = 1; i <= 3 * STEPS_PER_SECOND; i++) {
      s.step();
      const cur = s.snapshot().h[probe];
      if (prev * cur < 0) crossings.push((i - 1 + prev / (prev - cur)) * SIM.dt);
      prev = cur;
    }
    const omega = (Math.PI * (crossings.length - 1)) / (crossings.at(-1) - crossings[0]);
    return { omega, k: (m * Math.PI) / (n * dx) };
  }

  it('matches c k / sqrt(1 + beta k^2) within 5% for a long wave and a short one', () => {
    for (const m of [25, 80, 160]) {
      const { omega, k } = measure(m);
      const expected = Math.sqrt((k * phaseSpeed(k)) ** 2 - (SURFACE.damp / 2) ** 2); // the damped frequency
      expect(Math.abs(omega - expected) / expected).toBeLessThan(0.05);
    }
  });

  it('is dispersive: short waves are slower than long ones', () => {
    const long = measure(25);
    const short = measure(160);
    expect(short.omega / short.k).toBeLessThan(0.85 * (long.omega / long.k));
  });
});

describe('what the shader reads', () => {
  it('interpolates eta between columns', () => {
    const s = createSurface(A);
    const { n, dx } = s.dims;
    const h = new Array(n).fill(0);
    h[100] = 0.01;
    h[101] = 0.03;
    s.load({ h });
    const x = (j) => -A / 2 + (j + 0.5) * dx;
    expect(s.eta(x(100))).toBeCloseTo(0.01, 12);
    expect(s.eta((x(100) + x(101)) / 2)).toBeCloseTo(0.02, 12);
    expect(s.eta(-10)).toBe(s.eta(-A / 2)); // clamped at the edges
  });

  it('encodes eta, slope and foam into one texel per column, with 0 exactly at rest', () => {
    const s = createSurface(A);
    const { n, dx } = s.dims;
    const rest = new Uint8Array(n * 4);
    s.encode(rest);
    for (let j = 0; j < n; j++) expect([...rest.slice(4 * j, 4 * j + 4)]).toEqual([128, 128, 128, 0]);

    const h = new Array(n).fill(0);
    for (let j = 100; j < 110; j++) h[j] = SURFACE.etaScale * ((j - 100) / 10 - 0.45);
    s.load({ h });
    s.addFoam(-A / 2 + 105.5 * dx, 0.02, 0.5);
    const out = new Uint8Array(n * 4);
    s.encode(out);
    expect(decodeSigned(out[4 * 109])).toBeCloseTo(h[109] / SURFACE.etaScale, 1);
    expect(decodeSigned(out[4 * 105 + 1]) * SURFACE.slopeScale).toBeCloseTo((h[106] - h[104]) / (2 * dx), 1);
    expect(out[4 * 105 + 3]).toBeGreaterThan(100);
    expect(out[4 * 105 + 2]).toBe(ENC.zero);
  });

  it('draws every column the same way, under the iceberg or not: eta is encoded as it is, with no taper', () => {
    const s = createSurface(A);
    const { n, dx } = s.dims;
    const h = new Array(n).fill(0.02);
    s.load({ h });
    const out = new Uint8Array(n * 4);
    s.encode(out);
    const under = Math.round(A / 2 / dx - 0.5); // x = 0, in the middle of the tip
    expect(out[4 * under]).toBe(out[4 * 5]);
    expect(decodeSigned(out[4 * under]) * SURFACE.etaScale).toBeCloseTo(0.02, 3);
  });
});

import { describe, expect, it } from 'vitest';
import { WL } from '../iceberg.js';
import { SIM, SPLASH } from './constants.js';
import { createSplash, dropCandidates, pickDropN, radiusOfSlot } from './splash.js';

const HALF_W = 1.5;

/** A flat sea at the waterline; collects landings. */
function sea() {
  const landings = [];
  return {
    landings,
    env: {
      halfW: HALF_W,
      yLine: () => WL,
      inside: () => false,
      onLand: (info) => landings.push({ ...info }),
    },
  };
}

const fly = (splash, env, seconds) => {
  for (let i = 0; i < Math.round(seconds / SIM.dt); i++) splash.step(env);
};

describe('pool size', () => {
  it('picks 32, 16 or 8 drops from MAX_FRAGMENT_UNIFORM_VECTORS at its boundaries', () => {
    expect([0, 16, 31].map(pickDropN)).toEqual([8, 8, 8]);
    expect([32, 63].map(pickDropN)).toEqual([16, 16]);
    expect([64, 128, 1024].map(pickDropN)).toEqual([32, 32, 32]);
    expect(pickDropN(undefined)).toBe(8);
  });

  it('tries the picked size, then 8, then none, without repeating itself', () => {
    expect(dropCandidates(256)).toEqual([32, 8, 0]);
    expect(dropCandidates(40)).toEqual([16, 8, 0]);
    expect(dropCandidates(16)).toEqual([8, 0]);
  });

  it('gives every slot a radius between RMIN and RMAX, golden-ratio spaced (the shader uses the same formula)', () => {
    expect(radiusOfSlot(0)).toBe(SPLASH.rMin);
    expect(radiusOfSlot(1)).toBeCloseTo(SPLASH.rMin + (SPLASH.rMax - SPLASH.rMin) * 0.618034, 12);
    for (let i = 0; i < 64; i++) {
      expect(radiusOfSlot(i)).toBeGreaterThanOrEqual(SPLASH.rMin);
      expect(radiusOfSlot(i)).toBeLessThanOrEqual(SPLASH.rMax);
    }
  });
});

describe('flight', () => {
  /** Where and when a drop thrown from (x0, y0) with (vx, vy) meets the line (y grows downward), in continuous time with air drag. */
  function analytic(x0, y0, vx, vy) {
    const k = SPLASH.drag;
    const g = SPLASH.g;
    const y = (t) => y0 + ((vy - g / k) * (1 - Math.exp(-k * t))) / k + (g * t) / k;
    let lo = 0.01;
    let hi = 5;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (y(mid) < WL) lo = mid;
      else hi = mid;
    }
    const t = (lo + hi) / 2;
    return { t, x: x0 + (vx * (1 - Math.exp(-k * t))) / k };
  }

  it('lands where and when ballistic flight with drag says it should (within 3%)', () => {
    for (const [vx, vy] of [[0.5, -1.2], [-0.8, -1.5], [0.1, -0.6]]) {
      const { env, landings } = sea();
      const splash = createSplash(8);
      const y0 = WL - 0.003;
      splash.spawn(0.3, y0, vx, vy);
      let steps = 0;
      while (!landings.length && steps < 1000) {
        splash.step(env);
        steps++;
      }
      expect(landings).toHaveLength(1);
      const want = analytic(0.3, y0, vx, vy);
      expect(Math.abs(steps * SIM.dt - want.t) / want.t).toBeLessThan(0.03);
      expect(Math.abs(landings[0].x - want.x)).toBeLessThan(0.03 * Math.max(Math.abs(want.x - 0.3), 0.05) + 0.003);
      expect(landings[0].y).toBeCloseTo(WL, 2);
      expect(landings[0].vy).toBeGreaterThan(0);
      expect(splash.alive).toBe(0);
    }
  });

  it('keeps the apex of a full-speed throw in the air above the line', () => {
    const { env, landings } = sea();
    const splash = createSplash(4);
    splash.spawn(0, WL - 0.003, 0, -SPLASH.vThrow);
    let top = Infinity;
    while (!landings.length) {
      splash.step(env);
      top = Math.min(top, splash.snapshot()[0]?.y ?? top);
    }
    expect(WL - top).toBeGreaterThan(0.15);
    expect(WL - top).toBeLessThan(0.3);
  });

  it('lands on a wave that rises under it, at the line where it is (not the rest line)', () => {
    const { landings } = sea();
    const splash = createSplash(2);
    const high = { halfW: HALF_W, yLine: () => WL - 0.02, inside: () => false, onLand: (i) => landings.push(i) };
    splash.spawn(0, WL - 0.03, 0, 0.2);
    for (let i = 0; i < 60 && !landings.length; i++) splash.step(high);
    expect(landings).toHaveLength(1);
    expect(landings[0].y).toBeCloseTo(WL - 0.02, 2);
  });

  it('every drop eventually lands or leaves: nothing lives past its 3 seconds', () => {
    const { env, landings } = sea();
    const splash = createSplash(8);
    for (let i = 0; i < 8; i++) splash.spawn(0, WL - 0.003, (i - 4) * 0.2, -1.5 * (0.5 + 0.07 * i));
    fly(splash, env, 3);
    expect(splash.alive).toBe(0);
    expect(landings).toHaveLength(8);
  });
});

describe('the pool', () => {
  it('is capped: a full pool skips the spawn and never recycles a drop in the air', () => {
    const splash = createSplash(4);
    const slots = [0, 1, 2, 3].map((i) => splash.spawn(i * 0.1, WL - 0.1, 0, 0));
    expect(slots).toEqual([0, 1, 2, 3]);
    const before = JSON.stringify(splash.snapshot());
    expect(splash.spawn(9, WL - 0.1, 0, 0)).toBe(-1);
    expect(splash.spawnLargest(9, WL - 0.1, 0, 0)).toBe(-1);
    expect(splash.alive).toBe(4);
    expect(JSON.stringify(splash.snapshot())).toBe(before);
  });

  it('a pool of 0 never spawns', () => {
    const splash = createSplash(0);
    expect(splash.spawn(0, 0, 0, 0)).toBe(-1);
    expect(splash.alive).toBe(0);
  });

  it('reuses a slot once its drop has landed', () => {
    const { env } = sea();
    const splash = createSplash(1);
    splash.spawn(0, WL - 0.003, 0, 0.5);
    fly(splash, env, 0.5);
    expect(splash.alive).toBe(0);
    expect(splash.spawn(0, WL - 0.1, 0, 0)).toBe(0);
  });

  it('spawnLargest picks the free slot with the biggest drop', () => {
    const splash = createSplash(8);
    for (let i = 0; i < 6; i++) splash.spawn(i, WL - 0.1, 0, 0); // slots 0-5 are taken, 6 and 7 are free
    const slot = splash.spawnLargest(0, WL - 0.1, 0, 0);
    expect(slot).toBe(radiusOfSlot(6) > radiusOfSlot(7) ? 6 : 7);
    expect(slot).toBe(6); // fract(6 * 0.618) = 0.71 beats fract(7 * 0.618) = 0.33
  });

  it('kills drops that leave the band or fall past the floor, without a splash', () => {
    const landings = [];
    const deep = { halfW: HALF_W, yLine: () => 10, inside: () => false, onLand: (i) => landings.push(i) }; // water far below
    const splash = createSplash(4);
    splash.spawn(HALF_W + SPLASH.killX - 0.001, 0.1, 5, 0); // out through the side
    splash.spawn(0, 0.5, 0, 0); // falls past the band floor
    fly(splash, deep, 0.05);
    expect(splash.snapshot().some((d) => d.x > HALF_W)).toBe(false);
    fly(splash, deep, 1.5);
    expect(splash.alive).toBe(0);
    expect(landings).toHaveLength(0);
  });
});

describe('the iceberg', () => {
  it('absorbs a drop that flies into it: it vanishes with no splash', () => {
    const landings = [];
    const env = {
      halfW: HALF_W,
      yLine: () => WL,
      inside: (x, y) => x > -0.2 && x < 0.2 && y > WL - 0.1,
      onLand: (i) => landings.push(i),
    };
    const splash = createSplash(4);
    splash.spawn(0, WL - 0.3, 0, 0.5);
    fly(splash, env, 0.6);
    expect(splash.alive).toBe(0);
    expect(landings).toHaveLength(0);
  });

  it('uses the real polygon when the sim hands it over: a drop falling onto the tip is absorbed', async () => {
    const { insideBerg } = await import('../iceberg.js');
    const landings = [];
    const env = { halfW: HALF_W, yLine: () => WL, inside: insideBerg, onLand: (i) => landings.push(i) };
    const splash = createSplash(2);
    splash.spawn(0.0, WL - 0.25, 0, 0.3);
    fly(splash, env, 1);
    expect(splash.alive).toBe(0);
    expect(landings).toHaveLength(0);
  });
});

describe('fill (the shader uniforms)', () => {
  it('writes (x, y, vx, vy) per slot, parks unused slots at y = -10, and gives an inverted box when empty', () => {
    const splash = createSplash(4);
    const out = new Float32Array(16);
    const box = new Float32Array(4);
    splash.fill(out, box);
    for (let i = 0; i < 4; i++) expect(out[4 * i + 1]).toBe(SPLASH.dead);
    expect(box[0]).toBeGreaterThan(box[2]);
    expect(box[1]).toBeGreaterThan(box[3]);
    splash.spawn(0.4, 0.1, 1, -2);
    splash.fill(out, box);
    expect([...out.slice(0, 4)].map((x) => +x.toFixed(4))).toEqual([0.4, 0.1, 1, -2]);
    expect(out[5]).toBe(SPLASH.dead);
  });

  it('runs positions ahead by the leftover time, and the box holds every drop and its streak', () => {
    const splash = createSplash(4);
    const out = new Float32Array(16);
    const box = new Float32Array(4);
    splash.spawn(0.4, 0.1, 1, -2);
    splash.spawn(-0.6, 0.15, -1, 0);
    splash.fill(out, box, 0.004);
    expect(out[0]).toBeCloseTo(0.4 + 1 * 0.004, 6);
    expect(out[1]).toBeCloseTo(0.1 - 2 * 0.004, 6);
    for (const i of [0, 1]) {
      const x = out[4 * i];
      const y = out[4 * i + 1];
      const tailX = x - out[4 * i + 2] * SPLASH.streak;
      const tailY = y - out[4 * i + 3] * SPLASH.streak;
      for (const [px, py] of [[x, y], [tailX, tailY]]) {
        expect(px - SPLASH.rMax).toBeGreaterThanOrEqual(box[0] - 1e-6);
        expect(px + SPLASH.rMax).toBeLessThanOrEqual(box[2] + 1e-6);
        expect(py - SPLASH.rMax).toBeGreaterThanOrEqual(box[1] - 1e-6);
        expect(py + SPLASH.rMax).toBeLessThanOrEqual(box[3] + 1e-6);
      }
    }
  });
});

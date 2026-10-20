import { describe, expect, it } from 'vitest';
import { HEAD, createHead, smoothDamp, speedStrength } from './head.js';

const FRAME = 1 / 60;
const DT = 1 / 120;

/** Deterministic pseudo-random numbers, so a failing run can be reproduced. */
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('speedStrength', () => {
  it('is exactly 0 for a still pointer and caps at the hover and press strengths at full speed', () => {
    expect(speedStrength(0)).toBe(0);
    expect(speedStrength(HEAD.deadLo)).toBe(0);
    expect(speedStrength(5)).toBeCloseTo(HEAD.hover, 12);
    expect(speedStrength(5, 1)).toBeCloseTo(HEAD.drag, 12);
  });
});

describe('smoothDamp', () => {
  it('never overshoots, from rest or from any velocity (including toward the target)', () => {
    const rand = rng(7);
    for (let trial = 0; trial < 400; trial++) {
      let x = rand() * 2 - 1;
      let v = (rand() * 2 - 1) * 8;
      const target = rand() * 2 - 1;
      const side = Math.sign(x - target);
      for (let i = 0; i < 120; i++) {
        [x, v] = smoothDamp(x, v, target, HEAD.smoothTime, 1 / (20 + rand() * 100));
        expect((x - target) * side).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('settles on a step and is monotone on the way', () => {
    let x = 0;
    let v = 0;
    let prev = 0;
    for (let i = 0; i < 240; i++) {
      [x, v] = smoothDamp(x, v, 1, HEAD.smoothTime, FRAME);
      expect(x).toBeGreaterThanOrEqual(prev);
      expect(x).toBeLessThanOrEqual(1);
      prev = x;
    }
    expect(x).toBeCloseTo(1, 6);
  });

  it('follows the same path at 30 and 60 fps', () => {
    const path = (t) => [0.4 * Math.sin(1.7 * t), 0.5 + 0.2 * Math.cos(2.3 * t)];
    const track = (dt) => {
      const pts = [];
      let [x, vx, y, vy] = [path(0)[0], 0, path(0)[1], 0];
      for (let i = 1; i <= 3 / dt; i++) {
        const [tx, ty] = path(i * dt);
        [x, vx] = smoothDamp(x, vx, tx, HEAD.smoothTime, dt);
        [y, vy] = smoothDamp(y, vy, ty, HEAD.smoothTime, dt);
        pts.push([x, y]);
      }
      return pts;
    };
    const slow = track(1 / 30);
    const fast = track(1 / 60);
    // the 30fps head is the 60fps head at every second sample; a coarser step lags by at most ~half a frame of travel
    let worst = 0;
    slow.forEach((p, i) => {
      const q = fast[2 * i + 1];
      worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1]));
    });
    expect(worst).toBeLessThan(0.01);
  });
});

describe('createHead', () => {
  it('reports nothing until the pointer has been seen', () => {
    const head = createHead();
    expect(head.step(DT).active).toBe(false);
  });

  it('snaps to the first point: one jumped step with an empty segment, then it is a normal head', () => {
    const head = createHead();
    head.point(0.3, 0.5, false);
    const first = head.step(DT);
    expect(first).toMatchObject({ active: true, jumped: true, x0: 0.3, x1: 0.3, y0: 0.5, y1: 0.5, speed: 0, strength: 0 });
    expect(head.step(DT).jumped).toBe(false);
  });

  it('a still pointer stays at exactly zero speed and strength', () => {
    const head = createHead();
    head.point(0.3, 0.5, false);
    for (let i = 0; i < 600; i++) {
      const s = head.step(DT);
      expect(s.speed).toBe(0);
      expect(s.strength).toBe(0);
    }
  });

  it('sweeps a segment that adds up to the distance travelled, at the pointer speed once settled', () => {
    const head = createHead();
    head.point(0, 0.5, false);
    head.step(DT);
    let path = 0;
    let last = null;
    for (let i = 1; i <= 240; i++) {
      head.point(1.2 * i * DT, 0.5, false); // 1.2 band heights per second
      last = head.step(DT);
      path += Math.hypot(last.x1 - last.x0, last.y1 - last.y0);
    }
    // the head trails the pointer by about speed * smoothTime and reaches its speed
    expect(last.speed).toBeCloseTo(1.2, 1);
    expect(path).toBeCloseTo(1.2 * 2 - HEAD.smoothTime * 1.2, 1);
    expect(last.strength).toBeGreaterThan(0.7);
  });

  it('glides when the pointer comes back close by, and snaps (once) when it comes back far away', () => {
    const head = createHead();
    head.point(0.2, 0.5, false);
    for (let i = 0; i < 60; i++) head.step(DT);
    head.leave();
    head.point(0.2 + HEAD.breakDist * 0.6, 0.5, false);
    const near = head.step(DT);
    expect(near.jumped).toBe(false);
    expect(near.x1).toBeLessThan(0.2 + HEAD.breakDist * 0.6); // still on its way there

    head.leave();
    head.point(0.2 + HEAD.breakDist * 4, 0.5, false);
    const far = head.step(DT);
    expect(far.jumped).toBe(true);
    expect(far.x1).toBeCloseTo(0.2 + HEAD.breakDist * 4, 12); // no segment across the gap
    expect(far.x0).toBe(far.x1);
    expect(head.step(DT).jumped).toBe(false);
  });

  it('eases into the pressed state instead of stepping', () => {
    const head = createHead();
    head.point(0, 0.5, false);
    head.step(DT);
    head.point(0, 0.5, true);
    const first = head.step(DT);
    expect(first.dragMix).toBeGreaterThan(0);
    expect(first.dragMix).toBeLessThan(0.2);
    let s = first;
    for (let i = 0; i < 120; i++) s = head.step(DT);
    expect(s.dragMix).toBeGreaterThan(0.99);
  });

  it('reset() forgets the pointer', () => {
    const head = createHead();
    head.point(0.1, 0.2, true);
    head.step(DT);
    head.reset();
    expect(head.step(DT).active).toBe(false);
    head.point(0.9, 0.9, false);
    expect(head.step(DT)).toMatchObject({ jumped: true, x1: 0.9, dragMix: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  WAKE, createWake, fade, pickTrailN, reachAt, smoothDamp, speedStrength, trailCandidates, trailTiming,
} from './wake.js';

const SIZES = [8, 16, 24];
const FRAME = 1 / 60;

/** Deterministic pseudo-random numbers, so a failing run can be reproduced. */
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A circle at constant speed (band heights per second): the steadiest motion there is. */
const circle = (speed, r = 0.3) => (t) => [r * Math.cos((speed / r) * t), 0.5 + r * Math.sin((speed / r) * t)];

/**
 * Run a wake for `seconds` of pointer path, calling `each(frameIndex, wake, out, box)` after every update.
 * `path(t)` returns [x, y]; return null from it to stop feeding the pointer (it stays where it was).
 */
function run(n, seconds, path, { dt = FRAME, drag = false, each, hooks } = {}) {
  const wake = createWake(n, hooks);
  const out = new Float32Array(n * 4);
  const box = new Float32Array(4);
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) {
    const p = path(i * dt);
    if (p) wake.point(p[0], p[1], drag);
    wake.update(dt);
    const live = wake.fill(out, box);
    each?.(i, wake, out, box, live);
  }
  return { wake, out, box };
}

describe('trail sizing', () => {
  it('pickTrailN follows MAX_FRAGMENT_UNIFORM_VECTORS at its boundaries', () => {
    expect([0, 16, 63].map(pickTrailN)).toEqual([8, 8, 8]);
    expect([64, 127].map(pickTrailN)).toEqual([16, 16]);
    expect([128, 224, 1024].map(pickTrailN)).toEqual([24, 24, 24]);
    expect(pickTrailN(undefined)).toBe(8);
  });

  it('tries the picked size, then 8, then none, without repeating itself', () => {
    expect(trailCandidates(256)).toEqual([24, 8, 0]);
    expect(trailCandidates(64)).toEqual([16, 8, 0]);
    expect(trailCandidates(30)).toEqual([8, 0]);
  });

  it('samples every clamp(1.1 / (n - 4), .05, .1) s and lives min(1.1, (n - 4) * dt) s', () => {
    expect(trailTiming(8)).toEqual({ every: 0.1, life: 0.4 });
    const t16 = trailTiming(16);
    expect(t16.every).toBeCloseTo(1.1 / 12, 10);
    expect(t16.life).toBeCloseTo(1.1, 10);
    const t24 = trailTiming(24);
    expect(t24.every).toBeCloseTo(0.055, 10);
    expect(t24.life).toBeCloseTo(1.1, 10);
  });
});

describe('fade', () => {
  it('starts at 1, never rises, and is exactly 0 from `life` on', () => {
    for (const n of SIZES) {
      const { life } = trailTiming(n);
      expect(fade(0, life)).toBe(1);
      let prev = 1;
      for (let a = 0; a <= life + 0.2; a += 0.005) {
        const v = fade(a, life);
        expect(v).toBeLessThanOrEqual(prev + 1e-12);
        prev = v;
      }
      expect(fade(life, life)).toBe(0);
      expect(fade(life + 1, life)).toBe(0);
    }
  });

  it('strength is exactly 0 for a still pointer and 0.6 / 0.9 at full speed', () => {
    expect(speedStrength(0)).toBe(0);
    expect(speedStrength(WAKE.deadLo)).toBe(0);
    expect(speedStrength(5)).toBeCloseTo(WAKE.hover, 12);
    expect(speedStrength(5, 1)).toBeCloseTo(WAKE.drag, 12);
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
        [x, v] = smoothDamp(x, v, target, WAKE.smoothTime, 1 / (20 + rand() * 100));
        expect((x - target) * side).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('settles on a step and is monotone on the way', () => {
    let x = 0;
    let v = 0;
    let prev = 0;
    for (let i = 0; i < 240; i++) {
      [x, v] = smoothDamp(x, v, 1, WAKE.smoothTime, FRAME);
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
        [x, vx] = smoothDamp(x, vx, tx, WAKE.smoothTime, dt);
        [y, vy] = smoothDamp(y, vy, ty, WAKE.smoothTime, dt);
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

describe.each(SIZES)('wake with %i entries', (n) => {
  const { every, life } = trailTiming(n);

  it('never evicts a sample that is still visible, under sustained motion', () => {
    const evicted = [];
    run(n, 12, circle(1.4), { hooks: { onEvict: (amp) => evicted.push(amp) } });
    expect(evicted.filter((a) => a > 0)).toEqual([]);
  });

  it('also holds across a far re-entry (a break) in the middle of a stroke', () => {
    const evicted = [];
    const { wake } = run(n, 6, circle(1.4), { hooks: { onEvict: (amp) => evicted.push(amp) } });
    const out = new Float32Array(n * 4);
    const box = new Float32Array(4);
    wake.leave();
    wake.point(-0.8, 0.3, false); // far from the head: breaks the trail
    for (let i = 0; i < 600; i++) {
      const t = 6 + i * FRAME;
      const [x, y] = circle(1.4)(t + 1);
      wake.point(x - 0.8, y - 0.2, false);
      wake.update(FRAME);
      wake.fill(out, box);
    }
    expect(evicted.filter((a) => a > 0)).toEqual([]);
  });

  it('keeps pushing at the sampling interval, not per event', () => {
    const { wake } = run(n, 4, circle(1.4));
    const born = wake.snapshot().samples.map((s) => s.born);
    expect(born.length).toBeGreaterThan(2);
    for (let i = 1; i < born.length; i++) {
      const gap = born[i] - born[i - 1];
      expect(gap).toBeGreaterThanOrEqual(every - 1e-9);
      expect(gap).toBeLessThan(every + 2 * FRAME);
    }
  });

  it('has no per-frame amplitude jumps once the motion is steady', () => {
    const last = new Map(); // sample id (its birth time) -> amplitude on the previous frame
    let headPrev = null;
    let worst = 0;
    run(n, 8, circle(1.2), {
      each(i, wake) {
        const snap = wake.snapshot();
        if (i > 60) { // skip the head's own start-up ramp
          for (const s of snap.samples) {
            if (last.has(s.born)) worst = Math.max(worst, Math.abs(s.amp - last.get(s.born)));
          }
          if (headPrev !== null) worst = Math.max(worst, Math.abs(snap.head.strength - headPrev));
        }
        last.clear();
        snap.samples.forEach((s) => last.set(s.born, s.amp));
        headPrev = snap.head.strength;
      },
    });
    // a sample may change only as fast as the fade curve itself does (steeper for the short n = 8 trail)
    let slope = 0;
    for (let a = 0; a < life; a += 0.001) slope = Math.max(slope, Math.abs(fade(a + 0.001, life) - fade(a, life)) / 0.001);
    expect(worst).toBeLessThan(slope * WAKE.hover * FRAME * 1.25);
  });

  it('decays to nothing once the pointer stops, and a pointer that never moves draws nothing', () => {
    let quietAt = null;
    run(n, 1.2 + life + 1, (t) => (t < 1.2 ? circle(1.4)(t) : null), {
      each(i, wake, out, box, live) {
        const t = (i + 1) * FRAME;
        if (t > 1.2 && !live && quietAt === null) quietAt = t - 1.2;
      },
    });
    // the head needs a moment to coast to rest, then the last sample fades within `life`
    expect(quietAt).not.toBeNull();
    expect(quietAt).toBeLessThanOrEqual(life + 0.2);

    const idle = run(n, 3, () => [0.1, 0.4], { each: (i, w, o, b, live) => expect(live).toBe(false) });
    expect(idle.out.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });

  it('stays at exactly zero amplitude for every entry once idle', () => {
    const { out, box } = run(n, 1 + life + 1.5, (t) => (t < 1 ? circle(1.4)(t) : null));
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(0);
    expect(box[0]).toBeGreaterThan(box[2]); // inverted: nothing to draw
  });

  it('caps a trail with two zero-strength break samples when the pointer re-enters far away', () => {
    const { wake, out } = run(n, 3, circle(1.4));
    const head = wake.snapshot().head;
    wake.leave();
    const far = [head.x > 0 ? -0.9 : 0.9, 0.25];
    wake.point(far[0], far[1], false);
    const box = new Float32Array(4);
    wake.fill(out, box);
    const entry = (i) => ({ x: out[i * 4], y: out[i * 4 + 1], amp: out[i * 4 + 3] });
    const [b1, b2, newHead] = [entry(n - 3), entry(n - 2), entry(n - 1)];
    expect(Math.hypot(b1.x - head.x, b1.y - head.y)).toBeLessThan(1e-5);
    expect(b1.amp).toBe(0);
    expect(b2.x).toBeCloseTo(far[0], 5);
    expect(b2.y).toBeCloseTo(far[1], 5);
    expect(b2.amp).toBe(0);
    expect(newHead.x).toBeCloseTo(far[0], 5); // the head snapped, it did not glide across the gap
    expect(newHead.amp).toBe(0);
    // nothing bridges the gap: every live segment lies on one side of it
    for (let i = 0; i < n - 1; i++) {
      if (out[i * 4 + 3] + out[(i + 1) * 4 + 3] > WAKE.ampMin) {
        expect(Math.hypot(out[i * 4] - out[(i + 1) * 4], out[i * 4 + 1] - out[(i + 1) * 4 + 1])).toBeLessThan(0.4);
      }
    }
  });

  it('does not break when the pointer comes back within 0.05 band heights', () => {
    const { wake, out, box } = run(n, 2, circle(1.4));
    const head = wake.snapshot().head;
    const before = wake.snapshot().samples.length;
    wake.leave();
    wake.point(head.x + 0.03, head.y, false);
    wake.fill(out, box);
    expect(wake.snapshot().samples.length).toBe(before);
    expect(Math.hypot(out[(n - 1) * 4] - head.x, out[(n - 1) * 4 + 1] - head.y)).toBeLessThan(1e-5); // still gliding, not snapped
  });

  it('keeps the bbox around every live segment plus its reach, and empty when idle', () => {
    const rand = rng(3 + n);
    const wobble = (t) => [0.5 * Math.sin(2.1 * t) + 0.1 * rand(), 0.5 + 0.3 * Math.cos(1.3 * t) + 0.1 * rand()];
    let checked = 0;
    run(n, 6 + life + 1, (t) => (t < 6 ? wobble(t) : null), {
      each(i, wake, out, box, live) {
        let any = false;
        for (let k = 0; k < n - 1; k++) {
          const a = k * 4, b = a + 4;
          if (!(out[a + 3] + out[b + 3] > WAKE.ampMin)) continue;
          any = true;
          const r = reachAt(Math.max(out[a + 2], out[b + 2]));
          for (const o of [a, b]) {
            expect(box[0]).toBeLessThanOrEqual(out[o] - r + 1e-5);
            expect(box[1]).toBeLessThanOrEqual(out[o + 1] - r + 1e-5);
            expect(box[2]).toBeGreaterThanOrEqual(out[o] + r - 1e-5);
            expect(box[3]).toBeGreaterThanOrEqual(out[o + 1] + r - 1e-5);
          }
          checked++;
        }
        expect(live).toBe(any);
        if (!any) expect([box[0] > box[2], box[1] > box[3]]).toEqual([true, true]);
      },
    });
    expect(checked).toBeGreaterThan(100);
  });
});

describe('wake lifecycle', () => {
  it('reset() forgets everything, so a resumed loop starts from nothing', () => {
    const { wake, out, box } = run(16, 2, circle(1.4));
    wake.reset();
    expect(wake.fill(out, box)).toBe(false);
    expect(wake.snapshot().samples).toHaveLength(0);
    wake.point(0.2, 0.2, false);
    wake.update(FRAME);
    expect(wake.snapshot().head.x).toBeCloseTo(0.2, 10);
  });

  it('a pressed pointer paints a stronger wake than a hovering one', () => {
    const peak = (drag) => {
      let m = 0;
      run(16, 3, circle(1.4), { drag, each: (i, w) => { m = Math.max(m, w.snapshot().head.strength); } });
      return m;
    };
    expect(peak(true)).toBeGreaterThan(peak(false) * 1.3);
  });
});

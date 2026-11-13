import { describe, expect, it } from 'vitest';

import { doorGeometry, liftLine } from './doorLine.js';

// The hidden door: the front plains line lifts into a small doorway near the left of the stage.

const flat = (n, y) => new Float32Array(n).fill(y);
const steps = (n, step) => Float32Array.from({ length: n }, (_, k) => k * step);

/** A flat line at y 200 sampled every `step` px, its elevation rising 1 m per px. */
function line(step = 3, n = 40) {
  const xs = steps(n, step);
  return { xs, ys: flat(n, 200), es: Float32Array.from(xs, (x) => 900 + x) };
}

const at = (out, x) => [...out.xs].flatMap((v, k) => (v === x ? [k] : []));

describe('doorGeometry', () => {
  const lineBase = new Float32Array(64).fill(100);

  it('uses the front line, just inside the stage edge, 14 by 24 with a 3 px arch on a desktop', () => {
    expect(doorGeometry({ N: 64, sx0: 130, phone: false, lineBase })).toEqual({ line: 63, x0: 138, w: 14, h: 24, arch: 3 });
  });

  it('keeps at least 32 px from the band edge on a narrow desktop band', () => {
    expect(doorGeometry({ N: 64, sx0: 10, phone: false, lineBase }).x0).toBe(40);
  });

  it('is a little smaller on a phone, 16 px in from the edge plus the inset', () => {
    expect(doorGeometry({ N: 48, sx0: 0, phone: true, lineBase })).toEqual({ line: 47, x0: 24, w: 12, h: 20, arch: 3 });
  });

  it('sits on a whole pixel', () => {
    expect(Number.isInteger(doorGeometry({ N: 64, sx0: 48.5, phone: false, lineBase }).x0)).toBe(true);
  });
});

describe('liftLine', () => {
  const geom = { line: 0, x0: 31, w: 14, h: 24, arch: 3 }; // x0 and x1 = 45 fall between and on samples

  it('returns the line as drawn at lift 0 (and below)', () => {
    const l = line();
    for (const lift of [0, -0.2]) {
      const out = liftLine(l.xs, l.ys, l.es, geom, lift);
      expect([...out.xs]).toEqual([...l.xs]);
      expect([...out.ys]).toEqual([...l.ys]);
      expect([...out.es]).toEqual([...l.es]);
    }
  });

  it('puts two corner points on each jamb: foot then head at x0, head then foot at x0 + w', () => {
    const out = liftLine(...Object.values(line()), geom, 1);
    const left = at(out, 31);
    const right = at(out, 45);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    expect(left[1]).toBe(left[0] + 1);
    expect(right[1]).toBe(right[0] + 1);
    expect([out.ys[left[0]], out.ys[left[1]]]).toEqual([200, 179]); // the jambs stand h - arch tall
    expect([out.ys[right[0]], out.ys[right[1]]]).toEqual([179, 200]);
  });

  it('gives the corners the elevation of the line where they stand, so they colour like it', () => {
    const out = liftLine(...Object.values(line()), geom, 1);
    const corners = [...at(out, 31), ...at(out, 45)];
    expect(corners).toHaveLength(4);
    expect(corners.map((k) => out.es[k])).toEqual([931, 931, 945, 945].map((e) => expect.closeTo(e, 4)));
  });

  it('runs the top as a shallow arch, h above the line at its centre', () => {
    const l = line(1, 80);
    const out = liftLine(l.xs, l.ys, l.es, geom, 1);
    expect(out.ys[at(out, 38)[0]]).toBeCloseTo(176, 5);
    expect(Math.min(...out.ys)).toBeCloseTo(176, 5);
    // between the jambs every point is on the arch, which falls away from the centre to h - arch
    for (let k = at(out, 31)[1] + 1; k < at(out, 45)[0]; k += 1) {
      const t = (out.xs[k] - 38) / 7;
      expect(out.ys[k]).toBeCloseTo(200 - 21 - 3 * (1 - t * t), 5);
      expect(out.es[k]).toBe(l.es[out.xs[k]]);
    }
  });

  it('leaves every point outside the doorway exactly where it was', () => {
    const l = line();
    const out = liftLine(l.xs, l.ys, l.es, geom, 1);
    const pick = (o, keep) => [...o.xs].flatMap((x, k) => (keep(x) ? [[x, o.ys[k], o.es[k]]] : []));
    const outside = (x) => x < 31 || x > 45;
    expect(pick(out, outside)).toEqual(pick(l, outside));
    expect(out.xs.length).toBe(l.xs.length + 4 - at(l, 45).length); // the sample on x0 + w gives way to the corners
    for (let k = 1; k < out.xs.length; k += 1) expect(out.xs[k]).toBeGreaterThanOrEqual(out.xs[k - 1]);
  });

  it('rises from the line it is on, wherever that sits', () => {
    const l = line(1, 80);
    const ys = Float32Array.from(l.xs, (x) => 200 - x / 10); // a gentle slope up to the right
    const out = liftLine(l.xs, ys, l.es, geom, 1);
    const [foot, head] = at(out, 31);
    expect(out.ys[foot]).toBeCloseTo(196.9, 4);
    expect(out.ys[head]).toBeCloseTo(196.9 - 21, 4);
    expect(out.ys[at(out, 38)[0]]).toBeCloseTo(196.2 - 24, 4);
  });

  it('scales the whole doorway with the lift: half height at 0.5', () => {
    const l = line(1, 80);
    const out = liftLine(l.xs, l.ys, l.es, geom, 0.5);
    expect(out.ys[at(out, 31)[1]]).toBeCloseTo(200 - 10.5, 5);
    expect(out.ys[at(out, 38)[0]]).toBeCloseTo(200 - 12, 5);
    expect(out.ys[at(out, 45)[0]]).toBeCloseTo(200 - 10.5, 5);
  });
});

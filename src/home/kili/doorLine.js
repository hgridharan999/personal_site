// The hidden door on the Kilimanjaro band: the front plains line lifts into a small doorway near
// the left of the stage. Pure, so it runs in node; paint.js strokes what it returns like any
// other line, and labels.js puts the door's hit area over it.

const INSET = 8; // px in from where the lines reach full strength (paint.js fades them over 0..sx0)
const ARCH = 3; // px the top rises at its centre, above the heads of the jambs

/**
 * Where the door stands for a layout: the front line, `x0` its left jamb (a whole pixel), `w` wide
 * and `h` tall at full lift (the arch included).
 */
export function doorGeometry({ N, sx0, phone }) {
  const edge = Math.max(phone ? 16 : 32, sx0);
  return { line: N - 1, x0: Math.round(edge + INSET), w: phone ? 12 : 14, h: phone ? 20 : 24, arch: ARCH };
}

/** The value of `v` at `x` along the samples `xs`, linear between neighbours. */
function valueAt(xs, v, x) {
  const n = xs.length;
  if (x <= xs[0]) return v[0];
  if (x >= xs[n - 1]) return v[n - 1];
  let k = 1;
  while (xs[k] < x) k += 1;
  const f = (x - xs[k - 1]) / (xs[k] - xs[k - 1]);
  return v[k - 1] + (v[k] - v[k - 1]) * f;
}

/**
 * One line (`xs`, screen `ys`, elevations `es`) with the doorway lifted `lift` (0..1) of the way out.
 * Inside (x0, x0 + w) every sample rises onto an arch that is `h` above the line at its centre and
 * `h - arch` at the jambs; four corner points stand the jambs straight up from the line. The
 * corners take the line's elevation where they stand, so the door keeps the line's colour.
 * Samples outside the doorway are kept as they are; at lift 0 the line comes back unchanged.
 */
export function liftLine(xs, ys, es, geom, lift) {
  if (!(lift > 0)) return { xs, ys, es };
  const { x0, w, h, arch } = geom;
  const x1 = x0 + w;
  const half = w / 2;
  const jamb = lift * (h - arch);
  const rise = (x) => {
    const t = (x - x0 - half) / half;
    return jamb + lift * arch * (1 - t * t);
  };
  const ox = [];
  const oy = [];
  const oe = [];
  const push = (x, y, e) => { ox.push(x); oy.push(y); oe.push(e); };
  const corner = (x, footFirst) => {
    const y = valueAt(xs, ys, x);
    const e = valueAt(xs, es, x);
    if (footFirst) { push(x, y, e); push(x, y - jamb, e); } else { push(x, y - jamb, e); push(x, y, e); }
  };

  const n = xs.length;
  let k = 0;
  for (; k < n && xs[k] < x0; k += 1) push(xs[k], ys[k], es[k]);
  corner(x0, true);
  while (k < n && xs[k] <= x0) k += 1; // a sample on a jamb gives way to its corners
  for (; k < n && xs[k] < x1; k += 1) push(xs[k], ys[k] - rise(xs[k]), es[k]);
  corner(x1, false);
  while (k < n && xs[k] <= x1) k += 1;
  for (; k < n; k += 1) push(xs[k], ys[k], es[k]);
  return { xs: Float64Array.from(ox), ys: Float64Array.from(oy), es: Float64Array.from(oe) };
}

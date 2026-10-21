import { clamp } from './math.js';

// The Machame route on the stack of lines. Ascent and descent are densified to about a pixel per
// step, draped on the terrain, and each little segment is filed under the ruled line just behind
// it, so the nearer ridges drawn after that line hide it. Pure: positions and lengths only.

const STEP_PX = 1.1; // spacing of the dense points
const DASH_PERIOD = 6.2; // the descent is dotted: this much per dot and gap...
const DASH_ON = 3.4; // ...of which this much is drawn
const SUMMIT_R = 2.8; // camp dot radii in px
const CAMP_R = 2.1;
export const ASCENT = 0; // values of `leg`
export const DESCENT = 1;

/**
 * Builds the route for a layout. `route` is the fetched route file (or null when it did not load,
 * in which case the result is empty and the ending simply has no route).
 *
 * - `x`, `y`, `leg`, `cum`, `dash`: one entry per dense point (position, 0 ascent / 1 descent,
 *   distance walked in px, and whether a descent segment ending there is a dot rather than a gap)
 * - `total` / `ascentLength`: the drawn length in px of the whole route / of the way up
 * - `segB[i]`: the dense points whose segment (from the point before) is filed under line i
 * - `dotB[i]` and `waypoints`: the camp dots, each with its screen position and the distance `at`
 *   along the route where it is reached
 */
export function buildRoute(route, layout) {
  const { N, drape } = layout;
  const segB = Array.from({ length: N }, () => []);
  const dotB = Array.from({ length: N }, () => []);
  const empty = { count: 0, x: null, y: null, leg: null, cum: null, dash: null, total: 1, ascentLength: 0, segB, dotB, waypoints: [] };
  if (!route) return empty;

  const pts = []; // [x, y, lineIndex, leg, col, row]
  [route.ascent ?? [], route.descent ?? []].forEach((points, leg) => {
    for (let s = 0; s < points.length - 1; s += 1) {
      const [c0, r0] = points[s];
      const [c1, r1] = points[s + 1];
      const pa = drape(c0, r0);
      const pb = drape(c1, r1);
      const n = Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / STEP_PX));
      for (let q = s === 0 ? 0 : 1; q <= n; q += 1) {
        const t = q / n;
        const c = c0 + (c1 - c0) * t;
        const r = r0 + (r1 - r0) * t;
        const p = drape(c, r);
        pts.push([p[0], p[1], p[2], leg, c, r]);
      }
    }
  });

  const count = pts.length;
  if (count < 2) return empty;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const cum = new Float32Array(count);
  const leg = new Uint8Array(count);
  const dash = new Uint8Array(count);
  let ascentLength = 0;
  let dCum = 0;
  for (let m = 0; m < count; m += 1) {
    x[m] = pts[m][0];
    y[m] = pts[m][1];
    leg[m] = pts[m][3];
    if (m === 0) continue;
    const len = Math.hypot(x[m] - x[m - 1], y[m] - y[m - 1]);
    cum[m] = cum[m - 1] + len;
    if (leg[m] !== leg[m - 1]) continue; // the turn at the summit is not a segment
    if (leg[m] === ASCENT) ascentLength = cum[m];
    else {
      dCum += len;
      dash[m] = (dCum - len * 0.5) % DASH_PERIOD < DASH_ON ? 1 : 0;
    }
    const li = 0.5 * (pts[m][2] + pts[m - 1][2]);
    segB[clamp(Math.floor(li), 0, N - 1)].push(m);
  }

  const waypoints = [];
  for (const w of route.waypoints ?? []) {
    if (w.kind === 'landmark') continue;
    const [wx, wy, li] = drape(w.col, w.row);
    let best = 0;
    let bd = Infinity;
    for (let m = 0; m < count; m += 1) {
      const d = (pts[m][4] - w.col) ** 2 + (pts[m][5] - w.row) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    const wp = { name: w.name, kind: w.kind, x: wx, y: wy, at: cum[best], r: w.kind === 'summit' ? SUMMIT_R : CAMP_R };
    waypoints.push(wp);
    dotB[clamp(Math.floor(li), 0, N - 1)].push(wp);
  }

  return { count, x, y, leg, cum, dash, total: cum[count - 1], ascentLength, segB, dotB, waypoints };
}

/**
 * Where the two peak labels point: the summit dot (or the summit grid position when the route
 * is missing) and Mawenzi, each lifted a few px above the line they sit on.
 */
export function labelAnchors(layout, built, terrain) {
  const summitDot = built.waypoints.find((w) => w.kind === 'summit');
  const [sx, sy] = summitDot ? [summitDot.x, summitDot.y] : layout.drape(...terrain.summit);
  const [mx, my] = layout.drape(...terrain.mawenzi);
  return { peak: { x: sx, y: sy - 6 }, mawenzi: { x: mx, y: my - 5 } };
}

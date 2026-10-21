import { ASCENT } from './route.js';
import { lineProgress } from './timeline.js';
import { binOf, E0, fillPalette, makePalette, NB } from './zones.js';

// Strokes one frame of the ending on a Canvas 2D context. Once the lines are down their shapes
// never change: each line keeps its fill and one path per elevation bin, and the finished route
// keeps its paths. Frames only restroke those paths with new colours, which is what keeps them cheap.

const INK_CSS = '#1A1A18';
const ROUTE_BLUE = '#0F7DAA';
const ROUTE_BLUE_SOFT = 'rgba(15,125,170,0.6)';

/**
 * A painter for one layout. Make a new one whenever the layout changes: the cached paths belong
 * to the sizes they were made for.
 *
 * `paint({ dpr, pixelW, pixelH, drawT, full, tideH, routeLen })`: `full` is true once every
 * line is down (then `drawT` no longer matters); the rest is the timeline's state for the frame.
 */
export function createPainter(ctx, layout, built) {
  const { N, K, xs, yS, eS, lineBase, width: W, height: H, sx0 } = layout;
  const pal = makePalette();
  let cache = null; // per line: { curve, poly, bins }
  let routeCache = null; // per line: the finished route's paths

  /** One path per elevation bin the line passes through. */
  function binsFor(i) {
    const row = i * K;
    const list = new Array(NB).fill(null);
    let prev = -1;
    for (let k = 1; k < K; k += 1) {
      const b = binOf(0.5 * (eS[row + k - 1] + eS[row + k]));
      let p = list[b];
      if (!p) { p = new Path2D(); list[b] = p; }
      if (b !== prev) p.moveTo(xs[k - 1], yS[row + k - 1]);
      p.lineTo(xs[k], yS[row + k]);
      prev = b;
    }
    const idx = [];
    const paths = [];
    for (let b = 0; b < NB; b += 1) if (list[b]) { idx.push(b); paths.push(list[b]); }
    return { idx, paths };
  }

  /** The dashed way up and the dotted way down that lie behind line i, drawn as far as length `L`. */
  function routePaths(i, L) {
    const asc = new Path2D();
    const desc = new Path2D();
    let pa = -2;
    let pd = -2;
    const { x, y, cum, leg, dash } = built;
    for (const m of built.segB[i]) {
      if (cum[m - 1] >= L) continue;
      let ex = x[m];
      let ey = y[m];
      if (cum[m] > L) {
        const f = (L - cum[m - 1]) / Math.max(1e-6, cum[m] - cum[m - 1]);
        ex = x[m - 1] + (x[m] - x[m - 1]) * f;
        ey = y[m - 1] + (y[m] - y[m - 1]) * f;
      }
      if (leg[m] === ASCENT) {
        if (pa !== m - 1) asc.moveTo(x[m - 1], y[m - 1]);
        asc.lineTo(ex, ey);
        pa = m;
      } else if (dash[m]) {
        if (pd !== m - 1) desc.moveTo(x[m - 1], y[m - 1]);
        desc.lineTo(ex, ey);
        pd = m;
      }
    }
    return { asc, desc };
  }

  function drawRoute(i, routeLen) {
    const dots = built.dotB[i];
    if (!built.count || routeLen <= 0 || (!built.segB[i].length && !dots.length)) return;
    const finished = routeLen >= built.total - 1e-3;
    if (finished && !routeCache) routeCache = new Array(N);
    let rp = finished ? routeCache[i] : null;
    if (!rp) {
      rp = routePaths(i, routeLen);
      if (finished) routeCache[i] = rp;
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // a clear halo first, so the route reads over the line it crosses
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3.6;
    ctx.stroke(rp.asc);
    ctx.lineWidth = 3.0;
    ctx.stroke(rp.desc);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([5, 3.5]);
    ctx.strokeStyle = ROUTE_BLUE;
    ctx.lineWidth = 1.45;
    ctx.stroke(rp.asc);
    ctx.setLineDash([1.6, 3.2]);
    ctx.strokeStyle = ROUTE_BLUE_SOFT;
    ctx.lineWidth = 1.2;
    ctx.stroke(rp.desc);
    ctx.setLineDash([]);
    if (!dots.length) return;
    const halo = new Path2D();
    const fill = new Path2D();
    let any = false;
    for (const w of dots) {
      if (w.at > routeLen + 0.5) continue;
      halo.moveTo(w.x + w.r + 1.6, w.y);
      halo.arc(w.x, w.y, w.r + 1.6, 0, Math.PI * 2);
      fill.moveTo(w.x + w.r, w.y);
      fill.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      any = true;
    }
    if (!any) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fill(halo);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = ROUTE_BLUE;
    ctx.fill(fill);
  }

  /** The curve to stroke and the ground under it (a closed shape), drawn `p` of the way across. */
  function shapeFor(i, p, full) {
    const hit = full ? cache[i] : null;
    if (hit) return hit;
    const row = i * K;
    const kEnd = p * (K - 1);
    const kLast = Math.floor(kEnd);
    const hasTip = kLast < K - 1 && kEnd > kLast;
    let tipX = xs[kLast];
    let tipY = yS[row + kLast];
    if (hasTip) {
      const ft = kEnd - kLast;
      tipX += (xs[kLast + 1] - tipX) * ft;
      tipY += (yS[row + kLast + 1] - tipY) * ft;
    }
    const curve = new Path2D();
    curve.moveTo(xs[0], yS[row]);
    for (let k = 1; k <= kLast; k += 1) curve.lineTo(xs[k], yS[row + k]);
    if (hasTip) curve.lineTo(tipX, tipY);
    // the ground under a line hides whatever lies behind it: erase, so the page shows through
    const poly = new Path2D(curve);
    const floorY = lineBase[i] + 4;
    poly.lineTo(tipX, floorY);
    poly.lineTo(-2, floorY);
    poly.closePath();
    const shape = { curve, poly, bins: null };
    if (full) cache[i] = shape;
    return shape;
  }

  function strokeZoned(shape, i, a0, w0) {
    if (!shape.bins) shape.bins = binsFor(i);
    const { idx, paths } = shape.bins;
    ctx.lineCap = 'butt';
    for (let n = 0; n < idx.length; n += 1) {
      const b = idx[n];
      if (pal.e[b] > 0.01) { // the arctic zone: a fine ink edge under the icy line
        ctx.globalAlpha = Math.min(1, a0 * 1.25) * 0.8 * pal.e[b];
        ctx.lineWidth = w0 + pal.w[b] + 1.1;
        ctx.strokeStyle = INK_CSS;
        ctx.stroke(paths[n]);
      }
      ctx.globalAlpha = Math.min(1, a0 * pal.a[b]);
      ctx.lineWidth = w0 + pal.w[b];
      ctx.strokeStyle = pal.c[b];
      ctx.stroke(paths[n]);
    }
  }

  /** The ruled lines fade into the page at both edges. */
  function fadeEdges() {
    if (sx0 <= 1) return;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    const e = sx0 * 0.92;
    let g = ctx.createLinearGradient(0, 0, e, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, e, H);
    g = ctx.createLinearGradient(W, 0, W - e, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W - e, 0, e, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  return function paint({ dpr, pixelW, pixelH, drawT, full, tideH, routeLen }) {
    // clear every device pixel (the last column can lie past W * dpr), then draw in CSS pixels
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelW, pixelH);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round';
    if (full && !cache) cache = new Array(N);
    const zoned = full && tideH > E0 - 600;
    if (zoned) fillPalette(pal, tideH);

    for (let i = 0; i < N; i += 1) {
      const p = full ? 1 : lineProgress(drawT, i);
      if (p <= 0) continue;
      const u = i / (N - 1);
      const shape = shapeFor(i, p, full);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fill(shape.poly);
      ctx.globalCompositeOperation = 'source-over';

      const a0 = 0.34 + 0.6 * Math.pow(u, 0.75);
      const w0 = 0.62 + 0.42 * u;
      if (zoned) strokeZoned(shape, i, a0, w0);
      else {
        ctx.lineCap = 'round';
        ctx.globalAlpha = a0;
        ctx.lineWidth = w0;
        ctx.strokeStyle = INK_CSS;
        ctx.stroke(shape.curve);
      }
      drawRoute(i, routeLen);
    }
    fadeEdges();
    ctx.globalAlpha = 1;
  };
}

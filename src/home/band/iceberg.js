/*
 * The iceberg's data, shared by the SVG fallback and the shader.
 * Vertices are in band-height units: x from the centre line, y relative to the waterline
 * (negative = above the water). One polygon: the tip, then the submerged mass.
 */
export const WL = 0.22; // waterline, as a fraction of band height
export const BERG = [
  [-0.2, 0.0], [-0.17, -0.04], [-0.115, -0.06], [-0.085, -0.115], [-0.03, -0.15],
  [0.005, -0.105], [0.045, -0.165], [0.095, -0.095], [0.15, -0.07], [0.205, -0.02],
  [0.3, 0.04], [0.44, 0.075], [0.57, 0.15], [0.66, 0.235], [0.7, 0.31],
  [0.58, 0.37], [0.57, 0.44], [0.44, 0.47], [0.4, 0.55], [0.28, 0.6],
  [0.2, 0.52], [0.12, 0.64], [0.02, 0.585], [-0.08, 0.6], [-0.15, 0.5],
  [-0.26, 0.55], [-0.36, 0.47], [-0.38, 0.4], [-0.52, 0.41], [-0.62, 0.33],
  [-0.6, 0.24], [-0.7, 0.19], [-0.58, 0.11], [-0.42, 0.07], [-0.31, 0.045],
];
export const STILL_T = 13.2; // the frame shown under reduced motion
export const PIXEL_BUDGET = 0.72e6; // canvas pixels: the shader is per-pixel, so keep it bounded

/** Canvas size in device pixels: the DPR (capped at 2) scaled by the governor's quality, then clamped to the budget. */
export function canvasSize(cssW, cssH, dpr, quality) {
  const w0 = Math.max(1, cssW);
  const h0 = Math.max(1, cssH);
  let s = Math.min(dpr || 1, 2) * quality;
  const n = w0 * h0 * s * s;
  if (n > PIXEL_BUDGET) s *= Math.sqrt(PIXEL_BUDGET / n);
  return { w: Math.max(1, Math.round(w0 * s)), h: Math.max(1, Math.round(h0 * s)) };
}

/**
 * Where the iceberg meets the water: the x of its two crossings of the waterline, [-0.2, 0.2367].
 * The surface simulation holds these columns at 0, which splits the water into two basins.
 */
export function bergWaterSpan() {
  const xs = [];
  BERG.forEach(([x1, y1], i) => {
    const [x2, y2] = BERG[(i + 1) % BERG.length];
    // half-open test, so a vertex exactly on the line (the first one) counts once
    if (y1 < 0 !== y2 < 0) xs.push(x1 + ((0 - y1) / (y2 - y1)) * (x2 - x1));
  });
  return [Math.min(...xs), Math.max(...xs)];
}

/** Whether a point (x from the centre line, y from the band top) is inside the iceberg polygon. */
export function insideBerg(x, y) {
  const yr = y - WL;
  let inside = false;
  for (let i = 0, j = BERG.length - 1; i < BERG.length; j = i++) {
    const [xi, yi] = BERG[i];
    const [xj, yj] = BERG[j];
    if (yi > yr !== yj > yr && x < xi + ((yr - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

const pts = (a) => a.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(' ');

/**
 * The static fallback as plain data (so it renders in React without a DOM and can be tested).
 * The mockup's seeded generator is kept as-is, so the facets are identical on every load.
 */
export function fallbackShapes() {
  const pos = BERG.map(([x, y]) => [x, WL + y]);
  const sub = pos.slice(9); // the submerged hull
  const n = sub.length;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // irregular facets: random triangles and chords across the hull, clipped to its outline
  const triangles = [];
  for (let k = 0; k < 14; k++) {
    const i = Math.floor(rnd() * n);
    const tri = [sub[i], sub[(i + 3 + Math.floor(rnd() * 6)) % n], sub[(i + 10 + Math.floor(rnd() * 9)) % n]];
    triangles.push({ points: pts(tri), opacity: (0.05 + rnd() * 0.16).toFixed(2) });
  }
  const chords = [];
  for (let k = 0; k < 16; k++) {
    const i = Math.floor(rnd() * n);
    const j = (i + 4 + Math.floor(rnd() * 12)) % n;
    chords.push({ x1: sub[i][0], y1: sub[i][1], x2: sub[j][0], y2: sub[j][1] });
  }

  // the tip, drawn like the rest of the site: pale facets and a blue line
  const tip = pos.slice(0, 10).concat([[0.25, WL]]);
  return {
    gradient: {
      id: 'hm-fb-ice',
      y1: WL,
      y2: WL + 0.65,
      stops: [['0', '#E6F8FD'], ['0.45', '#8FD3EA'], ['1', '#3C9DC0']],
    },
    clipId: 'hm-fb-hull',
    hull: pts(sub),
    triangles,
    chords,
    tip: pts(tip),
    tipFacets: [
      { points: pts([tip[2], tip[3], tip[4], tip[5]]), fill: '#BBDDEC', opacity: '0.8' },
      { points: pts([tip[6], tip[7], tip[8], tip[9]]), fill: '#9CCBE0', opacity: '0.5' },
    ],
    waterline: WL,
  };
}

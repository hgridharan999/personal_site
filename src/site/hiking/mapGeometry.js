// Geometry for the hike locator map: three state outlines, the boxes they are fitted into, a
// projector, and a light de-clustering pass for pins. Pure and framework-free so node can test it.
// Copied from src/ascent/HikeMap.jsx (which stays on disk, unrouted); only the packaging changed.

export const VB_W = 1200;
export const VB_H = 600;

const CA_BOUNDS = { latMin: 32.5, latMax: 42.0, lngMin: -124.45, lngMax: -114.1 };
const CO_BOUNDS = { latMin: 37.0, latMax: 41.0, lngMin: -109.06, lngMax: -102.04 };
const WA_BOUNDS = { latMin: 45.0, latMax: 49.5, lngMin: -125.0, lngMax: -116.9 };

// simplified California silhouette (lat, lng), clockwise from the NW corner
const CA_OUTLINE = [
  [42.0, -124.21], [40.0, -124.35], [38.3, -123.0], [37.2, -122.42], [36.0, -121.5],
  [34.45, -120.47], [34.02, -118.5], [33.2, -117.4], [32.53, -117.13], [32.62, -114.72],
  [34.3, -114.14], [35.0, -114.63], [36.15, -114.05], [39.0, -120.0], [42.0, -120.0],
];
const CO_OUTLINE = [
  [41.0, -109.06], [41.0, -102.04], [37.0, -102.04], [37.0, -109.06],
];

// Washington silhouette derived from public GeoJSON (simplified sampling)
const WA_OUTLINE = [
  [49.000239, -117.033359],
  [47.762451, -117.044313],
  [46.426077, -117.038836],
  [46.343923, -117.055267],
  [46.168661, -116.923820],
  [45.993399, -116.918344],
  [45.998876, -118.988627],
  [45.933153, -119.125551],
  [45.911245, -119.525367],
  [45.823614, -119.963522],
  [45.725029, -120.209985],
  [45.697644, -120.505739],
  [45.746937, -120.637186],
  [45.604536, -121.184880],
  [45.670259, -121.217742],
  [45.725029, -121.535404],
  [45.708598, -121.809251],
  [45.549767, -122.247407],
  [45.659305, -122.762239],
  [45.960537, -122.811531],
  [46.081030, -122.904639],
  [46.185092, -123.118240],
  [46.174138, -123.211348],
  [46.146753, -123.370179],
  [46.261769, -123.545441],
  [46.300108, -123.726180],
  [46.239861, -123.874058],
  [46.327492, -124.065751],
  [46.464416, -124.027412],
  [46.535616, -123.895966],
  [46.743740, -124.098612],
  [47.285957, -124.235536],
  [47.357157, -124.317690],
  [47.740543, -124.427229],
  [47.888420, -124.624399],
  [48.184175, -124.706553],
  [48.381345, -124.597014],
  [48.288237, -124.394367],
  [48.162267, -123.983597],
  [48.167744, -123.704273],
  [48.118452, -123.424949],
  [48.167744, -123.162056],
  [48.080113, -123.036086],
  [48.085590, -122.800578],
  [47.866512, -122.636269],
  [47.882943, -122.515777],
  [47.587189, -122.493869],
  [47.318818, -122.422669],
  [47.346203, -122.324084],
  [47.576235, -122.422669],
  [47.800789, -122.395284],
  [48.030821, -122.230976],
  [48.123929, -122.362422],
  [48.288237, -122.373376],
  [48.468976, -122.471961],
  [48.600422, -122.422669],
  [48.753777, -122.488392],
  [48.775685, -122.647223],
  [48.890700, -122.795101],
  [49.000239, -122.756762],
  [49.000239, -117.033359],
];

// fit a state's geo bounds into a target box, preserving aspect (letterboxed)
function makeProjector(bounds, box) {
  const midLat = (bounds.latMin + bounds.latMax) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const gw = (bounds.lngMax - bounds.lngMin) * k;
  const gh = bounds.latMax - bounds.latMin;
  const scale = Math.min(box.w / gw, box.h / gh);
  const dw = gw * scale, dh = gh * scale;
  const ox = box.x + (box.w - dw) / 2;
  const oy = box.y + (box.h - dh) / 2;
  return (lat, lng) => [ox + (lng - bounds.lngMin) * k * scale, oy + (bounds.latMax - lat) * scale];
}

const CA_BOX = { x: 45, y: 90, w: 320, h: 470 };
const WA_BOX = { x: 395, y: 40, w: 320, h: 520 };
const CO_BOX = { x: 765, y: 175, w: 360, h: 300 };

const STATES = ['ca', 'wa', 'co'];
const BOUNDS = { ca: CA_BOUNDS, wa: WA_BOUNDS, co: CO_BOUNDS };
const OUTLINES = { ca: CA_OUTLINE, wa: WA_OUTLINE, co: CO_OUTLINE };
const BOXES = { ca: CA_BOX, wa: WA_BOX, co: CO_BOX };
const NAMES = { ca: 'California', wa: 'Washington', co: 'Colorado' };
// how far above its box each name sits (Washington's box starts high, so its name hugs it)
const LABEL_RISE = { ca: 22, wa: 18, co: 22 };
const MIN_PIN_GAP = 62;

// Washington first (its box overlaps California's longitude), then everything west of -114 is California.
function stateOf(lat, lng) {
  const b = WA_BOUNDS;
  if (lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax) return 'wa';
  return lng < -114 ? 'ca' : 'co';
}

const toPath = (pts, project) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${project(p[0], p[1]).map((n) => n.toFixed(1)).join(',')}`).join(' ') + ' Z';

// Push overlapping pins of one state apart, a few passes, so Colorado's cluster stays tappable.
function declutter(group) {
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const dx = group[b].x - group[a].x, dy = group[b].y - group[a].y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < MIN_PIN_GAP) {
          const push = (MIN_PIN_GAP - d) / 2, ux = dx / d, uy = dy / d;
          group[a].x -= ux * push; group[a].y -= uy * push;
          group[b].x += ux * push; group[b].y += uy * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Everything the map draws, in viewBox units: `paths` and `labels` per state, and one `pin` per hike
 * that has coordinates. A pin's `i` is the hike's index in `hikes`, so its number is `i + 1`.
 */
export function layoutMap(hikes) {
  const project = Object.fromEntries(STATES.map((s) => [s, makeProjector(BOUNDS[s], BOXES[s])]));
  const paths = STATES.map((s) => ({ key: s, d: toPath(OUTLINES[s], project[s]) }));
  const labels = STATES.map((s) => ({
    key: s, text: NAMES[s], x: BOXES[s].x + BOXES[s].w / 2, y: BOXES[s].y - LABEL_RISE[s],
  }));
  const pins = hikes.flatMap((hike, i) => {
    if (!hike.coords) return [];
    const [lat, lng] = hike.coords;
    const state = stateOf(lat, lng);
    const [x, y] = project[state](lat, lng);
    return [{ i, name: hike.name, state, x, y }];
  });
  STATES.forEach((s) => declutter(pins.filter((p) => p.state === s)));
  return { paths, labels, pins };
}

import { useMemo } from 'react';

/**
 * Stylized two-state locator map (pure SVG). Draws the outlines of California
 * and Colorado side by side, each at a legible size, and places each hike as a
 * numbered amber pin at its true position WITHIN its state (with light
 * de-clustering so Colorado's three don't overlap). No tiles / no Leaflet.
 */

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

const VB_W = 1200, VB_H = 600;
const CA_BOX = { x: 45, y: 90, w: 320, h: 470 };
const WA_BOX = { x: 395, y: 40, w: 320, h: 520 };
const CO_BOX = { x: 765, y: 175, w: 360, h: 300 };

export default function HikeMap({ hikes, active, onSelect, visibleIndices }) {
  const { caPath, waPath, coPath, pins } = useMemo(() => {
    const caProj = makeProjector(CA_BOUNDS, CA_BOX);
    const waProj = makeProjector(WA_BOUNDS, WA_BOX);
    const coProj = makeProjector(CO_BOUNDS, CO_BOX);
    const toPath = (pts, proj) => pts.map((p, i) => `${i ? 'L' : 'M'}${proj(p[0], p[1]).map((n) => n.toFixed(1)).join(',')}`).join(' ') + ' Z';

    const pins = hikes
      .map((h, i) => ({ i, name: h.name, lat: h.coords && h.coords[0], lng: h.coords && h.coords[1] }))
      .filter((p) => p.lat != null)
      .map((p) => {
        // assign state projection: Washington (wa), California (ca), otherwise Colorado (co)
        const inWa = p.lat >= WA_BOUNDS.latMin && p.lat <= WA_BOUNDS.latMax && p.lng >= WA_BOUNDS.lngMin && p.lng <= WA_BOUNDS.lngMax;
        const ca = !inWa && p.lng < -114;
        const [x, y] = (inWa ? waProj : (ca ? caProj : coProj))(p.lat, p.lng);
        return { ...p, ca, wa: inWa, x, y };
      });

    // de-cluster within each state
    ['ca', 'wa', 'co'].forEach((st) => {
      const g = pins.filter((p) => (st === 'ca') === p.ca || (st === 'wa') === p.wa || (st === 'co' && !p.ca && !p.wa));
      const minD = 62;
      for (let it = 0; it < 60; it++) {
        let moved = false;
        for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
          let dx = g[b].x - g[a].x, dy = g[b].y - g[a].y, d = Math.hypot(dx, dy) || 0.01;
          if (d < minD) { const push = (minD - d) / 2, ux = dx / d, uy = dy / d; g[a].x -= ux * push; g[a].y -= uy * push; g[b].x += ux * push; g[b].y += uy * push; moved = true; }
        }
        if (!moved) break;
      }
    });

    return { caPath: toPath(CA_OUTLINE, caProj), waPath: toPath(WA_OUTLINE, waProj), coPath: toPath(CO_OUTLINE, coProj), pins };
  }, [hikes]);

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" className="asc-svgmap" aria-label="Hike locations">
      <path d={caPath} className="asc-state" />
      <path d={coPath} className="asc-state" />
      <path d={waPath} className="asc-state" />
      <text x={CA_BOX.x + CA_BOX.w / 2} y={CA_BOX.y - 22} className="asc-map-label" textAnchor="middle">California</text>
      <text x={WA_BOX.x + WA_BOX.w / 2} y={WA_BOX.y - 18} className="asc-map-label" textAnchor="middle">Washington</text>
      <text x={CO_BOX.x + CO_BOX.w / 2} y={CO_BOX.y - 22} className="asc-map-label" textAnchor="middle">Colorado</text>
      {pins.map((p) => {
        const act = p.i === active;
        const visible = !visibleIndices || visibleIndices.has(p.i);
        const s = visible ? 1 : 0.2;
        const style = {
          opacity: visible ? 1 : 0,
          transition: 'transform .8s cubic-bezier(.2,.9,.2,1), opacity .6s .08s',
          pointerEvents: visible ? 'auto' : 'none',
        };
        // Use SVG transform attribute to preserve the translated position and apply scaling
        const transformAttr = `translate(${p.x}, ${p.y}) scale(${s})`;
        return (
          <g key={p.i} transform={transformAttr} style={style} className={'asc-svgpin' + (act ? ' is-active' : '')} onClick={() => onSelect && onSelect(p.i)}>
            <circle r={act ? 30 : 24} />
            <text textAnchor="middle" dominantBaseline="central">{p.i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

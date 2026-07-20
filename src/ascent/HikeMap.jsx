import { useMemo } from 'react';

/**
 * Stylized two-state locator map (pure SVG). Draws the outlines of California
 * and Colorado side by side, each at a legible size, and places each hike as a
 * numbered amber pin at its true position WITHIN its state (with light
 * de-clustering so Colorado's three don't overlap). No tiles / no Leaflet.
 */

const CA_BOUNDS = { latMin: 32.5, latMax: 42.0, lngMin: -124.45, lngMax: -114.1 };
const CO_BOUNDS = { latMin: 37.0, latMax: 41.0, lngMin: -109.06, lngMax: -102.04 };

// simplified California silhouette (lat, lng), clockwise from the NW corner
const CA_OUTLINE = [
  [42.0, -124.21], [40.0, -124.35], [38.3, -123.0], [37.2, -122.42], [36.0, -121.5],
  [34.45, -120.47], [34.02, -118.5], [33.2, -117.4], [32.53, -117.13], [32.62, -114.72],
  [34.3, -114.14], [35.0, -114.63], [36.15, -114.05], [39.0, -120.0], [42.0, -120.0],
];
const CO_OUTLINE = [
  [41.0, -109.06], [41.0, -102.04], [37.0, -102.04], [37.0, -109.06],
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

const VB_W = 1000, VB_H = 600;
const CA_BOX = { x: 55, y: 90, w: 360, h: 470 };
const CO_BOX = { x: 545, y: 175, w: 410, h: 300 };

export default function HikeMap({ hikes, active, onSelect }) {
  const { caPath, coPath, pins } = useMemo(() => {
    const caProj = makeProjector(CA_BOUNDS, CA_BOX);
    const coProj = makeProjector(CO_BOUNDS, CO_BOX);
    const toPath = (pts, proj) => pts.map((p, i) => `${i ? 'L' : 'M'}${proj(p[0], p[1]).map((n) => n.toFixed(1)).join(',')}`).join(' ') + ' Z';

    const pins = hikes
      .map((h, i) => ({ i, name: h.name, lat: h.coords && h.coords[0], lng: h.coords && h.coords[1] }))
      .filter((p) => p.lat != null)
      .map((p) => {
        const ca = p.lng < -114;
        const [x, y] = (ca ? caProj : coProj)(p.lat, p.lng);
        return { ...p, ca, x, y };
      });

    // de-cluster within each state
    ['ca', 'co'].forEach((st) => {
      const g = pins.filter((p) => (st === 'ca') === p.ca);
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

    return { caPath: toPath(CA_OUTLINE, caProj), coPath: toPath(CO_OUTLINE, coProj), pins };
  }, [hikes]);

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" className="asc-svgmap" aria-label="Hike locations">
      <path d={caPath} className="asc-state" />
      <path d={coPath} className="asc-state" />
      <text x={CA_BOX.x + CA_BOX.w / 2} y={CA_BOX.y - 22} className="asc-map-label" textAnchor="middle">California</text>
      <text x={CO_BOX.x + CO_BOX.w / 2} y={CO_BOX.y - 22} className="asc-map-label" textAnchor="middle">Colorado</text>
      {pins.map((p) => {
        const act = p.i === active;
        return (
          <g key={p.i} transform={`translate(${p.x}, ${p.y})`} className={'asc-svgpin' + (act ? ' is-active' : '')} onClick={() => onSelect && onSelect(p.i)}>
            <circle r={act ? 30 : 24} />
            <text textAnchor="middle" dominantBaseline="central">{p.i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

import { describe, expect, it } from 'vitest';

import { NEXT_CLIMB } from '../content.js';
import { ASCENT, buildRoute, labelAnchors } from './route.js';
import { layoutLines, parseTerrain } from './terrain.js';
import { routeJson, syntheticTerrainJson, terrainJson } from './testData.js';

const terrain = parseTerrain(syntheticTerrainJson());
const layout = layoutLines(terrain, 800, 300, false);

// Up the south side to the summit, and down the east side.
const SMALL_ROUTE = {
  waypoints: [
    { name: 'Gate', col: 8, row: 26, kind: 'gate' },
    { name: 'Camp', col: 14, row: 19, kind: 'camp' },
    { name: 'Rock', col: 17, row: 15, kind: 'landmark' },
    { name: 'Top', col: 20, row: 12, kind: 'summit' },
    { name: 'Exit', col: 28, row: 27, kind: 'gate' },
  ],
  ascent: [[8, 26], [11, 22.5], [14, 19], [17, 15], [20, 12]],
  descent: [[20, 12], [24, 18], [28, 27]],
};

const route = buildRoute(SMALL_ROUTE, layout);

/** The bucket (line index) each dense point's segment is filed under, or -1 for none. */
function bucketOf(built) {
  const out = new Array(built.count).fill(-1);
  built.segB.forEach((list, i) => list.forEach((m) => { out[m] = i; }));
  return out;
}

describe('buildRoute: the dense route', () => {
  it('walks up and then down, never back to the ascent', () => {
    expect(route.count).toBeGreaterThan(100);
    const legs = Array.from(route.leg);
    expect(legs[0]).toBe(ASCENT);
    expect(legs.at(-1)).not.toBe(ASCENT);
    const turn = legs.findIndex((l) => l !== ASCENT);
    expect(legs.slice(turn).every((l) => l !== ASCENT)).toBe(true);
  });

  it('steps about a pixel at a time, and the distance walked only grows', () => {
    for (let m = 1; m < route.count; m += 1) {
      const step = Math.hypot(route.x[m] - route.x[m - 1], route.y[m] - route.y[m - 1]);
      expect(step).toBeLessThan(2);
      expect(route.cum[m]).toBeGreaterThanOrEqual(route.cum[m - 1]);
    }
    expect(route.total).toBe(route.cum[route.count - 1]);
  });

  it('turns at the summit: the way up ends where the way down begins', () => {
    const turn = Array.from(route.leg).findIndex((l) => l !== ASCENT);
    expect(route.x[turn]).toBeCloseTo(route.x[turn - 1], 3);
    expect(route.y[turn]).toBeCloseTo(route.y[turn - 1], 3);
    expect(route.ascentLength).toBeCloseTo(route.cum[turn - 1], 6);
    expect(route.ascentLength).toBeGreaterThan(0);
    expect(route.ascentLength).toBeLessThan(route.total);
  });

  it('puts the summit of the route on the summit of the drawing', () => {
    const [x, y] = layout.drape(...terrain.summit);
    const turn = Array.from(route.leg).findIndex((l) => l !== ASCENT);
    expect(route.x[turn - 1]).toBeCloseTo(x, 2);
    expect(route.y[turn - 1]).toBeCloseTo(y, 2);
  });

  it('dots only the way down: a dash pattern of about 55 percent drawn', () => {
    let ascDashed = 0;
    let down = 0;
    let downDashed = 0;
    for (let m = 1; m < route.count; m += 1) {
      if (route.leg[m] === ASCENT) ascDashed += route.dash[m];
      else if (route.leg[m - 1] === ASCENT) continue; // the turn is not a segment
      else {
        down += 1;
        downDashed += route.dash[m];
      }
    }
    expect(ascDashed).toBe(0);
    expect(downDashed / down).toBeGreaterThan(0.4);
    expect(downDashed / down).toBeLessThan(0.7);
  });
});

describe('buildRoute: filing segments under the line behind them', () => {
  it('files every segment exactly once, apart from the turn at the summit', () => {
    const filed = route.segB.flat();
    expect(filed).toHaveLength(route.count - 2);
    expect(new Set(filed).size).toBe(filed.length);
    expect(filed).not.toContain(0);
    expect(route.segB).toHaveLength(layout.N);
  });

  it('files in order along a straight climb to the back: later segments sit under earlier lines', () => {
    // due north up the plain: row 27 down to row 3 in one go, so the line index only falls
    const north = buildRoute({ waypoints: [], ascent: [[5, 27], [5, 3]], descent: [] }, layout);
    const buckets = bucketOf(north).slice(1);
    for (let m = 1; m < buckets.length; m += 1) expect(buckets[m]).toBeLessThanOrEqual(buckets[m - 1]);
    expect(buckets[0]).toBeGreaterThan(buckets.at(-1));
    expect(buckets[0]).toBeLessThanOrEqual(layout.N - 1);
    expect(buckets.at(-1)).toBeGreaterThanOrEqual(0);
  });
});

describe('buildRoute: camp dots', () => {
  const byName = Object.fromEntries(route.waypoints.map((w) => [w.name, w]));

  it('has a dot for each gate, camp and the summit, and none for a landmark', () => {
    expect(route.waypoints.map((w) => w.name)).toEqual(['Gate', 'Camp', 'Top', 'Exit']);
    expect(route.dotB.flat()).toHaveLength(4);
  });

  it('reaches each dot in order along the route', () => {
    expect(byName.Gate.at).toBeLessThan(2);
    expect(byName.Camp.at).toBeGreaterThan(byName.Gate.at);
    expect(byName.Top.at).toBeGreaterThan(byName.Camp.at);
    expect(byName.Top.at).toBeCloseTo(route.ascentLength, 0);
    expect(byName.Exit.at).toBeCloseTo(route.total, 0);
  });

  it('makes the summit dot the biggest', () => {
    expect(byName.Top.r).toBeGreaterThan(byName.Camp.r);
  });

  it('files each dot under the line it stands on', () => {
    for (const w of route.waypoints) {
      const i = route.dotB.findIndex((list) => list.includes(w));
      expect(i).toBeGreaterThanOrEqual(0);
      const row = SMALL_ROUTE.waypoints.find((p) => p.name === w.name).row;
      expect(i).toBe(Math.floor((row / (terrain.rows - 1)) * (layout.N - 1)));
    }
  });
});

describe('buildRoute: no route', () => {
  it('is empty and harmless when the route did not load', () => {
    const none = buildRoute(null, layout);
    expect(none.count).toBe(0);
    expect(none.waypoints).toEqual([]);
    expect(none.total).toBe(1);
    expect(none.ascentLength).toBe(0);
    expect(none.segB).toHaveLength(layout.N);
    expect(none.dotB.flat()).toEqual([]);
  });

  it('treats a route with fewer than two points as none', () => {
    expect(buildRoute({ waypoints: [], ascent: [[5, 5]], descent: [] }, layout).count).toBe(0);
  });
});

describe('labelAnchors', () => {
  it('lifts the peak label 6px above the summit dot and Mawenzi 5px above its ridge', () => {
    const at = labelAnchors(layout, route, terrain);
    const top = route.waypoints.find((w) => w.kind === 'summit');
    expect(at.peak).toEqual({ x: top.x, y: top.y - 6 });
    const [mx, my] = layout.drape(...terrain.mawenzi);
    expect(at.mawenzi).toEqual({ x: mx, y: my - 5 });
  });

  it('falls back to the summit grid position without a route', () => {
    const at = labelAnchors(layout, buildRoute(null, layout), terrain);
    const [x, y] = layout.drape(...terrain.summit);
    expect(at.peak).toEqual({ x, y: y - 6 });
  });
});

describe('the real Machame route on the real terrain', () => {
  const real = parseTerrain(terrainJson());
  const wide = buildRoute(routeJson(), layoutLines(real, 1440, 360, false));
  const phone = buildRoute(routeJson(), layoutLines(real, 375, 290, true));

  it('draws a route of several hundred pixels, most of it on the way up', () => {
    expect(wide.total).toBeGreaterThan(500);
    expect(wide.ascentLength).toBeGreaterThan(wide.total * 0.5);
    expect(wide.ascentLength).toBeLessThan(wide.total);
  });

  it('has a dot for the gates, the camps and the summit, with the labelled ones named as in content.js', () => {
    const names = wide.waypoints.map((w) => w.name);
    expect(names).toContain(NEXT_CLIMB.places.start);
    expect(names).toContain(NEXT_CLIMB.places.camp);
    expect(names).toContain('Uhuru Peak');
    expect(names).not.toContain('Lava Tower');
    expect(phone.waypoints.map((w) => w.name)).toEqual(names);
  });

  it('reaches the summit dot at the end of the way up, then Mweka Gate at the very end', () => {
    const top = wide.waypoints.find((w) => w.kind === 'summit');
    expect(top.at).toBeCloseTo(wide.ascentLength, 0);
    expect(wide.waypoints.at(-1).name).toBe('Mweka Gate');
    expect(wide.waypoints.at(-1).at).toBeCloseTo(wide.total, 0);
  });

  it('keeps every dot inside a phone band', () => {
    for (const w of phone.waypoints.filter((p) => p.name !== 'Machame Gate')) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.x).toBeLessThanOrEqual(375);
    }
  });
});

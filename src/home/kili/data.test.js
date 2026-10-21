import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { flattenTerrain } from '../../../scripts/kili-data.js';
import { NEXT_CLIMB } from '../content.js';
import { PHONE_COLUMNS } from './terrain.js';
import { routeJson, terrainJson } from './testData.js';

const DATA_DIR = fileURLToPath(new URL('../../../public/data/', import.meta.url));
const SOURCE = fileURLToPath(new URL('../../../concepts/_shared/kilimanjaro-full-terrain.json', import.meta.url));
const MAX_EDGE_METRES = 1700;

describe('public/data/kilimanjaro.json', () => {
  const t = terrainJson();
  const [cols, rows] = t.grid;
  const at = (r, c) => t.heights[r * cols + c];

  it('is a 300 x 200 grid with one flat row-major array of whole metres', () => {
    expect(t.grid).toEqual([300, 200]);
    expect(t.heights).toHaveLength(60000);
    expect(t.heights.every((h) => Number.isInteger(h))).toBe(true);
    expect(Array.isArray(t.heights[0])).toBe(false);
  });

  it('gives a phone a slice that starts and ends on the plains, so its edges never show a cut-off slope', () => {
    const colMax = (c) => Math.max(...Array.from({ length: rows }, (_, r) => at(r, c)));
    for (const c of PHONE_COLUMNS) expect(colMax(c), `column ${c}`).toBeLessThan(1800);
  });

  it('keeps the fields the drawing and its credit need, and nothing bulky besides', () => {
    expect(Object.keys(t).sort()).toEqual(['bounds', 'cellMetres', 'grid', 'heights', 'notes', 'points', 'source']);
    expect(t.cellMetres).toBeGreaterThan(200);
    expect(t.source).toMatch(/terrain tiles/i);
    expect(statSync(`${DATA_DIR}kilimanjaro.json`).size).toBeLessThan(350_000);
  });

  it('is the right patch of Tanzania', () => {
    const { west, east, north, south } = t.bounds;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(west).toBeGreaterThan(36.5);
    expect(east).toBeLessThan(38.5);
    expect(north).toBeLessThan(-2.5);
    expect(south).toBeGreaterThan(-3.7);
  });

  it('puts the named peaks inside the grid, with the summit near the highest ground', () => {
    const names = t.points.map((p) => p.name);
    expect(names.some((n) => /Uhuru/.test(n))).toBe(true);
    expect(names.some((n) => /Mawenzi/.test(n))).toBe(true);
    for (const p of t.points) {
      expect(p.col).toBeGreaterThanOrEqual(0);
      expect(p.col).toBeLessThanOrEqual(cols - 1);
      expect(p.row).toBeGreaterThanOrEqual(0);
      expect(p.row).toBeLessThanOrEqual(rows - 1);
    }
    const max = Math.max(...t.heights);
    const top = t.heights.indexOf(max);
    const uhuru = t.points.find((p) => /Uhuru/.test(p.name));
    expect(max).toBeGreaterThan(5800);
    expect(Math.hypot((top % cols) - uhuru.col, Math.floor(top / cols) - uhuru.row)).toBeLessThan(2);
  });

  it('has plains along every edge, under 1,700 m', () => {
    let edgeMax = 0;
    for (let c = 0; c < cols; c += 1) edgeMax = Math.max(edgeMax, at(0, c), at(rows - 1, c));
    for (let r = 0; r < rows; r += 1) edgeMax = Math.max(edgeMax, at(r, 0), at(r, cols - 1));
    expect(edgeMax).toBeLessThan(MAX_EDGE_METRES);
  });

  it('has no hole or spike: neighbouring cells never differ by more than a steep cliff', () => {
    let steepest = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 1; c < cols; c += 1) steepest = Math.max(steepest, Math.abs(at(r, c) - at(r, c - 1)));
    }
    expect(Math.min(...t.heights)).toBeGreaterThan(500);
    expect(steepest).toBeLessThan(600);
  });
});

describe('public/data/kili-route.json', () => {
  const r = routeJson();
  const terrain = terrainJson();
  const [cols, rows] = terrain.grid;
  const inside = ([c, row]) => c >= 0 && c <= cols - 1 && row >= 0 && row <= rows - 1;
  const uhuru = terrain.points.find((p) => /Uhuru/.test(p.name));
  const named = (name) => r.waypoints.find((w) => w.name === name);

  it('keeps every route point and waypoint inside the terrain grid', () => {
    expect(r.ascent.every(inside)).toBe(true);
    expect(r.descent.every(inside)).toBe(true);
    expect(r.waypoints.map((w) => [w.col, w.row]).every(inside)).toBe(true);
  });

  it('starts at Machame Gate, ends the way up at Uhuru Peak, and starts the way down there', () => {
    expect(r.ascent[0]).toEqual([named('Machame Gate').col, named('Machame Gate').row]);
    const top = r.ascent.at(-1);
    expect(top).toEqual([named('Uhuru Peak').col, named('Uhuru Peak').row]);
    expect(Math.hypot(top[0] - uhuru.col, top[1] - uhuru.row)).toBeLessThan(2);
    expect(r.descent[0]).toEqual(top);
    expect(r.descent.at(-1)).toEqual([named('Mweka Gate').col, named('Mweka Gate').row]);
  });

  it('has a summit waypoint, and camp names that content.js can label', () => {
    expect(r.waypoints.filter((w) => w.kind === 'summit')).toHaveLength(1);
    const names = r.waypoints.map((w) => w.name);
    expect(names).toContain(NEXT_CLIMB.places.start);
    expect(names).toContain(NEXT_CLIMB.places.camp);
    expect(names).toContain(NEXT_CLIMB.summit.name);
  });

  it('is seven days with six nights', () => {
    expect(Math.max(...r.waypoints.map((w) => w.day))).toBe(7);
    expect(r.nights).toHaveLength(6);
  });

  it('climbs: the ground rises from the gate to the summit', () => {
    const height = (c, row) => terrain.heights[Math.round(row) * cols + Math.round(c)];
    const [gc, gr] = r.ascent[0];
    const [sc, sr] = r.ascent.at(-1);
    expect(height(sc, sr) - height(gc, gr)).toBeGreaterThan(3500);
  });
});

describe('scripts/kili-data.js', () => {
  it('flattens rows into whole metres, row-major', () => {
    const out = flattenTerrain({
      grid: [3, 2], cellMetres: 300, bounds: {}, points: [], source: 's', name: 'dropped', minEle: 1,
      heights: [[1.4, 2.6, 3], [4, 5.5, 6.49]],
    });
    expect(out.heights).toEqual([1, 3, 3, 4, 6, 6]);
    expect(out.name).toBeUndefined();
    expect(out.minEle).toBeUndefined();
  });

  it('refuses a grid whose rows do not match', () => {
    expect(() => flattenTerrain({ grid: [3, 2], heights: [[1, 2, 3]] })).toThrow('not 3 x 2');
    expect(() => flattenTerrain({ grid: [3, 2], heights: [[1, 2, 3], [1, 2]] })).toThrow('not 3 x 2');
  });

  it.skipIf(!existsSync(SOURCE))('reproduces the committed terrain file from the concept source', () => {
    const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
    expect(flattenTerrain(source)).toEqual(terrainJson());
  });

  it.skipIf(!existsSync(SOURCE))('rounds each height by under half a metre', () => {
    const source = JSON.parse(readFileSync(SOURCE, 'utf8')).heights.flat();
    const flat = terrainJson().heights;
    expect(source.every((h, i) => Math.abs(h - flat[i]) <= 0.5)).toBe(true);
  });
});

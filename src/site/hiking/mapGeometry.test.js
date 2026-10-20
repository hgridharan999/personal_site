import { describe, it, expect } from 'vitest';

import { HIKES } from '../../ascent/data';
import { layoutMap, VB_H, VB_W } from './mapGeometry';

const map = layoutMap(HIKES);
const pinsIn = (state) => map.pins.filter((p) => p.state === state);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('layoutMap', () => {
  it('draws one closed outline and one name per state', () => {
    expect(map.paths.map((p) => p.key).sort()).toEqual(['ca', 'co', 'wa']);
    for (const { d } of map.paths) {
      expect(d).toMatch(/^M[\d.,L -]+ Z$/);
      const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
      expect(nums.length % 2).toBe(0);
      expect(nums.every((n) => n >= 0 && n <= Math.max(VB_W, VB_H))).toBe(true);
    }
    expect(map.labels.map((l) => l.text).sort()).toEqual(['California', 'Colorado', 'Washington']);
  });

  it('gives every hike a pin numbered by its place in the list', () => {
    expect(map.pins).toHaveLength(HIKES.length);
    map.pins.forEach((pin, k) => {
      expect(pin.i).toBe(k);
      expect(pin.name).toBe(HIKES[k].name);
    });
  });

  it('puts each hike in its own state, west to east: California, Washington, Colorado', () => {
    expect(pinsIn('co')).toHaveLength(7);
    expect(pinsIn('ca')).toHaveLength(2);
    expect(pinsIn('wa')).toHaveLength(5);
    const xs = (state) => pinsIn(state).map((p) => p.x);
    expect(Math.max(...xs('ca'))).toBeLessThan(Math.min(...xs('wa')));
    expect(Math.max(...xs('wa'))).toBeLessThan(Math.min(...xs('co')));
  });

  it('keeps every pin inside the viewBox', () => {
    for (const p of map.pins) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(VB_W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(VB_H);
    }
  });

  it('spreads pins of one state apart so none sits on another', () => {
    for (const state of ['ca', 'wa', 'co']) {
      const group = pinsIn(state);
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          expect(gap(group[a], group[b]), `${group[a].name} / ${group[b].name}`).toBeGreaterThan(55);
        }
      }
    }
  });

  it('matches the positions the old Ascent map computed (copied verbatim)', () => {
    const at = (name) => map.pins.find((p) => p.name === name);
    expect(at('Quandary Peak').x).toBeCloseTo(877.75, 1);
    expect(at('Quandary Peak').y).toBeCloseTo(349.35, 1);
    expect(at('Sky Pond').x).toBeCloseTo(928.28, 1);
    expect(at('Seven Falls').y).toBeCloseTo(426.31, 1);
    expect(at('Hurricane Ridge Loop').x).toBeCloseTo(465.27, 1);
  });

  it('skips a hike without coordinates but keeps the others numbered by position', () => {
    const hikes = [{ name: 'A', coords: [39.4, -106.1] }, { name: 'B' }, { name: 'C', coords: [34.4, -119.6] }];
    const { pins } = layoutMap(hikes);
    expect(pins.map((p) => [p.i, p.state])).toEqual([[0, 'co'], [2, 'ca']]);
  });

  it('is pure: the same hikes give the same map, and the input is untouched', () => {
    const snapshot = JSON.stringify(HIKES);
    expect(layoutMap(HIKES)).toEqual(map);
    expect(JSON.stringify(HIKES)).toBe(snapshot);
  });
});

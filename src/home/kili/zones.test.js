import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { NEXT_CLIMB } from '../content.js';
import { mix3 } from './math.js';
import {
  BIN, BLEND, binE, binOf, E0, fillPalette, GLOW, INK, makePalette, NB, ZONES, zoneColor, zoneHex,
} from './zones.js';

const near = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('zone colours', () => {
  it('has the five climates plains up, topped at 1800, 2800, 4000 and 5000 m', () => {
    expect(ZONES.map((z) => z.top)).toEqual([1800, 2800, 4000, 5000, Infinity]);
    expect(ZONES).toHaveLength(NEXT_CLIMB.zones.length);
  });

  it('is the plain zone colour well inside each zone', () => {
    expect(zoneColor(900)).toEqual(ZONES[0].c);
    expect(zoneColor(2300)).toEqual(ZONES[1].c);
    expect(zoneColor(3400)).toEqual(ZONES[2].c);
    expect(zoneColor(4500)).toEqual(ZONES[3].c);
    expect(zoneColor(5800)).toEqual(ZONES[4].c);
  });

  it('is exactly halfway between neighbours on each boundary', () => {
    for (let z = 0; z < ZONES.length - 1; z += 1) {
      expect(near(zoneColor(ZONES[z].top), mix3(ZONES[z].c, ZONES[z + 1].c, 0.5), 1e-6)).toBe(true);
    }
  });

  it('is settled at the edges of the blend and continuous across it', () => {
    expect(zoneColor(1800 - BLEND)).toEqual(ZONES[0].c);
    expect(near(zoneColor(1800 + BLEND), ZONES[1].c, 1e-6)).toBe(true);
    let prev = zoneColor(600);
    for (let e = 610; e <= 6000; e += 10) {
      const c = zoneColor(e);
      expect(Math.max(...c.map((v, i) => Math.abs(v - prev[i])))).toBeLessThan(8);
      prev = c;
    }
  });

  it('prints zone colours as hex', () => {
    expect(zoneHex(0)).toBe('#AA9254');
    expect(zoneHex(4)).toBe('#4E96C8');
  });
});

describe('elevation bins', () => {
  it('has a bin for every elevation from the plains to the summit', () => {
    expect(NB).toBe(Math.ceil((6000 - E0) / BIN) + 1);
    expect(binOf(E0)).toBe(0);
    expect(binOf(E0 + BIN - 0.1)).toBe(0);
    expect(binOf(E0 + BIN)).toBe(1);
    expect(binOf(0)).toBe(0);
    expect(binOf(9000)).toBe(NB - 1);
  });

  it('puts the middle of a bin inside it', () => {
    for (let b = 0; b < NB; b += 1) expect(binOf(binE(b))).toBe(b);
  });
});

describe('the palette', () => {
  const pal = makePalette();

  it('is plain ink before the tide starts', () => {
    fillPalette(pal, -1e9, -1e9, 0);
    for (let b = 0; b < NB; b += 1) {
      expect(pal.c[b]).toBe(`rgb(${INK.join(',')})`);
      expect(pal.a[b]).toBe(1);
      expect(pal.w[b]).toBe(0);
      expect(pal.e[b]).toBe(0);
    }
  });

  it('colours only what the tide has reached', () => {
    fillPalette(pal, 2500, -1e9, 0);
    expect(pal.a[binOf(1000)]).toBeGreaterThan(1.8); // well below the tide: fully coloured
    expect(pal.a[binOf(5500)]).toBe(1); // well above it: still ink
    expect(pal.c[binOf(5500)]).toBe(`rgb(${INK.join(',')})`);
  });

  it('shows the zone colours and the icy edge once the tide is above the summit', () => {
    fillPalette(pal, 6500, -1e9, 0);
    const z = ZONES[1].c;
    expect(pal.c[binOf(2300)]).toBe(`rgb(${z[0]},${z[1]},${z[2]})`);
    expect(pal.e[binOf(5600)]).toBeCloseTo(1, 5);
    expect(pal.e[binOf(3000)]).toBe(0);
  });

  it('lights a band of elevations toward the glow', () => {
    fillPalette(pal, 6500, 3000, 0.55);
    const lit = binOf(3000);
    const dark = binOf(5600);
    expect(pal.w[lit]).toBeGreaterThan(pal.w[dark]);
    const [r] = pal.c[lit].match(/\d+/g).map(Number);
    expect(r).toBeGreaterThan(zoneColor(3000)[0]);
    expect(r).toBeLessThan(GLOW[0] + 1);
  });
});

describe('the legend swatches in kili.css', () => {
  const css = readFileSync(new URL('./kili.css', import.meta.url), 'utf8');

  it('use the same five colours as the canvas', () => {
    ZONES.forEach((_, z) => {
      const rule = css.match(new RegExp(String.raw`\.kili-z${z + 1}\s*\{\s*--z:\s*(#[0-9A-Fa-f]{6})`));
      expect(rule, `kili-z${z + 1}`).not.toBeNull();
      expect(rule[1].toUpperCase()).toBe(zoneHex(z));
    });
  });
});

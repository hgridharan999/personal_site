import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GLOW_BOX, GLOW_DELAY, GLOW_PERCENT, GLOW_PERIOD, GLOW_RING, GLOW_RISE, glowElevation, glowStops, stopTransform,
} from './glow.js';
import { heightAt, layoutLines, parseTerrain } from './terrain.js';
import { LIFE_END } from './timeline.js';
import { syntheticTerrainJson, terrainJson } from './testData.js';

const css = readFileSync(new URL('./kili.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('where the light is, as it rises', () => {
  it('has placements at increasing points of the cycle, the last one before the rise ends', () => {
    expect(GLOW_PERCENT[0]).toBe(0);
    GLOW_PERCENT.forEach((p, k) => { if (k) expect(p).toBeGreaterThan(GLOW_PERCENT[k - 1]); });
    expect(GLOW_PERCENT.at(-1)).toBeLessThan(GLOW_RISE * 100);
  });

  it('climbs from the plains to above the summit, easing like the colour tide', () => {
    expect(glowElevation(0)).toBeCloseTo(250, 6);
    expect(glowElevation(GLOW_RISE * 100)).toBeCloseTo(6750, 6);
    expect(glowElevation(36)).toBeCloseTo(3500, 6);
    GLOW_PERCENT.forEach((p, k) => { if (k) expect(glowElevation(p)).toBeGreaterThan(glowElevation(GLOW_PERCENT[k - 1])); });
  });
});

describe('glowStops', () => {
  const real = parseTerrain(terrainJson());
  const summitHeight = heightAt(real, real.summit[1], real.summit[0]);

  it.each([
    ['desktop', 1440, 360, false],
    ['phone', 375, 290, true],
    ['tablet', 700, 330, false],
  ])('on a %s band: a ring per keyframe that shrinks and climbs onto the summit', (_, w, h, phone) => {
    const layout = layoutLines(real, w, h, phone);
    const stops = glowStops(layout, real.summit, summitHeight);
    expect(stops).toHaveLength(GLOW_PERCENT.length);
    const [sx, sy] = layout.drape(...real.summit);
    for (const s of stops) expect(s.x).toBeCloseTo(layout.colToX(real.summit[0]), 6);
    stops.forEach((s, k) => {
      if (!k) return;
      expect(s.sx).toBeLessThanOrEqual(stops[k - 1].sx);
      expect(s.sy).toBeLessThanOrEqual(stops[k - 1].sy);
      expect(s.y).toBeLessThanOrEqual(stops[k - 1].y + 1e-9);
    });
    // the last placement is a few pixels across, on the summit's own point
    const last = stops.at(-1);
    expect(last.sx * (GLOW_BOX / 2) * GLOW_RING).toBeLessThan(20);
    expect(last.x).toBeCloseTo(sx, 3);
    expect(last.y).toBeCloseTo(sy, 0);
  });

  it('starts as wide as the stage and sitting on the ground under the summit', () => {
    const layout = layoutLines(real, 1440, 360, false);
    const [first] = glowStops(layout, real.summit, summitHeight);
    const unit = (GLOW_BOX / 2) * GLOW_RING;
    expect(first.sx * unit).toBeCloseTo(layout.SW * 0.5, 3);
    const base = layout.lineBase[Math.round(real.summit[1] / (real.rows - 1) * (layout.N - 1))];
    expect(Math.abs(first.y - base)).toBeLessThan(8);
  });

  it('stays inside the band: no ring is placed above its top or below its floor', () => {
    const layout = layoutLines(real, 1440, 360, false);
    for (const s of glowStops(layout, real.summit, summitHeight)) {
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(360);
    }
  });

  it('also works on a made-up mountain and keeps every number finite', () => {
    const t = parseTerrain(syntheticTerrainJson());
    const layout = layoutLines(t, 800, 300, false);
    for (const s of glowStops(layout, t.summit, 5000)) expect(Object.values(s).every(Number.isFinite)).toBe(true);
  });

  it('writes a placement as a CSS transform', () => {
    expect(stopTransform({ x: 12.34, y: 56.78, sx: 1.5, sy: 0.25 })).toBe('translate(12.3px, 56.8px) scale(1.5000, 0.2500)');
  });
});

describe('the light in kili.css', () => {
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
  };
  const keyframes = css.match(/@keyframes kili-glow\s*\{([\s\S]*?\n\})/)?.[1] ?? '';

  it('animates only transform and opacity', () => {
    const props = [...keyframes.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
    expect(props.length).toBeGreaterThan(8);
    expect([...new Set(props)].sort()).toEqual(['opacity', 'transform']);
  });

  it('has a keyframe for each placement, at the same points of the cycle', () => {
    const offsets = [...keyframes.matchAll(/(^|\n)\s*([\d.]+)%\s*\{[^}]*--g(\d)/g)];
    // the final 100% keyframe only holds the last placement for the rest of the cycle
    const placed = offsets.slice(0, -1);
    expect(placed.map((m) => Number(m[2]))).toEqual(GLOW_PERCENT);
    expect(placed.map((m) => Number(m[3]))).toEqual(GLOW_PERCENT.map((_, k) => k));
    expect(Number(offsets.at(-1)[2])).toBe(100);
    expect(Number(offsets.at(-1)[3])).toBe(GLOW_PERCENT.length - 1);
  });

  it('fades in over the first stretch of the rise and out before it ends', () => {
    expect(keyframes).toMatch(/0%\s*\{[^}]*opacity: 0/);
    expect(keyframes).toMatch(/5\.76%\s*\{[^}]*opacity: 1/);
    expect(keyframes).toMatch(/52%\s*\{[^}]*opacity: 0/);
    expect(keyframes).toMatch(/100%\s*\{[^}]*opacity: 0/);
  });

  it('runs an 8 s cycle, starting 0.7 s after the canvas settles, and repeats', () => {
    expect(GLOW_PERIOD).toBe(8);
    expect(GLOW_DELAY).toBeCloseTo(0.7, 6);
    expect(LIFE_END + GLOW_DELAY).toBeCloseTo(4.4, 6);
    expect(rule('.hm .kili-glow i')).toMatch(/animation: kili-glow 8s linear 0\.7s infinite/);
  });

  it('lifts the lines with a warm light that leaves white alone (screen blend over a white band)', () => {
    expect(rule('.hm .kili-glow i')).toContain('mix-blend-mode: screen');
    expect(rule('.hm .kili-glow i')).toMatch(/rgba\(255, 246, 225/);
    expect(rule('.hm .kili-band')).toMatch(/isolation: isolate/);
    expect(rule('.hm .kili-band')).toMatch(/background: var\(--bg\)/);
  });

  it('puts the ring peak where glow.js assumes, on a 200px box', () => {
    const body = rule('.hm .kili-glow i');
    expect(body).toMatch(new RegExp(`width: ${GLOW_BOX}px; height: ${GLOW_BOX}px`));
    expect(body).toMatch(new RegExp(`left: -${GLOW_BOX / 2}px; top: -${GLOW_BOX / 2}px`));
    expect(body).toMatch(new RegExp(`rgba\\(255, 246, 225, 0\\.\\d+\\) ${GLOW_RING * 100}%`));
  });

  it('stays hidden until draw.js starts it, and stops moving when it is told to hold', () => {
    expect(rule('.hm .kili-glow')).toContain('display: none');
    expect(rule('.hm .kili-glow[data-glow]')).toContain('display: block');
    expect(rule('.hm .kili-glow[data-glow="hold"] i')).toContain('animation-play-state: paused');
  });

  it('is not shown at all under reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.hm \.kili-glow \{ display: none !important; \}\s*\}/);
  });

  it('never takes the pointer', () => {
    expect(rule('.hm .kili-glow')).toContain('pointer-events: none');
  });
});

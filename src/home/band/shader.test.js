import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BERG } from './iceberg.js';
import { VS, buildFragmentShader } from './shader/index.js';
import { WAKE } from './wake.js';

const SIZES = [24, 16, 8, 0];
const renderer = readFileSync(new URL('./renderer.js', import.meta.url), 'utf8');
const declaredUniforms = (src) => [...src.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)].map((m) => m[1]);
const count = (src, ch) => src.split(ch).length - 1;

describe.each(SIZES)('fragment shader with TRAIL_N = %i', (n) => {
  const src = buildFragmentShader(n);

  it('defines TRAIL_N to match', () => {
    expect(src).toMatch(new RegExp(`^#define TRAIL_N ${n}$`, 'm'));
    expect(src.match(/#define TRAIL_N/g)).toHaveLength(1);
  });

  it('has no leftover ripple array', () => {
    expect(src).not.toContain('uRip');
  });

  it('balances its braces, parentheses and brackets', () => {
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      expect(count(src, open)).toBe(count(src, close));
    }
    expect(count(VS, '{')).toBe(count(VS, '}'));
  });

  it('declares only uniforms that renderer.js looks up', () => {
    const names = declaredUniforms(src);
    expect(names).toContain('uRes');
    for (const name of names) expect(renderer, `${name} is never looked up`).toContain(`'${name}'`);
  });

  it('keeps every preprocessor conditional closed', () => {
    const opens = (src.match(/^#if/gm) ?? []).length;
    const ends = (src.match(/^#endif/gm) ?? []).length;
    expect(opens).toBe(ends);
  });
});

describe('the wake in the shader', () => {
  it('declares a uniform array of exactly TRAIL_N entries and loops over its segments', () => {
    const src = buildFragmentShader(16);
    expect(src).toContain('uniform vec4  uTrail[TRAIL_N];');
    expect(src).toContain('uniform vec4  uTrailBox;');
    expect(src).toContain('for (int i = 0; i < TRAIL_N - 1; i++)');
    expect(src).toContain('wakeField(p, disp, rh);');
  });

  it('compiles the whole wake out at TRAIL_N 0, leaving only the press ring', () => {
    const src = buildFragmentShader(0);
    for (const gone of ['uTrail', 'uTrailBox', 'wakeField', 'WAKE_']) expect(src).not.toContain(gone);
    expect(src).toContain('uniform vec4  uTap;');
    expect(src).toContain('tapRing(p, disp, rh);');
  });

  it('generates every WAKE_* define from the WAKE object, as valid GLSL floats', () => {
    const src = buildFragmentShader(8);
    const def = (name) => {
      const hit = src.match(new RegExp(`^#define ${name} (\\S+)$`, 'm'));
      expect(hit, `${name} is not defined`).not.toBeNull();
      expect(hit[1]).toMatch(/^(\d+\.\d*|\d*\.\d+|\d+e-?\d+)$/); // "70" alone would be an int
      return Number(hit[1]);
    };
    expect(def('WAKE_W0')).toBe(WAKE.w0);
    expect(def('WAKE_SPREAD')).toBe(WAKE.spread);
    expect(def('WAKE_C')).toBe(WAKE.c);
    expect(def('WAKE_K')).toBe(WAKE.k);
    expect(def('WAKE_RIP')).toBe(WAKE.rip);
    expect(def('WAKE_REACH')).toBe(WAKE.reach);
    expect(def('WAKE_AMIN')).toBe(WAKE.ampMin);
    // the soft-max floor depends on precision: 1e-6 on highp, 1e-4 on mediump
    const eps = src.match(/#ifdef GL_FRAGMENT_PRECISION_HIGH\n#define WAKE_EPS (\S+)\n#define WAKE_SEG \S+\n#else\n#define WAKE_EPS (\S+)/);
    expect(Number(eps[1])).toBe(1e-6);
    expect(Number(eps[2])).toBe(1e-4);
  });

  it('blends segments by a sharp soft maximum, not by a sum or a min (a soft one beads at the joints)', () => {
    const src = buildFragmentShader(8);
    expect(src).toContain('float wt = amp * amp * exp(-2.0 * d * d / (w * w));');
    expect(src).toContain('sw += wt; sh += wt * h; sdv += wt * h * dv / (d + w);');
    // dv / (d + w): the direction has to vanish on the path, or the ice tears along it
    expect(src).not.toContain('sdv += wt * h * dv / (d + 1e-4)');
    expect(src).toContain('float inv = 1.0 / max(sw, WAKE_EPS);');
    expect(src).toContain('rh += sh * inv; disp += sdv * inv;');
  });

  it('keeps the polygon edges unrolled, one per vertex', () => {
    const src = buildFragmentShader(8);
    expect(src.match(/^\s*edge\(p, V\d+, V\d+, d, s\);$/gm)).toHaveLength(BERG.length);
    expect(src.match(/^const vec2 V\d+ =/gm)).toHaveLength(BERG.length);
  });
});

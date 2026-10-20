import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BERG } from './iceberg.js';
import { VS, buildFragmentShader } from './shader/index.js';
import { FIELD, SHADE, SPLASH, SURFACE } from './water/constants.js';
import { ENC } from './water/pack.js';

const SIZES = [32, 16, 8, 0];
const renderer = readFileSync(new URL('./renderer.js', import.meta.url), 'utf8');
const declaredUniforms = (src) => [...src.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)].map((m) => m[1]);
const count = (src, ch) => src.split(ch).length - 1;

/** The value of `#define NAME value` as a number, checking it is a valid GLSL float literal ("70" alone would be an int). */
function define(src, name) {
  const hit = src.match(new RegExp(`^#define ${name} (\\S+)$`, 'm'));
  expect(hit, `${name} is not defined`).not.toBeNull();
  expect(hit[1]).toMatch(/^(\d+\.\d*|\d*\.\d+|\d+e-?\d+)$/);
  return Number(hit[1]);
}

describe.each(SIZES)('fragment shader with DROP_N = %i', (n) => {
  const src = buildFragmentShader(n);

  it('defines DROP_N to match', () => {
    expect(src).toMatch(new RegExp(`^#define DROP_N ${n}$`, 'm'));
    expect(src.match(/#define DROP_N/g)).toHaveLength(1);
  });

  it('has no leftover ripple array, trail, tap ring or wake', () => {
    for (const gone of ['uRip', 'uTrail', 'uTap', 'WAKE_', 'wakeField', 'tapRing']) expect(src).not.toContain(gone);
  });

  it('balances its braces, parentheses and brackets', () => {
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      expect(count(src, open)).toBe(count(src, close));
    }
    expect(count(VS, '{')).toBe(count(VS, '}'));
  });

  it('declares only uniforms that renderer.js looks up, with no precision qualifier before the name', () => {
    const names = declaredUniforms(src);
    expect(names).toEqual(expect.arrayContaining(['uRes', 'uT', 'uSim', 'uSurf', 'uField']));
    for (const name of names) expect(renderer, `${name} is never looked up`).toContain(`'${name}'`);
    expect(src).not.toMatch(/uniform\s+(lowp|mediump|highp)/);
  });

  it('declares the two samplers and reads them only while the simulation is running (uSim.y > 0.5)', () => {
    expect(src).toContain('uniform sampler2D uSurf;');
    expect(src).toContain('uniform sampler2D uField;');
    expect(src).toContain('if (uSim.y > 0.5) { surfaceAt(p.x, eta, slope, foam); if (p.y > WL - SURF_ETA) fieldAt(p, disp, rh); }');
    expect(src).not.toMatch(/\n\s*surfaceAt\(p\.x/); // the only call is inside that guard
  });

  it('gives samplers a default precision so the byte decode cannot overflow lowp', () => {
    expect(src).toContain('precision highp sampler2D;');
    expect(src).toContain('precision mediump sampler2D;');
  });

  it('keeps every preprocessor conditional closed', () => {
    const opens = (src.match(/^#if/gm) ?? []).length;
    const ends = (src.match(/^#endif/gm) ?? []).length;
    expect(opens).toBe(ends);
  });

  it('keeps the polygon edges unrolled, one per vertex', () => {
    expect(src.match(/^\s*edge\(p, V\d+, V\d+, d, s\);$/gm)).toHaveLength(BERG.length);
    expect(src.match(/^const vec2 V\d+ =/gm)).toHaveLength(BERG.length);
  });
});

describe('the drops', () => {
  it('are a uniform array of exactly DROP_N entries, with a bounding box, drawn last and only while running', () => {
    const src = buildFragmentShader(16);
    expect(src).toContain('uniform vec4  uDrop[DROP_N];');
    expect(src).toContain('uniform vec4  uDropBox;');
    expect(src).toContain('for (int i = 0; i < DROP_N; i++)');
    expect(src).toContain('if (d.y > -5.0)');
    expect(src).toContain('if (uSim.y > 0.5) dropsOver(p, px, below, col);');
    expect(src.indexOf('dropsOver(p, px, below, col);')).toBeGreaterThan(src.indexOf('foam * below'));
    expect(src.indexOf('dropsOver(p, px, below, col);')).toBeLessThan(src.indexOf('floor: slightly darker'));
  });

  it('are compiled out at DROP_N 0: no uDrop, no uDropBox, no dropsOver, no DROP_ defines', () => {
    const src = buildFragmentShader(0);
    for (const gone of ['uDrop', 'uDropBox', 'dropsOver', 'DROP_RMIN', 'DROP_SEG']) expect(src).not.toContain(gone);
    expect(src).toContain('uniform vec4  uSim;');
  });

  it('use the same size formula as the JS pool (RMIN, RMAX and the golden ratio)', () => {
    const src = buildFragmentShader(8);
    expect(define(src, 'DROP_RMIN')).toBe(SPLASH.rMin);
    expect(define(src, 'DROP_RMAX')).toBe(SPLASH.rMax);
    expect(src).toContain('fract(float(i) * 0.618034)');
  });

  it('floors the streak maths per precision: 1e-8 on highp and 1e-4 on mediump', () => {
    const src = buildFragmentShader(8);
    const hit = src.match(/#ifdef GL_FRAGMENT_PRECISION_HIGH\n#define DROP_SEG (\S+)\n#else\n#define DROP_SEG (\S+)\n#endif/);
    expect(Number(hit[1])).toBe(1e-8);
    expect(Number(hit[2])).toBe(1e-4);
  });
});

describe('the water defines are generated from the JS constants', () => {
  const src = buildFragmentShader(8);

  it('as float literals that equal them', () => {
    expect(define(src, 'SURF_ETA')).toBe(SURFACE.etaScale);
    expect(define(src, 'SURF_SLOPE')).toBe(SURFACE.slopeScale);
    expect(define(src, 'SURF_SWAY')).toBe(SURFACE.sway);
    expect(define(src, 'ENC_ZERO')).toBe(ENC.zero);
    expect(define(src, 'ENC_SCALE')).toBe(ENC.scale);
    expect(define(src, 'FIELD_H')).toBe(FIELD.depth);
    expect(define(src, 'FIELD_RH')).toBe(SHADE.fieldRh);
    expect(define(src, 'FIELD_DISP')).toBe(SHADE.fieldDisp);
    expect(define(src, 'CREST_GAIN')).toBe(SHADE.crest);
    expect(define(src, 'CREST_FALL')).toBe(SHADE.crestFall);
    expect(define(src, 'FOAM_GAIN')).toBe(SHADE.foam);
    expect(define(src, 'FOAM_FALL')).toBe(SHADE.foamFall);
  });

  it('and the lookups mirror the encoder: dec() undoes the byte encoding around 128', () => {
    expect(src).toContain('float dec(float b){ return (b * 255.0 - ENC_ZERO) / ENC_SCALE; }');
  });
});

describe('what the water does to the picture', () => {
  const src = buildFragmentShader(8);

  it('lifts the waterline by the simulated height (and the old ripple term is gone)', () => {
    expect(src).toMatch(/\+ 0\.0016 \* sin\(p\.x \* 33\.0 \+ t \* 1\.9 \+ 0\.4\) - eta;/);
    expect(src).not.toContain('0.011 * rh');
  });

  it('sways the caustics with the slope, and keeps the field\'s ripples bending the light', () => {
    expect(src).toContain('warp += vec2(SURF_SWAY * slope * clamp(p.y - wl, 0.0, 0.3), 0.0);');
    expect(src).toContain('+ 0.075 * disp;');
    expect(src).toContain('vec2 pb = p + (shim + 0.05 * disp) * uw;');
    expect(src).toContain('col += vec3(0.60, 0.90, 1.0) * rh * 0.30 * below;');
  });

  it('thins the hairline on steep water, lights crests before it, and lays foam after it', () => {
    const crest = src.indexOf('max(eta, 0.0) / SURF_ETA * CREST_GAIN');
    const hair = src.indexOf('float lineD = z * inversesqrt(1.0 + slope * slope);');
    const foam = src.indexOf('foam * below * exp(-max(z, 0.0) / FOAM_FALL) * FOAM_GAIN');
    expect(crest).toBeGreaterThan(0);
    expect(hair).toBeGreaterThan(crest);
    expect(foam).toBeGreaterThan(hair);
  });

  it('clamps the argument of every exp that depends on depth, so it cannot overflow', () => {
    expect(src).toContain('exp(-max(z, 0.0) / CREST_FALL)');
    expect(src).toContain('exp(-max(z, 0.0) / FOAM_FALL)');
  });
});

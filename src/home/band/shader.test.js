import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BERG } from './iceberg.js';
import { VS, buildFragmentShader } from './shader/index.js';
import { FIELD, SHADE, SURFACE } from './water/constants.js';
import { ENC } from './water/pack.js';

const src = buildFragmentShader();
const renderer = readFileSync(new URL('./renderer.js', import.meta.url), 'utf8');
const declaredUniforms = (code) => [...code.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)].map((m) => m[1]);
const count = (code, ch) => code.split(ch).length - 1;

/** The value of `#define NAME value` as a number, checking it is a valid GLSL float literal ("70" alone would be an int). */
function define(name) {
  const hit = src.match(new RegExp(`^#define ${name} (\\S+)$`, 'm'));
  expect(hit, `${name} is not defined`).not.toBeNull();
  expect(hit[1]).toMatch(/^(\d+\.\d*|\d*\.\d+|\d+e-?\d+)$/);
  return Number(hit[1]);
}

describe('fragment shader', () => {
  it('has no leftover ripple array, trail, tap ring, wake or drops', () => {
    for (const gone of ['uRip', 'uTrail', 'uTap', 'WAKE_', 'wakeField', 'tapRing', 'uDrop', 'DROP_', 'dropsOver']) {
      expect(src).not.toContain(gone);
    }
  });

  it('balances its braces, parentheses and brackets', () => {
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      expect(count(src, open)).toBe(count(src, close));
    }
    expect(count(VS, '{')).toBe(count(VS, '}'));
  });

  it('declares only uniforms that renderer.js looks up, with no precision qualifier before the name', () => {
    const names = declaredUniforms(src);
    expect(names.sort()).toEqual(['uField', 'uRes', 'uSim', 'uSurf', 'uT']);
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

describe('the water defines are generated from the JS constants', () => {
  it('as float literals that equal them', () => {
    expect(define('SURF_ETA')).toBe(SURFACE.etaScale);
    expect(define('SURF_SLOPE')).toBe(SURFACE.slopeScale);
    expect(define('SURF_SWAY')).toBe(SURFACE.sway);
    expect(define('BERG_REFRACT')).toBe(SHADE.bergRefract);
    expect(define('ICE_RING')).toBe(SHADE.iceRing);
    expect(define('ENC_ZERO')).toBe(ENC.zero);
    expect(define('ENC_SCALE')).toBe(ENC.scale);
    expect(define('FIELD_H')).toBe(FIELD.depth);
    expect(define('FIELD_RH')).toBe(SHADE.fieldRh);
    expect(define('FIELD_DISP')).toBe(SHADE.fieldDisp);
    expect(define('CREST_GAIN')).toBe(SHADE.crest);
    expect(define('CREST_FALL')).toBe(SHADE.crestFall);
    expect(define('FOAM_GAIN')).toBe(SHADE.foam);
    expect(define('FOAM_FALL')).toBe(SHADE.foamFall);
  });

  it('and the lookups mirror the encoder: dec() undoes the byte encoding around 128', () => {
    expect(src).toContain('float dec(float b){ return (b * 255.0 - ENC_ZERO) / ENC_SCALE; }');
  });
});

describe('what the water does to the picture', () => {
  it('lifts the waterline by the simulated height (and the old ripple term is gone)', () => {
    expect(src).toMatch(/\+ 0\.0016 \* sin\(p\.x \* 33\.0 \+ t \* 1\.9 \+ 0\.4\) - eta;/);
    expect(src).not.toContain('0.011 * rh');
  });

  it('sways the caustics with the slope, and keeps the field\'s ripples bending the light', () => {
    expect(src).toContain('warp += vec2(SURF_SWAY * slope * clamp(p.y - wl, 0.0, 0.3), 0.0);');
    expect(src).toContain('+ 0.075 * disp;');
    // the ice's own outline and facets are barely shifted by the ripples (that was the jelly look); the caustics on it still are
    expect(src).toContain('vec2 pb = p + (shim + BERG_REFRACT * disp) * uw;');
    expect(src).not.toContain('0.05 * disp');
    expect(src).toContain('warp * 0.6');
    expect(src).toContain('col += vec3(0.60, 0.90, 1.0) * rh * 0.30 * below * (1.0 - iceCov);');
    // and the rings show over the ice too: the ice is mixed in first, then the rings shade it
    expect(src.indexOf('col *= 1.0 + ICE_RING * clamp(rh, -0.7, 0.7) * iceCov * below * vec3(1.0, 0.8, 0.6);')).toBeGreaterThan(src.indexOf('iceCov = inside * inA;'));
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

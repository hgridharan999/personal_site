import { ENC } from '../water/pack.js';
import { FIELD, SHADE, SURFACE } from '../water/constants.js';

/*
 * GLSL for the simulated water. The simulation runs on the CPU; the shader only reads it back:
 * the waterline's height, slope and foam from one N x 1 texture, and the ripples under it from one
 * 2D texture. Every constant is generated from the JS objects, so the two sides cannot drift apart.
 */

/** A GLSL float literal ("70" would be an int and fail to compile). */
const num = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export function waterDefines() {
  return [
    `#define SURF_ETA ${num(SURFACE.etaScale)}`,
    `#define SURF_SLOPE ${num(SURFACE.slopeScale)}`,
    `#define SURF_SWAY ${num(SURFACE.sway)}`,
    `#define BERG_REFRACT ${num(SHADE.bergRefract)}`,
    `#define ICE_RING ${num(SHADE.iceRing)}`,
    `#define ENC_ZERO ${num(ENC.zero)}`,
    `#define ENC_SCALE ${num(ENC.scale)}`,
    `#define FIELD_H ${num(FIELD.depth)}`,
    `#define FIELD_RH ${num(SHADE.fieldRh)}`,
    `#define FIELD_DISP ${num(SHADE.fieldDisp)}`,
    `#define CREST_GAIN ${num(SHADE.crest)}`,
    `#define CREST_FALL ${num(SHADE.crestFall)}`,
    `#define FOAM_GAIN ${num(SHADE.foam)}`,
    `#define FOAM_FALL ${num(SHADE.foamFall)}`,
  ].join('\n');
}

export const WATER_UNIFORMS = [
  'uniform vec2  uSim;      // x = half the band aspect, y = 1 while anything moves (0 = a calm frame)',
  'uniform sampler2D uSurf;  // the waterline, one texel per column: R = eta, G = slope (signed), A = foam',
  'uniform sampler2D uField; // the water under it: R = ripple height, G/B = its gradient (signed)',
].join('\n');

/** The two lookups. `dec` undoes the byte encoding (0 is exactly 128). */
export const SAMPLERS = `
float dec(float b){ return (b * 255.0 - ENC_ZERO) / ENC_SCALE; }

void surfaceAt(float x, out float eta, out float slope, out float foam){
  vec4 s = texture2D(uSurf, vec2(x / (2.0 * uSim.x) + 0.5, 0.5));
  eta = dec(s.r) * SURF_ETA;
  slope = dec(s.g) * SURF_SLOPE;
  foam = s.a;
}

void fieldAt(vec2 p, inout vec2 disp, inout float rh){
  vec4 f = texture2D(uField, vec2(p.x / (2.0 * uSim.x) + 0.5, (p.y - WL) / FIELD_H));
  rh += dec(f.r) * FIELD_RH;
  disp += vec2(dec(f.g), dec(f.b)) * FIELD_DISP;
}
`;

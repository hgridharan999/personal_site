import { ENC } from '../water/pack.js';
import { FIELD, SHADE, SPLASH, SURFACE } from '../water/constants.js';

/*
 * GLSL for the simulated water. The simulation runs on the CPU; the shader only reads it back:
 * the waterline's height, slope and foam from one N x 1 texture, the ripples under it from one 2D
 * texture, and the splash drops from a uniform array. Every constant is generated from the JS
 * objects, so the two sides cannot drift apart.
 */

/** A GLSL float literal ("70" would be an int and fail to compile). */
const num = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export function waterDefines(dropN) {
  const lines = [
    `#define SURF_ETA ${num(SURFACE.etaScale)}`,
    `#define SURF_SLOPE ${num(SURFACE.slopeScale)}`,
    `#define SURF_SWAY ${num(SURFACE.sway)}`,
    `#define ENC_ZERO ${num(ENC.zero)}`,
    `#define ENC_SCALE ${num(ENC.scale)}`,
    `#define FIELD_H ${num(FIELD.depth)}`,
    `#define FIELD_RH ${num(SHADE.fieldRh)}`,
    `#define FIELD_DISP ${num(SHADE.fieldDisp)}`,
    `#define CREST_GAIN ${num(SHADE.crest)}`,
    `#define CREST_FALL ${num(SHADE.crestFall)}`,
    `#define FOAM_GAIN ${num(SHADE.foam)}`,
    `#define FOAM_FALL ${num(SHADE.foamFall)}`,
  ];
  if (dropN > 0) {
    lines.push(
      `#define DROP_RMIN ${num(SPLASH.rMin)}`,
      `#define DROP_RMAX ${num(SPLASH.rMax)}`,
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      `#define DROP_SEG ${num(SHADE.segHigh)}`,
      '#else',
      `#define DROP_SEG ${num(SHADE.segMedium)}`,
      '#endif',
    );
  }
  return lines.join('\n');
}

export const waterUniforms = (dropN) => [
  'uniform vec4  uSim;      // x = half the band aspect, y = 1 while anything moves (0 = a calm frame), z = seconds of streak behind a drop',
  'uniform sampler2D uSurf;  // the waterline, one texel per column: R = eta, G = slope (signed), A = foam',
  'uniform sampler2D uField; // the water under it: R = ripple height, G/B = its gradient (signed)',
  ...(dropN > 0
    ? [
      'uniform vec4  uDropBox;  // bounds of every live drop and its streak: minX, minY, maxX, maxY',
      'uniform vec4  uDrop[DROP_N]; // x, y, vx, vy per drop; an unused slot sits at y = -10',
    ]
    : []),
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

/**
 * The drops, drawn last: each is a capsule from its position back along its velocity (a motion
 * streak that tapers), clipped by `below` where it enters the water. Unused slots are skipped,
 * and so is everything outside the bounding box.
 */
export const DROPS = `
void dropsOver(vec2 p, float px, float below, inout vec3 col){
  if (p.x < uDropBox.x || p.x > uDropBox.z || p.y < uDropBox.y || p.y > uDropBox.w) return;
  for (int i = 0; i < DROP_N; i++) {
    vec4 d = uDrop[i];
    if (d.y > -5.0) {
      vec2 ab = -d.zw * uSim.z; vec2 pa = p - d.xy;
      float u = clamp(dot(pa, ab) / max(dot(ab, ab), DROP_SEG), 0.0, 1.0);
      float dist = length(pa - ab * u);
      float r = max(mix(DROP_RMIN, DROP_RMAX, fract(float(i) * 0.618034)), 1.2 * px) * (1.0 - 0.45 * u);
      float body = 1.0 - smoothstep(r - px, r + px, dist);
      float rim = smoothstep(r - 1.8 * px, r, dist);
      vec3 c = mix(vec3(${SHADE.dropFill.map(num).join(', ')}), vec3(${SHADE.dropRim.map(num).join(', ')}), rim);
      col = mix(col, c, body * (1.0 - below));
    }
  }
}
`;

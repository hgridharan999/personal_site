import { WAKE } from '../wake.js';

/*
 * GLSL for the two ways the water answers the pointer: a connected wake along the cursor's path,
 * and one soft ring for a press or tap. Both feed the same `disp` (bends the light) and `rh`
 * (lifts the waterline, brightens crests) that the mockup's ripple block fed.
 */

/** A GLSL float literal ("70" would be an int and fail to compile). */
const num = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** Every WAKE_* constant, generated from the JS object so the two can never drift apart. */
export function wakeDefines() {
  return `#define WAKE_W0 ${num(WAKE.w0)}
#define WAKE_SPREAD ${num(WAKE.spread)}
#define WAKE_C ${num(WAKE.c)}
#define WAKE_K ${num(WAKE.k)}
#define WAKE_RIP ${num(WAKE.rip)}
#define WAKE_REACH ${num(WAKE.reach)}
#define WAKE_AMIN ${num(WAKE.ampMin)}
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define WAKE_EPS ${num(WAKE.epsHigh)}
#define WAKE_SEG ${num(WAKE.segHigh)}
#else
#define WAKE_EPS ${num(WAKE.epsMedium)}
#define WAKE_SEG ${num(WAKE.segMedium)}
#endif`;
}

/** The press/tap ring: the mockup's formula, driven by one uniform. */
export const TAP_UNIFORM = `uniform vec4  uTap;      // press ring: x, y (band-height units), age in seconds (<= 0 = none), strength`;

export const TAP_FN = `
void tapRing(vec2 p, inout vec2 disp, inout float rh){
  float age = uTap.z;
  if (age > 0.0 && age < 5.0) {
    vec2 dv = p - uTap.xy; float d = length(dv);
    float w = d - age * 0.34;
    float h = sin(w * 44.0) * exp(-w * w * 70.0) * exp(-age * 0.85) * uTap.w / (1.0 + d * 3.5);
    disp += dv / (d + 1e-4) * h; rh += h;
  }
}
`;

export const WAKE_UNIFORMS = `uniform vec4  uTrailBox; // bounding box of the live segments plus their reach: minX, minY, maxX, maxY
uniform vec4  uTrail[TRAIL_N]; // the path, oldest to newest (the last is the live head): x, y, age, amplitude`;

/**
 * The wake. Each live segment is a capsule with its own age and amplitude at the closest point.
 * Segments are blended by a sharp soft maximum (weight amp^2 * e^(-2d^2/w^2)): a plain sum beads up where
 * segments meet, a hard min hides the wake when the cursor retraces itself, and this does neither.
 *
 * The push direction is dv / (d + w), not the ring's dv / (d + 1e-4): along a line the unit
 * direction flips sign across the centre, which tore the ice apart along the cursor's path.
 * Dividing by (d + w) lets the displacement fall smoothly to 0 on the path itself.
 */
export const WAKE_FN = `
void wakeField(vec2 p, inout vec2 disp, inout float rh){
  /* far from the trail there is nothing to do: skip the loop */
  if (p.x < uTrailBox.x || p.x > uTrailBox.z || p.y < uTrailBox.y || p.y > uTrailBox.w) return;
  float sw = 0.0, sh = 0.0; vec2 sdv = vec2(0.0);
  for (int i = 0; i < TRAIL_N - 1; i++) {
    vec4 a = uTrail[i]; vec4 b = uTrail[i + 1];
    if (a.w + b.w > WAKE_AMIN) {
      vec2 ab = b.xy - a.xy; vec2 pa = p - a.xy;
      float u = clamp(dot(pa, ab) / max(dot(ab, ab), WAKE_SEG), 0.0, 1.0);
      vec2 dv = pa - ab * u; float d = length(dv);
      float age = mix(a.z, b.z, u), amp = mix(a.w, b.w, u);
      float w = WAKE_W0 + WAKE_SPREAD * age; float q = d - WAKE_C * age;
      if (d < WAKE_C * age + WAKE_REACH * w) {
        float h = amp * (-exp(-d * d / (w * w)) + WAKE_RIP * sin(q * WAKE_K) * exp(-q * q / (2.25 * w * w)));
        /* sharp in distance: a softer weight lets the neighbouring segments (whose closest point is the
           shared joint) pull the trough up mid-segment, so the path showed as a row of dark beads */
        float wt = amp * amp * exp(-2.0 * d * d / (w * w));
        sw += wt; sh += wt * h; sdv += wt * h * dv / (d + w);
      }
    }
  }
  float inv = 1.0 / max(sw, WAKE_EPS);
  rh += sh * inv; disp += sdv * inv;
}
`;

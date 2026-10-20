import { BERG, WL } from '../iceberg.js';

/*
 * The parts of the fragment shader that do not depend on the simulated water: the iceberg polygon, its signed
 * distance, the two Voronoi passes, the caustics and the depth ramp. Copied from the mockup as-is.
 */

export const VS = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

/** Samplers need their own default: it is lowp otherwise, which cannot hold the bytes (up to 255) the decoder multiplies out. */
export const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp sampler2D;
#else
precision mediump float;
precision mediump sampler2D;
#endif
`;

/** GLSL float with four decimals, as the mockup prints its constants. */
export const f = (n) => (Math.round(n * 10000) / 10000).toFixed(4);

/** The waterline and one constant per iceberg vertex (y shifted down to the waterline). */
export function bergConstants() {
  const vconst = BERG.map(([x, y], i) => `const vec2 V${i} = vec2(${f(x)}, ${f(WL + y)});`).join('\n');
  return `const float WL = ${f(WL)};

${vconst}`;
}

/** Everything main() calls except the water's samplers. The polygon's edges are unrolled here. */
export function helpers() {
  const NV = BERG.length;
  const edges = BERG.map((_, i) => `edge(p, V${(i + NV - 1) % NV}, V${i}, d, s);`).join('\n  ');
  return `
float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2  hash22(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }

/* signed distance to the iceberg polygon (negative inside); the edges are unrolled at build time */
void edge(vec2 p, vec2 pv, vec2 cv, inout float d, inout float s){
  vec2 e = pv - cv; vec2 w = p - cv;
  vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
  d = min(d, dot(b, b));
  bool c1 = p.y >= cv.y; bool c2 = p.y < pv.y; bool c3 = e.x * w.y > e.y * w.x;
  if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
}
float sdBerg(vec2 p){
  float d = dot(p - V0, p - V0);
  float s = 1.0;
  ${edges}
  return s * sqrt(d);
}

/* static Voronoi: F1, F2, id of the nearest cell (the ice's facets) */
vec4 voroS(vec2 x){
  vec2 n = floor(x), f = x - n;
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + 0.5 + (o - 0.5) * 0.9 - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = n + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec4(sqrt(d1), sqrt(d2), id);
}

/* animated Voronoi: F1, F2 (the caustic network lives on F2 - F1). The input is bent first so cell walls curve. */
vec2 voroA(vec2 x, float t){
  x += 0.20 * vec2(sin(x.y * 1.9 + t * 0.9), sin(x.x * 2.1 - t * 0.7));
  vec2 n = floor(x), f = x - n;
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + 0.5 + 0.46 * sin(t * vec2(1.0, 0.83) + 6.2831 * o) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec2(sqrt(d1), sqrt(d2));
}

/* two warped Voronoi networks at different scales and headings, crossed: thin bright filaments, sparkle where they meet */
float caustic(vec2 p, float t){
  vec2 a = voroA(p * 4.4 + vec2(0.0, t * 0.030), t * 0.46);
  vec2 b = voroA(mat2(0.8, -0.6, 0.6, 0.8) * p * 7.6 + vec2(t * 0.040, 3.7), t * 0.62 + 2.0);
  float ea = a.y - a.x, eb = b.y - b.x;
  float la = 1.0 - clamp(ea * 9.0, 0.0, 1.0); la *= la;
  float lb = 1.0 - clamp(eb * 9.0, 0.0, 1.0); lb *= lb;
  return 0.55 * la + 0.38 * lb + 1.1 * la * lb + 0.10 * exp(-ea * 7.0);
}

/* the open water only gets the first network (one Voronoi pass instead of two) */
float causticLite(vec2 p, float t){
  vec2 a = voroA(p * 4.4 + vec2(0.0, t * 0.030), t * 0.46);
  float ea = a.y - a.x;
  float la = 1.0 - clamp(ea * 9.0, 0.0, 1.0);
  return 0.95 * la * la + 0.12 * exp(-ea * 7.0);
}

vec3 ramp(float d){
  vec3 c0 = vec3(0.788, 0.918, 0.957);   // pale cyan  #C9EAF4
  vec3 c1 = vec3(0.561, 0.816, 0.902);   //            #8FD0E6
  vec3 c2 = vec3(0.184, 0.612, 0.769);   //            #2F9CC4
  vec3 c3 = vec3(0.059, 0.490, 0.667);   // iceberg    #0F7DAA
  vec3 c4 = vec3(0.039, 0.302, 0.431);   //            #0A4D6E
  vec3 c5 = vec3(0.039, 0.094, 0.133);   // near-ink   #0A1822
  vec3 c = mix(c0, c1, smoothstep(0.00, 0.14, d));
  c = mix(c, c2, smoothstep(0.14, 0.34, d));
  c = mix(c, c3, smoothstep(0.34, 0.54, d));
  c = mix(c, c4, smoothstep(0.54, 0.76, d));
  c = mix(c, c5, smoothstep(0.74, 0.97, d));
  return c;
}
`;
}

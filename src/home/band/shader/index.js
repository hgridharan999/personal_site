import { PRECISION, VS, bergConstants, helpers } from './common.js';
import { SAMPLERS, WATER_UNIFORMS, waterDefines } from './water.js';

export { VS };

/*
 * main() is the mockup's, line for line, except where the simulated water comes in: the waterline
 * rides the surface height, caustics sway with its slope, crests catch light, foam rides the line,
 * and the ripples under it warp the light as before.
 */
const MAIN = `
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float H = uRes.y;
  float px = 1.0 / H;                                  // one device pixel, in band-height units
  vec2 p = (fc - vec2(uRes.x * 0.5, 0.0)) / H;
  float t = uT;

  /* the simulated water: waves on the line (eta, slope, foam) and ripples under it (they warp the light) */
  vec2 disp = vec2(0.0); float rh = 0.0;
  float eta = 0.0, slope = 0.0, foam = 0.0;
  if (uSim.y > 0.5) { surfaceAt(p.x, eta, slope, foam); if (p.y > WL - SURF_ETA) fieldAt(p, disp, rh); }

  /* waterline: three slow sines, a little ripple, and the simulated waves */
  float wl = WL + 0.0042 * sin(p.x * 9.0 + t * 0.8) + 0.0028 * sin(p.x * 17.0 - t * 1.15 + 1.7)
                + 0.0016 * sin(p.x * 33.0 + t * 1.9 + 0.4) - eta;
  float below = smoothstep(-px, px, p.y - wl);

  /* water colour by depth (the edges sit a little deeper than the middle) */
  float dep = clamp((p.y - WL) / (1.0 - WL) + 0.10 * smoothstep(0.5, 1.9, abs(p.x)), 0.0, 1.0);
  vec3 water = ramp(dep);

  /* god rays: diverge from a point above the surface, slow and soft, strongest just under it */
  float ang = (p.x + 0.10) / (p.y + 0.60);
  float rayA = sin(ang * 13.0 + t * 0.21 + 1.7 * sin(ang * 3.1 - t * 0.12));
  float rayB = sin(ang * 27.0 - t * 0.16 + 2.0);
  float ray = smoothstep(0.42, 1.0, 0.5 + 0.5 * (0.62 * rayA + 0.38 * rayB));
  float rayFade = exp(-dep * 2.8) / (1.0 + 0.55 * p.x * p.x);
  water += vec3(0.62, 0.92, 1.0) * ray * ray * 0.28 * rayFade;
  /* a wash of light under the surface */
  water += vec3(0.30, 0.55, 0.62) * 0.08 * exp(-(p.y - wl) * 7.0) / (1.0 + 0.3 * p.x * p.x);

  /* the warp that bends all the light: slow swell plus the ripples */
  vec2 warp = 0.045 * vec2(sin(p.y * 7.0 + t * 0.6) + 0.5 * sin(p.y * 13.0 - t * 0.9),
                           sin(p.x * 6.0 - t * 0.5) + 0.5 * sin(p.x * 11.0 + t * 0.7)) + 0.075 * disp;
  /* sloped water sways the caustics beneath it */
  warp += vec2(SURF_SWAY * slope * clamp(p.y - wl, 0.0, 0.3), 0.0);

  /* the iceberg's silhouette, seen through the moving water */
  float uw = smoothstep(WL - 0.012, WL + 0.03, p.y);
  vec2 shim = 0.0035 * vec2(sin(p.y * 29.0 + t * 1.3), sin(p.x * 23.0 - t * 1.1));
  vec2 pb = p + (shim + 0.05 * disp) * uw;             // seen through moving water
  float sd = 1.0;
  if (abs(pb.x) < 0.78 && pb.y > 0.0 && pb.y < 0.95) sd = sdBerg(pb);
  float sdpx = sd * H;

  /* the water's own caustics: a faint net that fades with depth (skipped where it can't be seen: deep, or behind the ice) */
  if (dep < 0.6 && sd > -0.02) {
    water += vec3(0.80, 0.97, 1.0) * causticLite(p + warp, t) * 0.26 * exp(-dep * 4.0);
  }

  /* marine snow */
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 9.0 : 15.0;
    vec2 q = p * sc + vec2(t * (k == 0 ? 0.02 : -0.03), -t * (k == 0 ? 0.045 : 0.07)) + float(k) * 17.0;
    vec2 id = floor(q); vec2 fq = fract(q) - 0.5;
    vec2 o = (hash22(id) - 0.5) * 0.7;
    float rad = 0.035 + 0.07 * hash12(id + 7.0);
    float on = step(0.5, hash12(id + 3.0));
    float tw = 0.65 + 0.35 * sin(t * 1.4 + hash12(id) * 40.0);
    water += vec3(0.8, 0.96, 1.0) * smoothstep(rad, rad * 0.25, length(fq - o)) * on * tw * (0.34 - 0.2 * dep);
  }

  vec3 col = mix(vec3(1.0), water, below);

  /* ---------------- the iceberg ---------------- */
  if (sd < 0.06) {
    bool sub = p.y > wl;
    vec3 bc;
    float inA;
    if (sub) {
      float dd = clamp((pb.y - WL) / 0.65, 0.0, 1.0);
      vec4 v = voroS(vec2(pb.x * 0.92 + pb.y * 0.30, pb.y * 1.12 - pb.x * 0.18) * 4.6 + 3.7);
      float fh = hash12(v.zw);
      float edgePx = (v.y - v.x) * 0.5 * H / 4.6;
      /* lightness: bright near the surface, each facet its own plane, darker (and bluer) with depth */
      float L = (1.0 - 0.80 * dd) * (0.74 + 0.40 * fh);
      vec3 cA = vec3(0.10, 0.50, 0.68), cB = vec3(0.42, 0.80, 0.92), cC = vec3(0.90, 0.985, 1.0);
      bc = mix(mix(cA, cB, smoothstep(0.0, 0.5, L)), cC, smoothstep(0.5, 1.05, L));
      bc = mix(bc, water, 0.10 * dd + 0.30 * dd * dd);
      /* strata: faint horizontal banding in the ice */
      bc += vec3(0.03, 0.06, 0.07) * sin((pb.y + 0.03 * sin(pb.x * 9.0)) * 70.0 + fh * 6.0);
      /* caustics land on the facets: each facet is a different plane, so the pattern breaks at its edges */
      float cb = caustic(pb * 0.9 + hash22(v.zw) * 9.0 + warp * 0.6, t);
      bc += vec3(0.80, 1.0, 1.0) * cb * (0.48 - 0.22 * dd);
      /* refracted facet edges */
      bc = mix(bc, vec3(0.93, 1.0, 1.0), (1.0 - smoothstep(0.3, 1.4, edgePx)) * 0.55);
      /* edge glow inside the silhouette, and the crisp rim */
      bc += vec3(0.30, 0.75, 0.88) * 0.30 * exp(min(sdpx, 0.0) / 6.0);
      bc = mix(bc, vec3(0.96, 1.0, 1.0), (1.0 - smoothstep(0.3, 1.3, abs(sdpx))) * 0.85);
      inA = 0.88;
    } else {
      vec4 v = voroS(vec2(pb.x * 0.9 + pb.y * 0.3, pb.y * 1.1 - pb.x * 0.2) * 10.0 + 1.3);
      float fh = hash12(v.zw);
      float edgePx = (v.y - v.x) * 0.5 * H / 10.0;
      bc = mix(vec3(1.0), vec3(0.62, 0.82, 0.91), fh * fh * 0.85 + 0.05);
      bc = mix(bc, vec3(0.059, 0.490, 0.667), (1.0 - smoothstep(0.3, 1.2, edgePx)) * 0.45);
      bc = mix(bc, vec3(0.059, 0.490, 0.667), (1.0 - smoothstep(0.5, 1.4, abs(sdpx))) * 0.92);
      inA = 1.0;
    }
    float inside = 1.0 - smoothstep(-0.7, 0.7, sdpx);
    /* a cold halo just outside the hull */
    if (sub) col += vec3(0.30, 0.70, 0.85) * 0.16 * exp(-max(sdpx, 0.0) / 8.0) * (1.0 - inside) * below;
    col = mix(col, bc, inside * inA);
  }

  /* the rings themselves: light crests, dim troughs */
  col += vec3(0.60, 0.90, 1.0) * rh * 0.30 * below;

  /* a crest of the waterline catches light, just under it */
  float z = (p.y - wl) * H;
  col += vec3(0.50, 0.85, 1.0) * max(eta, 0.0) / SURF_ETA * CREST_GAIN * below * exp(-max(z, 0.0) / CREST_FALL);

  /* the waterline itself: a thin blue hairline that breaks up a little as it moves (and thins where the water is steep) */
  float lineD = z * inversesqrt(1.0 + slope * slope);
  float lineA = 0.55 + 0.45 * sin(p.x * 21.0 + t * 0.7) * sin(p.x * 7.3 - t * 0.4);
  col = mix(col, vec3(0.059, 0.490, 0.667), (1.0 - smoothstep(0.35, 1.15, abs(lineD))) * lineA * 0.9);

  /* foam rides the line */
  col = mix(col, vec3(0.94, 0.99, 1.0), foam * below * exp(-max(z, 0.0) / FOAM_FALL) * FOAM_GAIN);

  /* floor: slightly darker in the lower corners, dithered so the deep gradient never bands */
  col *= 1.0 - 0.18 * smoothstep(0.9, 2.2, abs(p.x)) * smoothstep(0.4, 1.0, p.y);
  col = mix(col, vec3(0.039, 0.094, 0.133), smoothstep(0.93, 1.0, p.y));   // exactly the footer's colour at the floor
  col += (hash12(gl_FragCoord.xy + fract(t) * 91.7) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** The fragment shader: the mockup's iceberg and water, with the simulated water read from two textures. */
export function buildFragmentShader() {
  return [
    PRECISION,
    'uniform vec2  uRes;      // canvas size, device px',
    'uniform float uT;        // seconds',
    WATER_UNIFORMS,
    waterDefines(),
    '',
    bergConstants(),
    helpers(),
    SAMPLERS,
    MAIN,
  ].join('\n');
}

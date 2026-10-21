import { mix3, rgb, smoothstep } from './math.js';

// The five climates of Kilimanjaro, plains up. Every sample of every line is coloured from its
// real elevation, blended softly across each boundary. The names live in content.js
// (NEXT_CLIMB.zones, same order); kili.css repeats the colours for the legend swatches and a test
// keeps the two in step.

export const INK = [26, 26, 24];
export const GLOW = [255, 250, 236];

export const ZONES = [
  { top: 1800, c: [170, 146, 84] }, // cultivation: ochre-olive
  { top: 2800, c: [36, 112, 64] }, // rainforest: clear forest green
  { top: 4000, c: [122, 148, 66] }, // heath and moorland: moss
  { top: 5000, c: [176, 122, 76] }, // alpine desert: sand and terracotta
  { top: Infinity, c: [78, 150, 200] }, // arctic summit: glacier blue
];

/** Half the width, in metres, of the soft band around each zone boundary. */
export const BLEND = 230;

/** The colour at elevation `e` (metres) as [r, g, b]. */
export function zoneColor(e) {
  let c = ZONES[0].c;
  for (let z = 0; z < ZONES.length - 1; z += 1) {
    c = mix3(c, ZONES[z + 1].c, smoothstep(ZONES[z].top - BLEND, ZONES[z].top + BLEND, e));
  }
  return c;
}

/** A zone colour as '#rrggbb', for comparing with the stylesheet. */
export const zoneHex = (z) => `#${ZONES[z].c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

// Elevation bins: a line is stroked once per bin it passes through, so a frame costs a few
// dozen strokes per line however many samples the line has.
export const E0 = 600;
export const BIN = 70;
export const NB = Math.ceil((6000 - E0) / BIN) + 1;
export const binE = (b) => E0 + (b + 0.5) * BIN;
/** The bin an elevation falls in, kept inside 0..NB-1. */
export const binOf = (e) => Math.min(NB - 1, Math.max(0, Math.floor((e - E0) / BIN)));

/** Per-bin stroke colour and weights, refilled in place for each frame. */
export function makePalette() {
  return {
    c: new Array(NB).fill('#000'), // css colour
    a: new Float32Array(NB), // alpha multiplier
    w: new Float32Array(NB), // extra line width
    e: new Float32Array(NB), // ink edge strength (the arctic zone)
  };
}

/**
 * Fills `pal` for one frame. `tideH` is the height (m) the colour has risen to; `bandH` and
 * `bandAmp` place and weigh the band of light that rises through the zones.
 */
export function fillPalette(pal, tideH, bandH, bandAmp) {
  for (let b = 0; b < NB; b += 1) {
    const e = binE(b);
    const amt = smoothstep(e - 60, e + 520, tideH);
    let c = mix3(INK, zoneColor(e), amt);
    const lb = bandAmp * Math.exp(-(((e - bandH) / 330) ** 2));
    c = mix3(c, mix3(c, GLOW, 0.6), lb);
    pal.c[b] = rgb(c);
    pal.a[b] = 1 + 0.9 * amt;
    pal.w[b] = 0.5 * amt + 0.55 * lb;
    pal.e[b] = amt * smoothstep(4850, 5150, e);
  }
  return pal;
}

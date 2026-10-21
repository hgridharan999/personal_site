import { clamp, easeInk, easeTide, smoothstep } from './math.js';

// The ending's timeline, in seconds. First the lines draw in, back to front. Once the last one is
// down, "life" begins: the zone colour rises from the plains to the summit, the Machame route
// draws up and back down, and then a faint band of light rises through the zones every 8 s.

export const LINE_DUR = 0.8; // one line drawing across
export const STAGGER = 0.016; // the delay between neighbouring lines
export const TIDE = 3.6; // the colour rising from plains to summit
export const ROUTE_AT = 0.3; // the route starts this long after life begins
export const ROUTE_DUR = 3.4;
export const BAND_AT = TIDE + 0.8; // the first band of light
export const BAND_PERIOD = 8;
export const BAND_RISE = 0.72; // the share of each period the band is rising

/** Seconds from the first line starting to the last one finishing. */
export const totalDraw = (lineCount) => (lineCount - 1) * STAGGER + LINE_DUR;

/** How far line `i` has drawn across, 0..1, `drawT` seconds into the draw-in (-1 before it begins). */
export function lineProgress(drawT, i) {
  return drawT < 0 ? 0 : easeInk(clamp((drawT - i * STAGGER) / LINE_DUR, 0, 1));
}

/**
 * Everything that moves once the lines are down, `t` seconds into life (-1 before it begins).
 * `routeTotal` is the drawn length of the whole route in pixels. `tideH` and `bandH` are
 * elevations in metres; `bandAmp` is how strong the band of light is (0 when there is none).
 */
export function lifeState(t, routeTotal) {
  const tideH = t < 0 ? -1e9 : 500 + 6000 * easeTide(t / TIDE);
  const routeLen = t < 0 ? 0 : routeTotal * easeInk(clamp((t - ROUTE_AT) / ROUTE_DUR, 0, 1));
  if (t < BAND_AT) return { tideH, routeLen, bandH: -1e9, bandAmp: 0 };
  const p = ((t - BAND_AT) / BAND_PERIOD) % 1;
  const u = p / BAND_RISE;
  // the glow fades in over the first stretch of each rise, so a new cycle never pops
  return { tideH, routeLen, bandH: 250 + 6500 * easeTide(u), bandAmp: u <= 1 ? 0.55 * smoothstep(0, 0.08, u) : 0 };
}

/** The finished frame: fully coloured, the whole route drawn, no band of light. */
export const stillState = (routeTotal) => ({ ...lifeState(BAND_AT, routeTotal), bandH: -1e9, bandAmp: 0 });

/**
 * Where the ending is in its timeline, and the few moves between its states. No clock and no
 * DOM, so the loop (draw.js) only has to feed it elapsed time.
 *
 * - `begin`: start the draw-in, or jump straight to the finished frame when `frozen`
 * - `freeze`: jump to the finished frame (reduced motion, or paused mid draw-in)
 * - `thaw`: leave the finished frame and carry on from the first band of light
 * - `advance`: move on by `dt` seconds; true while there are more frames to draw
 */
export function createPlayhead() {
  const p = {
    drawT: -1, // seconds since the draw-in began; -1 before
    lifeT: -1, // seconds since the lines finished; -1 before
    done: false, // every line is down
    still: false, // showing the finished frame, not moving
    started: false,
    begin(lineCount, frozen) {
      if (p.started) return;
      p.started = true;
      if (frozen) p.freeze(lineCount);
      else p.drawT = 0;
    },
    freeze(lineCount) {
      p.drawT = totalDraw(lineCount);
      p.done = true;
      p.started = true;
      p.still = true;
    },
    thaw() {
      if (!p.still) return false;
      p.still = false;
      p.lifeT = BAND_AT;
      return true;
    },
    advance(dt, lineCount) {
      let drawing = false;
      if (!p.done && p.drawT >= 0) {
        p.drawT += dt;
        if (p.drawT >= totalDraw(lineCount)) {
          p.done = true;
          p.lifeT = 0;
        }
        drawing = true;
      } else if (p.done && !p.still) p.lifeT += dt;
      return drawing || (p.done && !p.still);
    },
    /** Seconds into life for the labels (the finished frame counts as the first band of light). */
    get lifeNow() { return p.still ? BAND_AT : p.lifeT; },
    /** The moving parts for this instant: tide, route length, band of light. */
    life(routeTotal) { return p.still ? stillState(routeTotal) : lifeState(p.lifeT, routeTotal); },
  };
  return p;
}

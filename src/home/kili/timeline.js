import { clamp, easeInk, easeTide } from './math.js';

// The ending's timeline, in seconds. First the lines draw in, back to front. Once the last one is
// down, "life" begins: the zone colour rises from the plains to the summit and the Machame route
// draws up and back down. When both are done the canvas paints its final frame and stops for good.
// The faint band of light that rises every 8 s afterwards is a CSS overlay (glow.js, kili.css),
// so it costs the canvas nothing.

export const LINE_DUR = 0.8; // one line drawing across
export const STAGGER = 0.016; // the delay between neighbouring lines
export const TIDE = 3.6; // the colour rising from plains to summit
export const ROUTE_AT = 0.3; // the route starts this long after life begins
export const ROUTE_DUR = 3.4;
/** Seconds into life when the colour and the route are both done and the canvas can stop. */
export const LIFE_END = Math.max(TIDE, ROUTE_AT + ROUTE_DUR);
/** The first band of light starts this long after life ends (an animation-delay in kili.css). */
export const GLOW_DELAY = 0.7;

/** Seconds from the first line starting to the last one finishing. */
export const totalDraw = (lineCount) => (lineCount - 1) * STAGGER + LINE_DUR;

/** How far line `i` has drawn across, 0..1, `drawT` seconds into the draw-in (-1 before it begins). */
export function lineProgress(drawT, i) {
  return drawT < 0 ? 0 : easeInk(clamp((drawT - i * STAGGER) / LINE_DUR, 0, 1));
}

/**
 * What moves once the lines are down, `t` seconds into life (-1 before it begins).
 * `routeTotal` is the drawn length of the whole route in pixels; `tideH` is an elevation in metres.
 */
export function lifeState(t, routeTotal) {
  return {
    tideH: t < 0 ? -1e9 : 500 + 6000 * easeTide(t / TIDE),
    routeLen: t < 0 ? 0 : routeTotal * easeInk(clamp((t - ROUTE_AT) / ROUTE_DUR, 0, 1)),
  };
}

/** The finished frame: fully coloured and the whole route drawn. */
export const stillState = (routeTotal) => lifeState(LIFE_END, routeTotal);

/**
 * Where the ending is in its timeline, and the few moves between its states. No clock and no
 * DOM, so the loop (draw.js) only has to feed it elapsed time.
 *
 * - `begin`: start the draw-in
 * - `freeze`: jump to the finished frame (reduced motion, or paused mid draw-in)
 * - `thaw`: let the light start after a freeze, when motion is allowed again
 * - `advance`: move on by `dt` seconds. Answers 'run' (paint and ask for another frame), 'settle'
 *   (paint the final frame; nothing is left to animate) or 'idle' (nothing to do)
 *
 * `glow` says the band of light may run: it turns on when life ends or after a thaw.
 */
export function createPlayhead() {
  const p = {
    drawT: -1, // seconds since the draw-in began; -1 before
    lifeT: -1, // seconds since the lines finished; -1 before
    done: false, // every line is down
    still: false, // the finished frame is up: no more frames are needed
    glow: false, // the band of light may run
    started: false,
    begin() {
      if (p.started) return;
      p.started = true;
      p.drawT = 0;
    },
    freeze(lineCount) {
      p.drawT = totalDraw(lineCount);
      p.lifeT = LIFE_END;
      p.done = true;
      p.started = true;
      p.still = true;
    },
    thaw() {
      if (!p.still || p.glow) return false;
      p.glow = true;
      return true;
    },
    advance(dt, lineCount) {
      if (p.still) return 'idle';
      if (!p.done) {
        if (p.drawT < 0) return 'idle';
        p.drawT += dt;
        if (p.drawT >= totalDraw(lineCount)) {
          p.done = true;
          p.lifeT = 0;
        }
        return 'run';
      }
      p.lifeT += dt;
      if (p.lifeT < LIFE_END) return 'run';
      p.lifeT = LIFE_END;
      p.still = true;
      p.glow = true;
      return 'settle';
    },
    /** Seconds into life, for the labels. */
    get lifeNow() { return p.lifeT; },
    /** The moving parts for this instant: tide and route. */
    life(routeTotal) { return p.still ? stillState(routeTotal) : lifeState(p.lifeT, routeTotal); },
  };
  return p;
}

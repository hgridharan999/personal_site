import { clamp, easeInk } from './math.js';

// The ending's timeline, in seconds. The lines draw in, back to front, already in their zone
// colours, and each line's share of the planned route appears as that line finishes (paint.js).
// When the last line is down the canvas paints its final frame and stops for good: from then on
// the drawing is a still picture, like an SVG.

export const LINE_DUR = 0.8; // one line drawing across
export const STAGGER = 0.016; // the delay between neighbouring lines

/** Seconds from the first line starting to the last one finishing. */
export const totalDraw = (lineCount) => (lineCount - 1) * STAGGER + LINE_DUR;

/** How far line `i` has drawn across, 0..1, `drawT` seconds into the draw-in (-1 before it begins). */
export function lineProgress(drawT, i) {
  return drawT < 0 ? 0 : easeInk(clamp((drawT - i * STAGGER) / LINE_DUR, 0, 1));
}

/** What the canvas shows besides the lines: every zone colour and the whole route. */
export const stillState = (routeTotal) => ({ tideH: Infinity, routeLen: routeTotal });

/**
 * Where the ending is in its timeline. No clock and no DOM, so the loop (draw.js) only has to
 * feed it elapsed time.
 *
 * - `begin`: start the draw-in
 * - `freeze`: jump to the finished frame (reduced motion, or paused mid draw-in)
 * - `advance`: move on by `dt` seconds. Answers 'run' (paint and ask for another frame), 'settle'
 *   (the last line is down: paint the final frame and stop) or 'idle' (nothing to do)
 */
export function createPlayhead() {
  const p = {
    drawT: -1, // seconds since the draw-in began; -1 before
    done: false, // every line is down
    still: false, // the finished frame is up: no more frames are needed
    started: false,
    begin() {
      if (p.started) return;
      p.started = true;
      p.drawT = 0;
    },
    freeze(lineCount) {
      p.drawT = totalDraw(lineCount);
      p.done = true;
      p.started = true;
      p.still = true;
    },
    advance(dt, lineCount) {
      if (p.still || p.drawT < 0) return 'idle';
      p.drawT += dt;
      if (p.drawT < totalDraw(lineCount)) return 'run';
      p.drawT = totalDraw(lineCount);
      p.done = true;
      p.still = true;
      return 'settle';
    },
    /** 0 once the lines are down (the labels show then), -1 before. */
    get lifeNow() { return p.done ? 0 : -1; },
    /** Colour and route for the paint: always all of both (paint draws the route line by line). */
    life(routeTotal) { return stillState(routeTotal); },
  };
  return p;
}

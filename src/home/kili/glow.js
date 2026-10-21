import { clamp, easeTide } from './math.js';
import { GLOW_DELAY } from './timeline.js';

// The band of light that rises through the five zones every 8 s. It used to be repainted into the
// canvas about 30 times a second, which at 2x pixel density starved the whole page. It is a soft
// elliptical ring now: one element, moved by CSS keyframes that only change `transform` and
// `opacity`, so it runs on the compositor and the canvas stays still. A ring that shrinks from the
// foothills toward the summit, climbing as it goes, reads as the light rising through the zones.
//
// This file holds the placement maths (pure). The keyframes, the 8 s period and the
// `mix-blend-mode: screen` live in kili.css; a test keeps the two in step.

export const GLOW_PERIOD = 8; // seconds per cycle
export const GLOW_RISE = 0.72; // the share of each cycle the light is rising
export { GLOW_DELAY };

/** Keyframe offsets (percent of the cycle) at which the ring is placed. Must match kili.css. */
export const GLOW_PERCENT = [0, 5.76, 12, 20, 28, 36, 44, 52];
/** The ring's gradient peaks this far out from the middle of its box (0..1). Must match kili.css. */
export const GLOW_RING = 0.8;
export const GLOW_BOX = 200; // px: the ring is a box this wide and tall, moved and scaled from there

const FLOOR = 800; // metres: the plains
const SHRINK = 1.3; // contours close in faster near the foot of the mountain than near the top

/** The elevation (m) the band of light has reached `percent` of the way through a cycle. */
export const glowElevation = (percent) => 250 + 6500 * easeTide(percent / (GLOW_RISE * 100));

/**
 * One placement per entry of GLOW_PERCENT: where the ring's centre is on screen and how far it is
 * scaled from its box. It starts as wide as the stage on the plains, rises up the cone, and ends
 * a few pixels across at the summit.
 *
 * @param {object} layout from layoutLines
 * @param {[number, number]} summit [col, row] of the summit
 * @param {number} summitHeight metres
 * @returns {{ x: number, y: number, sx: number, sy: number }[]}
 */
export function glowStops(layout, summit, summitHeight) {
  const x = layout.colToX(summit[0]);
  const rx0 = Math.max(1, layout.SW * 0.5);
  const ry0 = Math.max(1, (layout.lineBase[layout.N - 1] - layout.lineBase[0]) * 0.5 + 12);
  const unit = (GLOW_BOX / 2) * GLOW_RING;
  return GLOW_PERCENT.map((percent, k) => {
    // the last placement is the summit itself, however high the light has got by then
    const e = k === GLOW_PERCENT.length - 1 ? summitHeight : glowElevation(percent);
    const toTop = clamp((e - FLOOR) / Math.max(1, summitHeight - FLOOR), 0, 1);
    const size = Math.max(0.02, (1 - toTop) ** SHRINK);
    return {
      x,
      y: layout.yAt(summit[1], Math.min(e, summitHeight)),
      sx: (rx0 * size) / unit,
      sy: (ry0 * size) / unit,
    };
  });
}

/** A placement as a CSS transform, for a custom property read by the keyframes. */
export const stopTransform = (s) => `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${s.sx.toFixed(4)}, ${s.sy.toFixed(4)})`;

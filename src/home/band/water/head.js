/*
 * The cursor's smoothed head: pure JS, no DOM. Pointer events only say where the pointer is; each
 * fixed step moves a critically damped head toward it and reports the segment it swept. Everything
 * the water does with the cursor is driven by that segment, so the effect depends on how far the
 * head travelled, never on how often events arrived.
 */

export const HEAD = Object.freeze({
  smoothTime: 0.08, // seconds for the head to catch the pointer (critically damped)
  speedFull: 1.0, // band heights per second that give full strength
  hover: 0.75, // strength cap for a hovering pointer
  drag: 1.0, // ... and for a pressed one
  dragRate: 12, // per second: hover/drag eases instead of stepping
  deadLo: 0.01, // below this speed the pointer counts as still (strength exactly 0) ...
  deadHi: 0.04, // ... and strength eases in up to here
  breakDist: 0.05, // re-entering this far from the head snaps it there: one jump, nothing injected across it
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Pointer speed (and press state, 0..1) to strength. Exactly 0 when the pointer is still. */
export function speedStrength(speed, dragMix = 0) {
  const cap = HEAD.hover + (HEAD.drag - HEAD.hover) * dragMix;
  return Math.min(1, speed / HEAD.speedFull) * smoothstep(HEAD.deadLo, HEAD.deadHi, speed) * cap;
}

/**
 * Critically damped spring toward `target` (the exact solution, so any frame rate follows the same
 * path). It never overshoots: a step that would cross the target lands on it instead.
 * @returns {[number, number]} the new position and velocity
 */
export function smoothDamp(x, v, target, smoothTime, dt) {
  if (!(dt > 0)) return [x, v];
  const w = 2 / Math.max(smoothTime, 1e-4);
  const e = Math.exp(-w * dt);
  const delta = x - target;
  const lin = (v + w * delta) * dt;
  const nx = target + (delta + lin) * e;
  if (delta !== 0 && (nx - target) * delta < 0) return [target, 0];
  return [nx, (v - w * lin) * e];
}

const IDLE = Object.freeze({
  active: false, x0: 0, y0: 0, x1: 0, y1: 0, speed: 0, strength: 0, dragMix: 0, jumped: false,
});

export function createHead() {
  let x = 0, y = 0, vx = 0, vy = 0; // the head
  let tx = 0, ty = 0; // the pointer
  let has = false, present = false, dragOn = false, snapped = false;
  let dragMix = 0;

  return {
    /** The pointer is at (x, y); call on every move and press. `drag` = a button or finger is down. */
    point(px, py, drag) {
      dragOn = drag;
      if (!present) {
        present = true;
        const far = has && Math.hypot(px - x, py - y) > HEAD.breakDist;
        if (!has || far) {
          x = px; y = py; vx = 0; vy = 0;
          has = true;
          snapped = true;
        }
      }
      tx = px;
      ty = py;
    },

    /** The pointer left: the head settles where it is. */
    leave() {
      present = false;
      dragOn = false;
    },

    /** Forget everything; the next point() starts fresh. */
    reset() {
      has = present = dragOn = snapped = false;
      x = y = vx = vy = tx = ty = dragMix = 0;
    },

    /**
     * Advance by dt and report the segment swept. `jumped` marks a snap (first appearance or a
     * far re-entry): the segment is empty and nothing may be injected across the gap.
     */
    step(dt) {
      if (!has) return IDLE;
      const x0 = x, y0 = y;
      let jumped = false;
      if (snapped) {
        snapped = false;
        jumped = true;
      } else {
        [x, vx] = smoothDamp(x, vx, tx, HEAD.smoothTime, dt);
        [y, vy] = smoothDamp(y, vy, ty, HEAD.smoothTime, dt);
      }
      dragMix += ((dragOn ? 1 : 0) - dragMix) * (1 - Math.exp(-dt * HEAD.dragRate));
      const speed = Math.hypot(x - x0, y - y0) / dt; // the swept segment's speed (0 on a jump)
      return { active: true, x0, y0, x1: x, y1: y, speed, strength: speedStrength(speed, dragMix), dragMix, jumped };
    },
  };
}

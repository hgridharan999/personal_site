/*
 * The cursor's wake: pure JS, no DOM. It turns pointer positions into a short ordered trail
 * (oldest to newest, the last entry being the live smoothed head) that the fragment shader
 * draws as ONE connected ripple instead of separate stamps.
 *
 * Entries are (x, y, age, amplitude) in band-height units, the same space the shader uses.
 * Amplitude is computed here, not in GLSL, so a sample is guaranteed to have faded to 0
 * before the ring can evict it: nothing ever pops out.
 */

/** One source of truth: the GLSL `WAKE_*` defines are generated from this object. */
export const WAKE = Object.freeze({
  // look of the wake (the shader's profile)
  w0: 0.03, // trough half-width at age 0, band heights (about 10px on a 340px band: readable, not a hairline)
  spread: 0.06, // how fast it widens with age
  c: 0.12, // ring speed, band heights per second
  k: 38, // ring wavenumber (wavelength ~0.165, close to the tap ring's)
  rip: 0.55, // trailing ripple strength relative to the trough
  reach: 3, // visible reach, in widths, beyond the ring (per-segment cutoff and the bbox)
  ampMin: 1e-3, // below this a segment is skipped by the shader and left out of the bbox
  epsHigh: 1e-6, // soft-max floor: highp ...
  epsMedium: 1e-4, // ... and mediump (its range bottoms out near 6e-5)
  segHigh: 1e-8, // shortest segment length squared the closest-point maths divides by
  segMedium: 1e-4,
  // pointer feel
  smoothTime: 0.08, // seconds for the head to catch the pointer (critically damped)
  speedFull: 1.0, // band heights per second that give full strength
  hover: 0.75, // strength cap for a hovering pointer
  drag: 1.0, // ... and for a pressed one
  dragRate: 12, // per second: hover/drag eases instead of stepping
  deadLo: 0.01, // below this speed the pointer counts as still (strength exactly 0) ...
  deadHi: 0.04, // ... and strength eases in up to here
  breakDist: 0.05, // re-entering this far from the head starts a new stroke
  // sampling and fading
  span: 1.1, // seconds the trail aims to cover
  reserve: 4, // slots kept free: the head, two break samples and one for timing slack
  everyMin: 0.05,
  everyMax: 0.1,
  decay: 1.2, // e^(-decay * age)
  taper: 0.55, // the fade-out taper starts at this fraction of the life
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Trail length from MAX_FRAGMENT_UNIFORM_VECTORS: more uniform room, longer trail. */
export function pickTrailN(maxVectors) {
  if (maxVectors >= 128) return 24;
  if (maxVectors >= 64) return 16;
  return 8;
}

/** What createRenderer tries in turn; 0 compiles the wake out entirely. */
export function trailCandidates(maxVectors) {
  return [...new Set([pickTrailN(maxVectors), 8, 0])];
}

/** Seconds between samples, and how long one lives (its amplitude reaches 0 at `life`). */
export function trailTiming(n) {
  const slots = Math.max(1, n - WAKE.reserve);
  const every = clamp(WAKE.span / slots, WAKE.everyMin, WAKE.everyMax);
  return { every, life: Math.min(WAKE.span, slots * every) };
}

/** Amplitude envelope of a sample: smooth decay, then a taper that lands on exactly 0 at `life`. */
export function fade(age, life) {
  if (age >= life) return 0;
  const a = Math.max(age, 0);
  return Math.exp(-WAKE.decay * a) * (1 - smoothstep(WAKE.taper * life, life, a));
}

/** Pointer speed (and press state, 0..1) to strength. Exactly 0 when the pointer is still. */
export function speedStrength(speed, dragMix = 0) {
  const cap = WAKE.hover + (WAKE.drag - WAKE.hover) * dragMix;
  return Math.min(1, speed / WAKE.speedFull) * smoothstep(WAKE.deadLo, WAKE.deadHi, speed) * cap;
}

/** How far a sample of this age can still be seen from its path; the shader uses the same numbers. */
export function reachAt(age) {
  return WAKE.c * age + WAKE.reach * (WAKE.w0 + WAKE.spread * age);
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

const EMPTY_BOX = [1e3, 1e3, -1e3, -1e3];

/**
 * Lay the trail out as uniform data: n entries of (x, y, age, amplitude), oldest first, the head
 * last, short trails padded in front with zero amplitude. `box` gets the bounds of the live
 * segments plus their reach, or stays inverted (empty) when there are none.
 * @returns {boolean} whether any segment is live
 */
function writeTrail(out, box, n, samples, head, now, life) {
  out.fill(0);
  box.set(EMPTY_BOX);
  const pad = n - samples.length - 1;
  const first = samples[0] ?? head;
  for (let i = 0; i < pad; i++) { out[i * 4] = first.x; out[i * 4 + 1] = first.y; }
  samples.forEach((s, j) => {
    const o = (pad + j) * 4;
    const age = now - s.born;
    out[o] = s.x; out[o + 1] = s.y; out[o + 2] = age; out[o + 3] = s.s * fade(age, life);
  });
  const h = (n - 1) * 4;
  out[h] = head.x; out[h + 1] = head.y; out[h + 3] = head.strength;

  let live = false;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4, b = a + 4;
    // the same test the shader uses to skip a segment, read back from the float32 data
    if (!(out[a + 3] + out[b + 3] > WAKE.ampMin)) continue;
    const r = reachAt(Math.max(out[a + 2], out[b + 2]));
    box[0] = Math.min(box[0], out[a] - r, out[b] - r);
    box[1] = Math.min(box[1], out[a + 1] - r, out[b + 1] - r);
    box[2] = Math.max(box[2], out[a] + r, out[b] + r);
    box[3] = Math.max(box[3], out[a + 1] + r, out[b + 1] + r);
    live = true;
  }
  return live;
}

/**
 * @param {number} n uniform entries (including the head), e.g. 8, 16 or 24
 * @param {{ onEvict?: (amp: number) => void }} [hooks] onEvict is a test hook: called with a sample's amplitude when it is dropped
 */
export function createWake(n, { onEvict } = {}) {
  const { every, life } = trailTiming(n);
  const cap = n - 1; // stored samples; the head takes the last uniform entry
  let samples = []; // oldest first: { x, y, s, born }
  const head = { x: 0, y: 0, vx: 0, vy: 0, strength: 0 }; // the smoothed head
  let tx = 0, ty = 0; // where the pointer is
  let has = false, present = false, dragOn = false;
  let dragMix = 0, now = 0, lastPush = 0;

  const ampOf = (s) => s.s * fade(now - s.born, life);
  const store = (x, y, s) => {
    if (samples.length >= cap) onEvict?.(ampOf(samples.shift()));
    samples.push({ x, y, s, born: now });
  };

  /** The pointer came back after being away: snap the head to it, and cap the old trail if it is far. */
  function reenter(x, y) {
    const far = has && Math.hypot(x - head.x, y - head.y) > WAKE.breakDist;
    if (has && !far) return; // close by: keep gliding, one stroke
    // A far re-entry would otherwise draw a streak across the gap, so cap the old trail with two
    // zero-strength samples (old head, new spot). With nothing alive there is nothing to bridge.
    if (far && samples.some((s) => ampOf(s) > 0)) {
      store(head.x, head.y, 0);
      store(x, y, 0);
    } else {
      samples = [];
    }
    Object.assign(head, { x, y, vx: 0, vy: 0, strength: 0 });
    has = true;
  }

  return {
    /** The pointer is at (x, y); call on every move and press. `drag` = a button or finger is down. */
    point(x, y, drag) {
      dragOn = drag;
      if (!present) {
        present = true;
        reenter(x, y);
      }
      tx = x;
      ty = y;
    },

    /** The pointer left: the head settles where it is and the trail fades out. */
    leave() {
      present = false;
      dragOn = false;
    },

    /** Forget everything (the loop stopped); the next point() starts fresh. */
    reset() {
      samples = [];
      has = present = dragOn = false;
      Object.assign(head, { vx: 0, vy: 0, strength: 0 });
      dragMix = 0;
    },

    /** Advance by dt seconds. Samples are pushed by elapsed time, never per pointer event. */
    update(dt) {
      if (!has || !(dt > 0)) return;
      now += dt;
      [head.x, head.vx] = smoothDamp(head.x, head.vx, tx, WAKE.smoothTime, dt);
      [head.y, head.vy] = smoothDamp(head.y, head.vy, ty, WAKE.smoothTime, dt);
      dragMix += ((dragOn ? 1 : 0) - dragMix) * (1 - Math.exp(-dt * WAKE.dragRate));
      head.strength = speedStrength(Math.hypot(head.vx, head.vy), dragMix);
      // amplitude is already 0 at `life`, so dropping here can't be seen
      while (samples.length && now - samples[0].born >= life) samples.shift();
      // a still pointer adds nothing, so an idle wake empties out and stays empty
      if (head.strength > 0 && (samples.length === 0 || now - lastPush >= every)) {
        store(head.x, head.y, head.strength);
        lastPush = now;
      }
    },

    /**
     * Write the uniform data (see writeTrail).
     * @param {Float32Array} out length n * 4
     * @param {Float32Array} box length 4: minX, minY, maxX, maxY
     * @returns {boolean} whether any segment is live
     */
    fill(out, box) {
      if (has) return writeTrail(out, box, n, samples, head, now, life);
      out.fill(0);
      box.set(EMPTY_BOX);
      return false;
    },

    /** Read-only view for tests and debugging. */
    snapshot() {
      return {
        now,
        head: { ...head },
        samples: samples.map((s) => ({ ...s, age: now - s.born, amp: ampOf(s) })),
      };
    },
  };
}

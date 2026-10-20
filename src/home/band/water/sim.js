import { CURSOR as C, SIM } from './constants.js';
import { createField, fieldDims } from './field.js';
import { createHead } from './head.js';
import { applyCursor, applyPress, noteHead } from './interact.js';
import { restBytes } from './pack.js';
import { createSurface, surfaceCols } from './surface.js';

/*
 * The water: a 1D wave along the waterline and a 2D wave field under it, both stepped on the CPU at
 * a fixed 1/120 s and handed to the shader as RGBA8 textures.
 *
 * advance(dt) is the ONLY thing that steps. point / leave / press only record input, and view()
 * only encodes what the last step left behind, so drawing outside the animation loop (a resize,
 * the pause toggle, a context restore) can never move the water.
 */

const NO_VIEW = Object.freeze({ on: false, dims: null, surf: null, surfVersion: 0, field: null, fieldVersion: 0 });

/**
 * @param {{ maxTexture?: number }} opts maxTexture: the GPU's largest texture side, which caps the grid sizes
 */
export function createWater({ maxTexture = 4096 } = {}) {
  const head = createHead();
  const ctx = {
    surface: null, field: null,
    time: 0, coolPlunge: 0, coolExit: 0, lastD: null,
    stats: { trench: 0, stir: 0, plunges: 0, exits: 0, presses: 0 },
  };
  const presses = [];
  let dims = null;
  let surfBytes = null;
  let fieldBytes = null;
  let surfVersion = 0;
  let fieldVersion = 0;
  let surfDirty = true;
  let fieldDirty = true;
  let acc = 0;
  let steps = 0;

  function step() {
    steps++;
    const h = head.step(SIM.dt);
    for (let n = 0; n < C.pressMax && presses.length; n++) applyPress(ctx, presses.shift());
    if (h.active && !h.jumped) applyCursor(ctx, h);
    else noteHead(ctx, h);
    if (ctx.surface.active) {
      ctx.surface.step();
      surfDirty = true;
    }
    if (ctx.field.active) {
      ctx.field.step();
      fieldDirty = true;
    }
    ctx.time += SIM.dt;
  }

  function reset() {
    head.reset();
    ctx.surface?.reset();
    ctx.field?.reset();
    presses.length = 0;
    Object.assign(ctx, { time: 0, coolPlunge: 0, coolExit: 0, lastD: null });
    acc = 0;
    surfDirty = true;
    fieldDirty = true;
  }

  return {
    get dims() { return dims; },
    get steps() { return steps; },
    stats: ctx.stats,

    /** The band's CSS size. Same grid: the water keeps moving. A new grid starts calm. Zero or junk sizes are ignored. */
    resize(cssW, cssH) {
      if (!(cssW > 0 && cssH > 0) || !Number.isFinite(cssW / cssH)) return;
      const aspect = cssW / cssH;
      const f = fieldDims(aspect, maxTexture);
      const next = { aspect, cols: surfaceCols(aspect, maxTexture), nx: f.nx, ny: f.ny };
      if (dims && Object.keys(next).every((k) => next[k] === dims[k])) return;
      dims = Object.freeze(next);
      ctx.surface = createSurface(aspect, { maxCols: maxTexture });
      ctx.field = createField(aspect, maxTexture);
      surfBytes = restBytes(dims.cols, 1);
      fieldBytes = restBytes(dims.nx, dims.ny);
      reset();
    },

    /** The pointer is at (x, y) in band-height units (x from the centre line, y from the top). */
    point: (x, y, drag) => head.point(x, y, drag),
    leave: () => head.leave(),
    /** A click or tap. At most 2 x pressMax wait at once. */
    press(x, y) {
      if (presses.length >= 2 * C.pressMax) presses.shift();
      presses.push({ x, y });
    },

    /** Move time forward by dt seconds, in whole fixed steps (at most SIM.maxSteps). Returns how many ran. */
    advance(dt) {
      if (!dims || !(dt > 0)) return 0;
      acc = Math.min(acc + dt, SIM.maxSteps * SIM.dt);
      let n = 0;
      while (acc >= SIM.dt - SIM.slack) {
        step();
        acc -= SIM.dt;
        n++;
      }
      if (acc < SIM.slack) acc = 0; // a leftover of 1e-17 (or slightly negative) is rounding, not time
      return n;
    },

    /** Back to a perfectly flat sea: what a paused, hidden or reduced-motion frame shows. */
    reset,

    /** Encode whatever changed since the last view and say what to draw. Never steps; calling it twice changes nothing. */
    view() {
      if (!dims) return NO_VIEW;
      if (surfDirty) {
        ctx.surface.encode(surfBytes);
        surfVersion++;
        surfDirty = false;
      }
      if (fieldDirty) {
        ctx.field.encode(fieldBytes);
        fieldVersion++;
        fieldDirty = false;
      }
      const on = ctx.surface.active || ctx.field.active;
      return { on, dims, surf: surfBytes, surfVersion, field: fieldBytes, fieldVersion };
    },

    /** Copies of everything, for tests and debugging. */
    snapshot: () => ({
      steps, time: ctx.time, acc, dims,
      surface: ctx.surface?.snapshot() ?? null,
      field: ctx.field?.snapshot() ?? null,
      stats: { ...ctx.stats },
    }),

    /** For tests: the energies the damping drains. */
    energy: () => ({ surface: ctx.surface?.energy() ?? 0, field: ctx.field?.energy() ?? 0 }),
  };
}

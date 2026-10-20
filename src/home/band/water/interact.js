import { WL, bergWaterSpan } from '../iceberg.js';
import { CURSOR as C, IMPACT as I, SIM } from './constants.js';
import { smoothstep, speedStrength } from './head.js';

/*
 * What the cursor and taps do to the water: the injection rules, kept apart from the stepping in
 * sim.js. Everything here runs inside one fixed step and takes its inputs from the head's swept
 * segment, so a stroke deposits the same amount however often pointer events arrive.
 *
 * ctx = { surface, field, time, coolPlunge, coolExit, lastD, stats }
 */

const [BERG_L, BERG_R] = bergWaterSpan();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The y of the water line at x. */
export const yLine = (surface, x) => WL - surface.eta(x);

/** How far below the water line a point is (negative = in the air). */
export const depthAt = (surface, x, y) => y - yLine(surface, x);

/**
 * Remember where the cursor is relative to the line after a step that did not sweep a segment (it
 * just appeared or snapped, or is gone). Crossings are judged against this, because the line moves
 * too: a dipping surface can pass the cursor between two steps without the cursor moving across it.
 */
export function noteHead(ctx, h) {
  ctx.lastD = h.active ? depthAt(ctx.surface, h.x1, h.y1) : null;
}

/** Footprints: the surface is touched over w, the field over r (never finer than the grid can show). */
const footprint = ({ surface, field }) => ({
  w: Math.max(C.wMin, 3 * surface.dims.dx),
  r: Math.max(C.rMin, 1.6 * field.dims.cell),
});

/** The cursor went in through the line: push the water down and leave a little foam. */
function plunge(ctx, xc, E) {
  ctx.surface.addVelocity(xc, 0.02, -I.plungeKick * E);
  ctx.surface.addFoam(xc, 0.03, I.plungeFoam * E);
  ctx.stats.plunges++;
}

/** The cursor came out through the line: the water follows it up. */
function exit(ctx, xc, E) {
  ctx.surface.addVelocity(xc, 0.02, I.exitKick * E);
  ctx.stats.exits++;
}

/** The cursor moved from (x0, y0) to (x1, y1) this step: stir the water, dimple the line, and kick it where the cursor crosses. */
export function applyCursor(ctx, h) {
  const { surface, field, stats } = ctx;
  const dx = h.x1 - h.x0;
  const dy = h.y1 - h.y0;
  const L = Math.hypot(dx, dy);
  const Vy = dy / SIM.dt;
  const U = L / SIM.dt;
  const s = Math.max(speedStrength(U, h.dragMix), C.dragFloor * h.dragMix);
  const { w, r } = footprint(ctx);

  if (s > 0) {
    const K = clamp(Math.ceil(L / (w / 2)), 1, C.maxSamples);
    for (let k = 0; k < K; k++) {
      const qx = h.x0 + ((k + 0.5) / K) * dx;
      const qy = h.y0 + ((k + 0.5) / K) * dy;
      const d = qy - yLine(surface, qx);
      const ws = Math.exp(-((d / (d >= 0 ? C.depthBelow : C.depthAbove)) ** 2));
      if (s * ws > 1e-3) {
        const a = s * ws * (L / K);
        surface.addVelocity(qx, w, (-C.trench * a) / (Math.sqrt(Math.PI) * w));
        surface.addPressure(qx, w, (C.pressure * s * ws) / K);
        stats.trench += a;
      }
      const wf = smoothstep(0, C.stirRamp, d);
      if (L > 0 && s * wf > 1e-3) {
        field.stir(qx, qy, C.stir * s * wf * (L / K), r);
        stats.stir += s * wf * (L / K);
      }
    }
  }

  const d1 = depthAt(surface, h.x1, h.y1);
  const d0 = ctx.lastD ?? depthAt(surface, h.x0, h.y0);
  ctx.lastD = d1;
  const E = clamp((U - 0.5) / 1.5, 0, 1);
  const crossing = () => h.x0 + clamp(-d0 / (d1 - d0), 0, 1) * dx;
  if (d0 < 0 && d1 >= 0 && Vy > I.plungeVy && ctx.time >= ctx.coolPlunge) {
    const xc = crossing();
    if (xc < BERG_L || xc > BERG_R) { // an open column, not the iceberg
      plunge(ctx, xc, E);
      ctx.coolPlunge = ctx.time + I.cooldown;
    }
  } else if (d0 >= 0 && d1 < 0 && -Vy > I.plungeVy && ctx.time >= ctx.coolExit) {
    const xc = crossing();
    if (xc < BERG_L || xc > BERG_R) {
      exit(ctx, xc, E);
      ctx.coolExit = ctx.time + I.cooldown;
    }
  }
}

/** A click or tap at (x, y): waves from the surface, a ring under water, nothing in the air. */
export function applyPress(ctx, { x, y }) {
  const { surface, field } = ctx;
  const d = depthAt(surface, x, y);
  if (Math.abs(d) < I.pressDepth) {
    surface.addVelocity(x, 0.02, -I.pressKick);
    surface.addFoam(x, 0.03, I.pressFoam);
    ctx.stats.presses++;
  } else if (d > 0) {
    field.addImpulse(x, y, C.pressRing, C.pressRingR);
    ctx.stats.presses++;
  }
}

import { WL, bergWaterSpan } from '../iceberg.js';
import { CURSOR as C, SIM, SPLASH as P } from './constants.js';
import { smoothstep, speedStrength } from './head.js';
import { radiusOfSlot } from './splash.js';

/*
 * What the cursor and taps do to the water: the injection and spawn rules, kept apart from the
 * stepping in sim.js. Everything here runs inside one fixed step and takes its inputs from the head's
 * swept segment, so a stroke deposits the same amount however often pointer events arrive.
 *
 * ctx = { surface, field, splash, rand, time, coolPlunge, coolExit, skim, lastD, stats }
 */

const [BERG_L, BERG_R] = bergWaterSpan();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const bump = (t, w) => Math.exp(-((t / w) ** 2)); // peak-normalised Gaussian, the design's G(x; w)
const RAD = Math.PI / 180;

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

function plunge(ctx, xc, E, Vx, U) {
  const { surface, splash, rand } = ctx;
  const toRight = 0.5 + 0.3 * (Vx / Math.max(U, 1e-6));
  for (let i = 0, n = 3 + Math.round(7 * E); i < n; i++) {
    const side = rand() < toRight ? 1 : -1;
    const theta = (12 + 38 * rand()) * RAD;
    const spd = P.vThrow * (0.45 + 0.55 * E) * (0.6 + 0.4 * rand());
    const x = xc + (rand() * 2 - 1) * 0.014;
    splash.spawn(x, yLine(surface, x) - 0.002 - 0.004 * rand(), side * Math.sin(theta) * spd + 0.25 * Vx, -Math.cos(theta) * spd);
  }
  surface.addVelocity(xc, 0.02, -P.plungeKick * E);
  surface.addFoam(xc, 0.03, P.plungeFoam * E);
}

function exit(ctx, xc, E, Vx, Vy) {
  const { surface, splash, rand } = ctx;
  for (let i = 0, n = 2 + Math.round(4 * E); i < n; i++) {
    const x = xc + (rand() * 2 - 1) * 0.01;
    splash.spawn(x, yLine(surface, x) - 0.003, 0.4 * Vx + (rand() * 2 - 1) * 0.15, 0.55 * Vy * (0.7 + 0.3 * rand()));
  }
  surface.addVelocity(xc, 0.02, P.exitKick * E);
}

function skim(ctx, h, Vx) {
  const { surface, splash, rand } = ctx;
  const E = clamp((Math.abs(Vx) - P.skimVx) / 1.5, 0, 1);
  ctx.skim += P.skimRate * E * SIM.dt;
  for (; ctx.skim >= 1; ctx.skim -= 1) {
    splash.spawn(h.x1, yLine(surface, h.x1) - 0.003, 0.55 * Vx + (rand() * 2 - 1) * 0.1, -1.5 * (0.3 + 0.4 * rand()) * E);
  }
}

/** The cursor moved from (x0, y0) to (x1, y1) this step: stir, dimple, and throw spray where it crosses or skims the line. */
export function applyCursor(ctx, h) {
  const { surface, field, stats } = ctx;
  const dx = h.x1 - h.x0;
  const dy = h.y1 - h.y0;
  const L = Math.hypot(dx, dy);
  const Vx = dx / SIM.dt;
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
  if (d0 < 0 && d1 >= 0 && Vy > P.plungeVy && ctx.time >= ctx.coolPlunge) {
    const xc = crossing();
    if (xc < BERG_L || xc > BERG_R) { // an open column, not the iceberg
      plunge(ctx, xc, E, Vx, U);
      ctx.coolPlunge = ctx.time + P.cooldown;
    }
  } else if (d0 >= 0 && d1 < 0 && -Vy > P.plungeVy && ctx.time >= ctx.coolExit) {
    const xc = crossing();
    if (xc < BERG_L || xc > BERG_R) {
      exit(ctx, xc, E, Vx, Vy);
      ctx.coolExit = ctx.time + P.cooldown;
    }
  }
  if (Math.abs(d1) < P.skimSurface && Math.abs(Vx) > P.skimVx) skim(ctx, h, Vx);
  else ctx.skim = 0;
}

/** A click or tap at (x, y): a crown at the surface, a drip in the air, a ring under water. */
export function applyPress(ctx, { x, y }, headVx) {
  const { surface, field, splash, rand } = ctx;
  const d = y - yLine(surface, x);
  if (Math.abs(d) < P.crownDepth) {
    for (let i = 0, n = P.crown; i < n; i++) {
      const theta = ((((i + 0.5) / n) - 0.5) * 2 * 55 + (rand() - 0.5) * 8) * RAD; // a fan about the vertical
      const spd = P.vThrow * (0.6 + 0.4 * rand());
      const px = x + (rand() * 2 - 1) * 0.014;
      splash.spawn(px, yLine(surface, px) - 0.002 - 0.004 * rand(), Math.sin(theta) * spd, -Math.cos(theta) * spd);
    }
    surface.addVelocity(x, 0.02, -P.crownKick);
    surface.addFoam(x, 0.03, P.crownFoam);
  } else if (d < 0) {
    splash.spawnLargest(x, y, 0.3 * headVx, 0);
  } else {
    field.addImpulse(x, y, C.pressRing, C.pressRingR);
  }
}

/** A drop met the water at info.x: kick the surface and the field, leave foam, and sometimes throw a jet back up. */
export function landDrop(ctx, info) {
  const { surface, field, splash, rand } = ctx;
  const rad = radiusOfSlot(info.slot);
  const q = (rad / P.rMax) ** 2;
  const vy = Math.max(info.vy, 0);
  surface.addVelocity(info.x, 0.012, -P.landKick * q * Math.min(vy, 3));
  field.addImpulse(info.x, yLine(surface, info.x) + 0.03, (P.landField * q * vy) / 1.5, footprint(ctx).r);
  surface.addFoam(info.x, 0.02, P.landFoam * q);
  if (vy > 1.4 && rad > 0.6 * P.rMax && rand() < 0.3) {
    splash.spawn(info.x, yLine(surface, info.x) - 0.003, 0, -0.4 * vy);
  }
}

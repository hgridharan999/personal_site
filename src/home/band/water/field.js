import { WL } from '../iceberg.js';
import { SIM, FIELD as F } from './constants.js';
import { encodeSigned } from './pack.js';

/*
 * The water under the line: a 2D wave equation on a coarse grid, simulated on the CPU.
 *
 *   u_tt = c^2 (u_xx + u_yy) - damping
 *
 * Ripples radiate from wherever the cursor stirs, interfere, and fade. The top row is the free
 * surface (ghost = -u: pressure release, so waves flip sign when they reflect off it); the floor and
 * the sides are mirrors. The iceberg is not part of it: the ripples live in the water plane in
 * front of the ice and cross it exactly as they cross open water. What the shader gets is
 * R = the ripple height and G/B = its gradient, which is what bends the light and the caustics.
 */

/** Cell counts for a band of this aspect: about F.cells cells, never finer than 1/64 of the band height. */
export function fieldDims(aspect, maxTexture = 4096) {
  const cell = Math.max(F.cellMin, Math.sqrt((aspect * F.depth) / F.cells));
  const nx = Math.max(2, Math.min(Math.ceil(aspect / cell), F.nxMax, maxTexture));
  const ny = Math.max(2, Math.min(Math.round(F.depth / cell), maxTexture));
  return { nx, ny, dx: aspect / nx, dy: F.depth / ny, cell };
}

/** c dt sqrt(1/dx^2 + 1/dy^2): the 2D wave equation is stable below 1. */
export function fieldStability({ dx, dy }) {
  return F.c * SIM.dt * Math.sqrt(1 / (dx * dx) + 1 / (dy * dy));
}

/** The zero-mean stir kernel: (1 - s) e^(-s) with s = (rho / r)^2. Its integral over the plane is 0. */
export const psi = (rho, r) => {
  const s = (rho * rho) / (r * r);
  return (1 - s) * Math.exp(-s);
};

const clamp1 = (x) => (x > 1 ? 1 : x < -1 ? -1 : x);

export function createField(aspect, maxTexture) {
  const { nx, ny, dx, dy, cell } = fieldDims(aspect, maxTexture);
  const x0 = -aspect / 2;
  const u = new Float64Array(nx * ny);
  const v = new Float64Array(nx * ny);
  const ax = (F.c * F.c * SIM.dt) / (dx * dx);
  const ay = (F.c * F.c * SIM.dt) / (dy * dy);
  const damp = Math.exp(-F.damp * SIM.dt);
  let active = false;
  let count = 0;
  let maxU = 0;
  let maxV = 0;

  function zero() {
    u.fill(0);
    v.fill(0);
    active = false;
    count = 0;
  }

  return {
    dims: Object.freeze({ nx, ny, dx, dy, cell }),
    get active() { return active; },

    /** Add `peak * psi(rho, r)` to the velocity around (x, y): a zero-mean ring that radiates outward. */
    addImpulse(x, y, peak, r) {
      const reach = 3.5 * r;
      const i0 = Math.max(0, Math.floor((x - reach - x0) / dx));
      const i1 = Math.min(nx - 1, Math.ceil((x + reach - x0) / dx));
      const j0 = Math.max(0, Math.floor((y - reach - WL) / dy));
      const j1 = Math.min(ny - 1, Math.ceil((y + reach - WL) / dy));
      for (let j = j0; j <= j1; j++) {
        const py = WL + (j + 0.5) * dy - y;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + (i + 0.5) * dx - x;
          const rho = Math.hypot(px, py);
          if (rho < reach) v[j * nx + i] += peak * psi(rho, r);
        }
      }
      active = true;
    },

    /** The cursor's stir: `amount` of velocity per unit of path, spread over radius r (so a stroke's total does not depend on its sampling). */
    stir(x, y, amount, r) {
      this.addImpulse(x, y, amount / r, r);
    },

    step() {
      if (!active) return;
      maxU = 0;
      maxV = 0;
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = 0; i < nx; i++) {
          const k = row + i;
          const c = u[k];
          const l = i > 0 ? u[k - 1] : c;
          const rr = i < nx - 1 ? u[k + 1] : c;
          const up = j > 0 ? u[k - nx] : -c;
          const dn = j < ny - 1 ? u[k + nx] : c;
          v[k] = (v[k] + ax * (l - 2 * c + rr) + ay * (up - 2 * c + dn)) * damp;
        }
      }
      for (let k = 0; k < u.length; k++) {
        u[k] += SIM.dt * v[k];
        const au = Math.abs(u[k]);
        const av = Math.abs(v[k]);
        if (au > maxU) maxU = au;
        if (av > maxV) maxV = av;
      }
      if (++count % 8 === 0 && maxU < F.idleU && maxV < F.idleV) zero();
    },

    reset: zero,

    /** 1/2 sum(v^2) + 1/2 c^2 sum(|grad u|^2) over the cells, with the same boundaries the step uses. */
    energy() {
      let e = 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          e += 0.5 * v[k] * v[k];
          if (i < nx - 1) e += (0.5 * F.c * F.c * (u[k + 1] - u[k]) ** 2) / (dx * dx);
          if (j < ny - 1) e += (0.5 * F.c * F.c * (u[k + nx] - u[k]) ** 2) / (dy * dy);
          if (j === 0) e += (0.5 * F.c * F.c * 2 * u[k] * u[k]) / (dy * dy); // the surface ghost
        }
      }
      return e * dx * dy;
    },

    /** Write the nx x ny RGBA texture: R = ripple height, G/B = its gradient (signed), A unused. */
    encode(out) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const c = u[k];
          const gx = ((i < nx - 1 ? u[k + 1] : c) - (i > 0 ? u[k - 1] : c)) / (2 * dx);
          const gy = ((j < ny - 1 ? u[k + nx] : c) - (j > 0 ? u[k - nx] : -c)) / (2 * dy);
          const o = 4 * k;
          out[o] = encodeSigned(clamp1(F.rhScale * c));
          out[o + 1] = encodeSigned(clamp1(F.gradScale * gx));
          out[o + 2] = encodeSigned(clamp1(F.gradScale * gy));
          out[o + 3] = 0;
        }
      }
    },

    /** For tests: set the state directly (arrays of nx * ny numbers; either may be omitted). */
    load({ u: us, v: vs } = {}) {
      if (us) u.set(us);
      if (vs) v.set(vs);
      active = true;
    },

    snapshot: () => ({ u: Array.from(u), v: Array.from(v), active }),
  };
}

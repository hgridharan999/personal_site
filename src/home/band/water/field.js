import { WL, insideBerg } from '../iceberg.js';
import { SIM, FIELD as F } from './constants.js';
import { smoothstep } from './head.js';
import { encodeSigned } from './pack.js';

/*
 * The water under the line: a 2D wave equation on a coarse grid, simulated on the CPU.
 *
 *   u_tt = c^2 (u_xx + u_yy) - damping
 *
 * Ripples radiate from wherever the cursor stirs, interfere, and fade. The top row is the free
 * surface (ghost = -u: pressure release, so waves flip sign when they reflect off it); the floor and
 * the sides are mirrors. The iceberg is solid: its cells hold u = v = 0, and an open cell treats a
 * solid neighbour exactly like a side wall (its own value), so ripples bounce off the hull and
 * nothing moves inside the ice. What the shader gets is R = the ripple height and G/B = its
 * gradient, which is what bends the light and the caustics.
 *
 * Every neighbour lookup goes through one table (nl, nr, nu, nd) built once from that rule, so the
 * step, the encoder and the energy cannot disagree about a wall.
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
  const n = nx * ny;
  const u = new Float64Array(n);
  const v = new Float64Array(n);
  const ax = (F.c * F.c * SIM.dt) / (dx * dx);
  const ay = (F.c * F.c * SIM.dt) / (dy * dy);
  const damp = Math.exp(-F.damp * SIM.dt);
  let active = false;
  let count = 0;
  let maxU = 0;
  let maxV = 0;

  // the iceberg, sampled at the cell centres
  const solid = new Uint8Array(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) solid[j * nx + i] = insideBerg(x0 + (i + 0.5) * dx, WL + (j + 0.5) * dy) ? 1 : 0;
  }
  // neighbour table: a wall (side, floor, ice) answers with the cell itself; above the top row is the
  // free surface, marked -1 (its ghost value is -u)
  const nl = new Int32Array(n);
  const nr = new Int32Array(n);
  const nu = new Int32Array(n);
  const nd = new Int32Array(n);
  const open = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      nl[k] = nr[k] = nu[k] = nd[k] = k;
      if (solid[k]) continue;
      open.push(k);
      if (i > 0 && !solid[k - 1]) nl[k] = k - 1;
      if (i < nx - 1 && !solid[k + 1]) nr[k] = k + 1;
      nu[k] = j === 0 ? -1 : solid[k - nx] ? k : k - nx;
      if (j < ny - 1 && !solid[k + nx]) nd[k] = k + nx;
    }
  }
  const cells = Int32Array.from(open);

  // How much of the ripples' light bending to draw in each cell. The ice is drawn by the shader, and
  // bending its silhouette from the water side makes bumps on the hull's edge, so the gradient fades
  // out over the last few cells before the ice (the ripples themselves still reflect off it).
  const bend = new Float64Array(n).fill(1);
  {
    const dist = new Int16Array(n).fill(-1);
    const queue = [];
    for (let k = 0; k < n; k++) if (solid[k]) { dist[k] = 0; queue.push(k); }
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q];
      const i = k % nx;
      for (const m of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, k >= nx ? k - nx : -1, k < n - nx ? k + nx : -1]) {
        if (m >= 0 && dist[m] < 0) {
          dist[m] = dist[k] + 1;
          queue.push(m);
        }
      }
    }
    for (let k = 0; k < n; k++) if (dist[k] > 0) bend[k] = smoothstep(1, 1 + F.hullFade, dist[k]);
  }

  function zero() {
    u.fill(0);
    v.fill(0);
    active = false;
    count = 0;
  }

  return {
    dims: Object.freeze({ nx, ny, dx, dy, cell }),
    get active() { return active; },

    /** Add `peak * psi(rho, r)` to the velocity around (x, y): a zero-mean ring that radiates outward. Ice cells are skipped. */
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
          const k = j * nx + i;
          if (rho < reach && !solid[k]) v[k] += peak * psi(rho, r);
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
      for (let m = 0; m < cells.length; m++) {
        const k = cells[m];
        const c = u[k];
        const up = nu[k] < 0 ? -c : u[nu[k]];
        v[k] = (v[k] + ax * (u[nl[k]] - 2 * c + u[nr[k]]) + ay * (up - 2 * c + u[nd[k]])) * damp;
      }
      for (let m = 0; m < cells.length; m++) {
        const k = cells[m];
        u[k] += SIM.dt * v[k];
        const au = Math.abs(u[k]);
        const av = Math.abs(v[k]);
        if (au > maxU) maxU = au;
        if (av > maxV) maxV = av;
      }
      if (++count % 8 === 0 && maxU < F.idleU && maxV < F.idleV) zero();
    },

    reset: zero,

    /** 1/2 sum(v^2) + 1/2 c^2 sum(|grad u|^2) over the open cells, with the same walls the step uses. */
    energy() {
      let e = 0;
      for (let m = 0; m < cells.length; m++) {
        const k = cells[m];
        e += 0.5 * v[k] * v[k];
        // each face once, through the right and lower neighbours; a wall's face (neighbour = itself) adds nothing
        e += (0.5 * F.c * F.c * (u[nr[k]] - u[k]) ** 2) / (dx * dx);
        e += (0.5 * F.c * F.c * (u[nd[k]] - u[k]) ** 2) / (dy * dy);
        if (nu[k] < 0) e += (0.5 * F.c * F.c * 2 * u[k] * u[k]) / (dy * dy); // the surface ghost
      }
      return e * dx * dy;
    },

    /**
     * Write the nx x ny RGBA texture: R = ripple height, G/B = its gradient (signed), A unused. Ice
     * cells stay at rest, and the gradient fades out toward the ice (see `bend`).
     */
    encode(out) {
      out.fill(0);
      for (let k = 0; k < n; k++) {
        const o = 4 * k;
        if (solid[k]) {
          out[o] = out[o + 1] = out[o + 2] = encodeSigned(0);
          continue;
        }
        const c = u[k];
        const gx = (u[nr[k]] - u[nl[k]]) / (2 * dx);
        const gy = (u[nd[k]] - (nu[k] < 0 ? -c : u[nu[k]])) / (2 * dy);
        out[o] = encodeSigned(clamp1(F.rhScale * c));
        out[o + 1] = encodeSigned(clamp1(F.gradScale * gx * bend[k]));
        out[o + 2] = encodeSigned(clamp1(F.gradScale * gy * bend[k]));
      }
    },

    /** For tests: set the state directly (arrays of nx * ny numbers; either may be omitted). */
    load({ u: us, v: vs } = {}) {
      if (us) u.set(us);
      if (vs) v.set(vs);
      for (let k = 0; k < n; k++) if (solid[k]) u[k] = v[k] = 0;
      active = true;
    },

    /** Whether the cell at column i, row j is ice. */
    isSolid: (i, j) => solid[j * nx + i] === 1,

    snapshot: () => ({ u: Array.from(u), v: Array.from(v), solid: Array.from(solid), active }),
  };
}

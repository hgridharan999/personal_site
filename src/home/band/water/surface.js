import { SIM, SURFACE as S } from './constants.js';
import { encodeSigned } from './pack.js';

/*
 * The waterline: a 1D dispersive (Boussinesq) wave, simulated on the CPU.
 *
 *   h_tt = c^2 D2(h + p) + beta D2 h_tt - damping - viscosity
 *
 * Waves travel at c / sqrt(1 + beta k^2), so long swells lead and short ripples trail. The water is
 * one basin across the whole band with reflecting walls (mirror ghosts) at its two ends. The
 * iceberg is not part of it: the waves live in the water plane in front of the ice and pass over it
 * exactly as they pass over open water. The step is semi-implicit: the beta term is a tridiagonal
 * solve (Thomas algorithm, factors precomputed), and the gradient and the velocity update are
 * stable for any column count.
 *
 * h is eta, the height of the water above its rest level (positive = up); p is a pressure pressing
 * the surface down (the cursor's dimple), recomputed by the caller every step.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Columns for a band of this aspect (width / height), cell-centred; never more than the GPU can take as a texture width. */
export function surfaceCols(aspect, maxCols = S.colsMax) {
  const n = clamp(Math.ceil(aspect * S.colsPerAspect), S.colsMin, S.colsMax);
  return Math.max(2, Math.min(n, maxCols));
}

/** The highest frequency the grid can carry, times the step: it has to stay under 2 for stability. */
export function surfaceStability({ dx }) {
  const lambda = 4 / (dx * dx); // largest eigenvalue of -D2
  const omega = S.c * Math.sqrt(lambda / (1 + S.beta * lambda));
  return { omega, omegaDt: omega * SIM.dt };
}

/** Phase speed of a wave of wavenumber k. */
export const phaseSpeed = (k) => S.c / Math.sqrt(1 + S.beta * k * k);

/** @param {number} aspect band width / height */
export function createSurface(aspect, { maxCols = S.colsMax } = {}) {
  const n = surfaceCols(aspect, maxCols);
  const dx = aspect / n;
  const x0 = -aspect / 2;
  const xAt = (j) => x0 + (j + 0.5) * dx;

  // (I - beta D2): tridiagonal, with the mirror ends giving 1 + b on the end diagonals
  const b = S.beta / (dx * dx);
  const cprime = new Float64Array(n);
  const invden = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const diag = 1 + (j === 0 || j === n - 1 ? 1 : 2) * b;
    const den = diag + b * (j === 0 ? 0 : cprime[j - 1]);
    invden[j] = 1 / den;
    cprime[j] = j === n - 1 ? 0 : -b / den;
  }

  const h = new Float64Array(n);
  const v = new Float64Array(n);
  const p = new Float64Array(n);
  const foam = new Float64Array(n);
  const u = new Float64Array(n); // scratch: h + p
  const r = new Float64Array(n); // scratch: the right-hand side, then the solved acceleration
  const w = new Float64Array(n); // scratch: v before smoothing
  const c2 = (S.c * S.c) / (dx * dx);
  const damp = Math.exp(-S.damp * SIM.dt);
  const eps = Math.min(0.25, (S.nu * SIM.dt) / (dx * dx));
  const foamDecay = Math.exp(-SIM.dt / S.foamDecay);
  let active = false;
  let count = 0;

  function solve() {
    // r = c^2 D2(h + p), solved against (I - beta D2); the right-hand side is overwritten by the solution
    for (let j = 0; j < n; j++) u[j] = h[j] + p[j];
    for (let j = 0; j < n; j++) {
      const lo = j > 0 ? u[j - 1] : u[j];
      const hi = j < n - 1 ? u[j + 1] : u[j];
      r[j] = c2 * (lo - 2 * u[j] + hi);
    }
    r[0] *= invden[0];
    for (let j = 1; j < n; j++) r[j] = (r[j] + b * r[j - 1]) * invden[j];
    for (let j = n - 2; j >= 0; j--) r[j] -= cprime[j] * r[j + 1];
  }

  function advance() {
    for (let j = 0; j < n; j++) w[j] = (v[j] + SIM.dt * r[j]) * damp;
    let mh = 0;
    let mv = 0;
    for (let j = 0; j < n; j++) {
      const lo = j > 0 ? w[j - 1] : w[j];
      const hi = j < n - 1 ? w[j + 1] : w[j];
      v[j] = clamp(w[j] + eps * (lo - 2 * w[j] + hi), -S.vMax, S.vMax);
      h[j] = clamp(h[j] + SIM.dt * v[j], -S.hMax, S.hMax);
      mh += h[j];
      mv += v[j];
    }
    // the basin cannot create or destroy water, so its mean stays exactly 0
    mh /= n;
    mv /= n;
    for (let j = 0; j < n; j++) {
      h[j] = clamp(h[j] - mh, -S.hMax, S.hMax);
      v[j] = clamp(v[j] - mv, -S.vMax, S.vMax);
      foam[j] = clamp(foam[j] * foamDecay + S.foamRate * Math.max(Math.abs(v[j]) - S.foamV0, 0) * SIM.dt, 0, 1);
    }
  }

  function zero() {
    h.fill(0);
    v.fill(0);
    p.fill(0);
    foam.fill(0);
    active = false;
    count = 0;
  }

  /** Add `amount * exp(-((x - xc) / width)^2)` to `target` (a peak-normalised bump). */
  function bump(target, xc, width, amount, limit = Infinity) {
    const lo = Math.max(0, Math.floor((xc - 4 * width - x0) / dx));
    const hi = Math.min(n - 1, Math.ceil((xc + 4 * width - x0) / dx));
    for (let j = lo; j <= hi; j++) {
      const t = (xAt(j) - xc) / width;
      target[j] = Math.min(limit, target[j] + amount * Math.exp(-t * t));
    }
    active = true;
  }

  return {
    dims: Object.freeze({ n, dx, aspect }),
    get active() { return active; },

    /** The water height at x (linear between column centres). */
    eta(x) {
      const f = clamp((x - x0) / dx - 0.5, 0, n - 1);
      const i = Math.min(Math.floor(f), n - 2);
      return h[i] + (h[i + 1] - h[i]) * (f - i);
    },

    /** Add a bump to the vertical velocity (peak `amount` in band heights per second, Gaussian of width `width`). */
    addVelocity: (xc, width, amount) => bump(v, xc, width, amount),
    /** Add a bump to the pressure for this step only (the step uses it, then clears it). */
    addPressure: (xc, width, amount) => bump(p, xc, width, amount),
    /** Add foam, saturating at 1. */
    addFoam: (xc, width, amount) => bump(foam, xc, width, amount, 1),

    step() {
      if (!active) return;
      solve();
      advance();
      p.fill(0);
      if (++count % S.idleEvery) return;
      // everything has come to rest: say so exactly, so the sim can stop spending anything
      let big = 0;
      for (let j = 0; j < n; j++) {
        big = Math.max(big, Math.abs(h[j]) / S.idleH, Math.abs(v[j]) / S.idleV, foam[j] * 255);
      }
      if (big < 1) zero();
    },

    reset: zero,

    /** E = 1/2 v.(I - beta D2)v + 1/2 c^2 |grad h|^2: what the damping drains. */
    energy() {
      let e = 0;
      for (let j = 0; j < n; j++) {
        e += 0.5 * dx * v[j] * v[j];
        if (j < n - 1) {
          e += 0.5 * S.beta * dx * ((v[j + 1] - v[j]) / dx) ** 2;
          e += 0.5 * S.c * S.c * dx * ((h[j + 1] - h[j]) / dx) ** 2;
        }
      }
      return e;
    },

    /** Write the n x 1 RGBA texture: R = eta, G = slope (both signed), B unused, A = foam. */
    encode(out) {
      for (let j = 0; j < n; j++) {
        const lo = Math.max(j - 1, 0);
        const hi = Math.min(j + 1, n - 1);
        const slope = (h[hi] - h[lo]) / ((hi - lo) * dx);
        out[4 * j] = encodeSigned(h[j] / S.etaScale);
        out[4 * j + 1] = encodeSigned(slope / S.slopeScale);
        out[4 * j + 2] = encodeSigned(0);
        out[4 * j + 3] = Math.round(255 * clamp(foam[j], 0, 1));
      }
    },

    /** For tests: set the state directly (arrays of n numbers; either may be omitted). */
    load({ h: hs, v: vs } = {}) {
      if (hs) h.set(hs);
      if (vs) v.set(vs);
      active = true;
    },

    snapshot: () => ({ h: Array.from(h), v: Array.from(v), foam: Array.from(foam), active }),
  };
}

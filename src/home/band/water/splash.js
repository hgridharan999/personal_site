import { SIM, SPLASH as P } from './constants.js';

/*
 * Splash drops: a fixed pool of beads thrown by the cursor or a tap. They arc under gravity with a
 * little air drag, vanish into the iceberg, and when one meets the water the caller is told where
 * and how hard (it kicks the surface and the field and leaves foam). A full pool skips a spawn
 * rather than recycling a drop that is still in the air.
 */

/** Pool size from MAX_FRAGMENT_UNIFORM_VECTORS: 32, 16 or 8 drops (the shader holds them as uniforms). */
export function pickDropN(maxVectors) {
  if (maxVectors >= 64) return 32;
  if (maxVectors >= 32) return 16;
  return 8;
}

/** What createRenderer tries in turn; 0 compiles the drops out (splashes still move the water). */
export const dropCandidates = (maxVectors) => [...new Set([pickDropN(maxVectors), 8, 0])];

/** The same formula as the shader: sizes vary by slot, golden-ratio spaced. */
export function radiusOfSlot(i) {
  const f = i * 0.618034;
  return P.rMin + (P.rMax - P.rMin) * (f - Math.floor(f));
}

const SPEED_DECAY = Math.exp(-P.drag * SIM.dt);

/**
 * @param {number} dropN pool size
 */
export function createSplash(dropN) {
  const x = new Float64Array(dropN);
  const y = new Float64Array(dropN);
  const vx = new Float64Array(dropN);
  const vy = new Float64Array(dropN);
  const age = new Float64Array(dropN);
  const live = new Uint8Array(dropN);
  let alive = 0;

  const place = (i, px, py, ux, uy) => {
    x[i] = px; y[i] = py; vx[i] = ux; vy[i] = uy; age[i] = 0;
    live[i] = 1;
    alive++;
    return i;
  };
  const kill = (i) => {
    live[i] = 0;
    alive--;
  };

  return {
    get alive() { return alive; },

    /** Throw a drop from (px, py) with velocity (ux, uy). Returns its slot, or -1 when the pool is full. */
    spawn(px, py, ux, uy) {
      const i = live.indexOf(0);
      return i < 0 ? -1 : place(i, px, py, ux, uy);
    },

    /** Same, but into the free slot with the biggest drop (a slow drip should look heavy). */
    spawnLargest(px, py, ux, uy) {
      let best = -1;
      for (let i = 0; i < dropN; i++) {
        if (!live[i] && (best < 0 || radiusOfSlot(i) > radiusOfSlot(best))) best = i;
      }
      return best < 0 ? -1 : place(best, px, py, ux, uy);
    },

    /**
     * Fly every drop one step.
     * @param {{ yLine(x: number): number, inside(x: number, y: number): boolean, halfW: number,
     *           onLand(drop: { x: number, y: number, vy: number, slot: number }): void }} env
     */
    step(env) {
      for (let i = 0; i < dropN; i++) {
        if (!live[i]) continue;
        const ox = x[i];
        const oy = y[i];
        age[i] += SIM.dt;
        vx[i] *= SPEED_DECAY;
        vy[i] = vy[i] * SPEED_DECAY + P.g * SIM.dt;
        x[i] += vx[i] * SIM.dt;
        y[i] += vy[i] * SIM.dt;
        if (age[i] > P.life || Math.abs(x[i]) > env.halfW + P.killX || y[i] > P.killY || env.inside(x[i], y[i])) {
          kill(i);
          continue;
        }
        const d1 = y[i] - env.yLine(x[i]);
        if (d1 < 0) continue;
        // it reached the water: find where it crossed the line, then hand the splash to the caller
        const d0 = oy - env.yLine(ox);
        const f = d0 < 0 ? -d0 / (d1 - d0) : 1;
        const info = { x: ox + f * (x[i] - ox), y: oy + f * (y[i] - oy), vy: vy[i], slot: i };
        kill(i);
        env.onLand(info);
      }
    },

    /**
     * Write the shader's drop uniforms: (x, y, vx, vy) per slot, positions run ahead by `lead` (the
     * time left over after the last whole step); unused slots sit at y = SPLASH.dead. `box` gets the
     * bounds of every drop and its streak, or an inverted (empty) box.
     */
    fill(out, box, lead = 0) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < dropN; i++) {
        if (!live[i]) {
          out[4 * i] = 0; out[4 * i + 1] = P.dead; out[4 * i + 2] = 0; out[4 * i + 3] = 0;
          continue;
        }
        const px = x[i] + vx[i] * lead;
        const py = y[i] + vy[i] * lead;
        out[4 * i] = px; out[4 * i + 1] = py; out[4 * i + 2] = vx[i]; out[4 * i + 3] = vy[i];
        const m = P.rMax + 0.006;
        const tx = px - vx[i] * P.streak;
        const ty = py - vy[i] * P.streak;
        x0 = Math.min(x0, px, tx) - m; x1 = Math.max(x1, px, tx) + m;
        y0 = Math.min(y0, py, ty) - m; y1 = Math.max(y1, py, ty) + m;
      }
      if (alive > 0) {
        box[0] = x0; box[1] = y0; box[2] = x1; box[3] = y1;
      } else {
        box[0] = 1e3; box[1] = 1e3; box[2] = -1e3; box[3] = -1e3;
      }
    },

    reset() {
      live.fill(0);
      alive = 0;
    },

    snapshot: () => Array.from(live, (l, i) => (l ? { slot: i, x: x[i], y: y[i], vx: vx[i], vy: vy[i], age: age[i] } : null)).filter(Boolean),
  };
}

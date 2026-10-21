import { clamp, smoothstep } from './math.js';

// Terrain sampling and the layout of the ruled lines. Pure: it reads a height grid and returns
// numbers, so it runs in node and the canvas code only has to stroke what it is given.

const FLOOR = 800; // metres: the plains around the massif
const RELIEF = 5070; // metres of relief drawn above the plains
const ROW_FIRST = 0; // the lines run north to south across the whole massif and its plains
const NEAR_FADE_ROWS = 11; // only the last few rows (already plains) ease into plain ruled lines
const PERSPECTIVE = 0.45; // the lines spread a little toward the front
const PHONE_BELOW = 600; // px: narrower bands get the phone layout
// the slice of the grid a phone shows: plains to plains, so the edges never cut through a slope
export const PHONE_COLUMNS = [20, 230];
const DESKTOP_MAX_WIDTH = 1180;
const DESKTOP_MARGIN = 96;

export const isPhone = (width) => width < PHONE_BELOW;
export const lineCount = (phone) => (phone ? 48 : 64);

/** Metres above the floor that get drawn for a ground height; flat at and below the plains. */
export function liftOf(height) {
  const u = (height - FLOOR) / RELIEF;
  return u <= 0 ? 0 : RELIEF * (u > 1 ? 1 : u);
}

/**
 * Reads the fetched terrain file into what the sampler needs: a typed array of heights, the grid
 * size, and the two peaks the labels sit on. Throws on a file that does not add up.
 */
export function parseTerrain(data) {
  const [cols, rows] = data?.grid ?? [];
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 4 || rows < 4) throw new Error('terrain: bad grid');
  if (!Array.isArray(data.heights) || data.heights.length !== cols * rows) throw new Error('terrain: heights do not fill the grid');
  let summit = [132.92, 91.4];
  let mawenzi = [170.24, 98.62];
  for (const p of data.points ?? []) {
    if (/Uhuru/.test(p.name)) summit = [p.col, p.row];
    if (/Mawenzi/.test(p.name)) mawenzi = [p.col, p.row];
  }
  return { cols, rows, heights: Float32Array.from(data.heights), cellMetres: data.cellMetres ?? 229, summit, mawenzi };
}

/** Catmull-Rom along one grid row. */
function rowHeight(t, r, c) {
  const { heights: g, cols } = t;
  const row = r * cols;
  const i = Math.floor(c);
  const f = c - i;
  const p0 = g[row + clamp(i - 1, 0, cols - 1)];
  const p1 = g[row + clamp(i, 0, cols - 1)];
  const p2 = g[row + clamp(i + 1, 0, cols - 1)];
  const p3 = g[row + clamp(i + 2, 0, cols - 1)];
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
}

/** Ground height in metres at fractional row `rf` and column `cf`: smooth along a row, linear between rows. */
export function heightAt(t, rf, cf) {
  const r = clamp(rf, 0, t.rows - 1);
  const c = clamp(cf, 0, t.cols - 1);
  const r0 = Math.floor(r);
  const r1 = Math.min(t.rows - 1, r0 + 1);
  const f = r - r0;
  const a = rowHeight(t, r0, c);
  return f === 0 ? a : a + (rowHeight(t, r1, c) - a) * f;
}

const persp = (u) => (u + PERSPECTIVE * u * u) / (1 + PERSPECTIVE);
const ampOf = (u) => 0.86 + 0.14 * u;
const taper = (u) => smoothstep(0, 0.06, u) * smoothstep(1, 0.94, u);

/**
 * Lays the ruled lines out in a band `width` by `height` px.
 *
 * Returns the per-line, per-sample arrays (`xs` is shared by every line; `yS` and `eS` hold line
 * i's sample k at `i * K + k`: screen y, and the real elevation in metres that colours it), plus
 * `drape(col, row)`, which puts any grid position on the stack as [x, y, lineIndex].
 */
export function layoutLines(terrain, width, height, phone) {
  const { cols, rows } = terrain;
  const lastRow = rows - 1;
  const N = lineCount(phone);
  const K = Math.ceil(width / (phone ? 2 : 3)) + 1;
  const cA = phone ? PHONE_COLUMNS[0] : 0;
  const cB = phone ? PHONE_COLUMNS[1] : cols - 1;
  const SW = phone ? width : Math.max(1, Math.min(width - DESKTOP_MARGIN, DESKTOP_MAX_WIDTH));
  const sx0 = phone ? 0 : (width - SW) / 2;

  const colToX = (c) => sx0 + ((c - cA) / (cB - cA)) * SW;
  const xToCol = (x) => cA + ((x - sx0) / SW) * (cB - cA);
  // metres above the floor, faded over the last rows. On a desktop the stage is narrower than the
  // band and the lines carry on past it as plain ruled lines, so the stage edges fade too. A phone's
  // stage is the whole screen and its slice ends on the plains, so its lines just run off the edge.
  const edge = phone ? () => 1 : taper;
  const liftAt = (rf, x) => {
    const u = (x - sx0) / SW;
    if (u < 0 || u > 1) return 0;
    return liftOf(heightAt(terrain, rf, cA + u * (cB - cA))) * edge(u) * smoothstep(lastRow, lastRow - NEAR_FADE_ROWS, rf);
  };

  const xs = new Float32Array(K);
  for (let k = 0; k < K; k += 1) xs[k] = (k / (K - 1)) * width;

  const lineRow = new Float32Array(N);
  const raw = new Float32Array(N * K);
  const eS = new Float32Array(N * K);
  const maxLift = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    lineRow[i] = ROW_FIRST + (i / (N - 1)) * (lastRow - ROW_FIRST);
    let m = 0;
    for (let k = 0; k < K; k += 1) {
      const v = liftAt(lineRow[i], xs[k]);
      raw[i * K + k] = v;
      if (v > m) m = v;
      eS[i * K + k] = heightAt(terrain, lineRow[i], xToCol(xs[k]));
    }
    maxLift[i] = m;
  }

  // fit the stack: the front line sits on the floor of the band, the tallest ridge stops short of its top
  const topPad = phone ? 16 : 22;
  const botPad = phone ? 5 : 6;
  const depth = height * (phone ? 0.52 : 0.5);
  const base0 = height - botPad - depth;
  const lineBase = new Float32Array(N);
  let fit = Infinity;
  for (let i = 0; i < N; i += 1) {
    const u = i / (N - 1);
    lineBase[i] = base0 + depth * persp(u);
    if (maxLift[i] > 0) fit = Math.min(fit, (lineBase[i] - topPad) / (maxLift[i] * ampOf(u)));
  }
  const amp = Number.isFinite(fit) ? fit : 0; // flat ground: nothing to scale
  const lineAmp = new Float32Array(N);
  for (let i = 0; i < N; i += 1) lineAmp[i] = amp * ampOf(i / (N - 1));
  const yS = new Float32Array(N * K);
  for (let i = 0; i < N; i += 1) for (let k = 0; k < K; k += 1) yS[i * K + k] = lineBase[i] - lineAmp[i] * raw[i * K + k];

  const lineOf = (row) => ((row - ROW_FIRST) / (lastRow - ROW_FIRST)) * (N - 1);
  const drape = (col, row) => {
    const x = colToX(col);
    const li = lineOf(row);
    const u = li / (N - 1);
    return [x, base0 + depth * persp(u) - amp * ampOf(u) * liftAt(row, x), li];
  };

  return { width, height, phone, N, K, xs, yS, eS, lineBase, lineAmp, sx0, SW, cA, cB, drape };
}

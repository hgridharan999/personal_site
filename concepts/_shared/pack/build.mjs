// Exploded 14er pack: a technical day pack on a summit rock that comes apart into the Ten Essentials.
// node build.mjs  ->  index.html (standalone, kit inlined)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../../../.claude/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../../../.claude/skills/anatomy/kit/tube.mjs";
import { kitScript } from "../../../../.claude/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIGHT = process.argv.includes("--light");
const THEME = LIGHT ? "light" : "dark";
const OUT = LIGHT ? "index-light.html" : "index.html";
const AZ = 50;
const EL = 30;
const RAD = Math.PI / 180;
const sinA = Math.sin(AZ * RAD), cosA = Math.cos(AZ * RAD), sinE = Math.sin(EL * RAD), cosE = Math.cos(EL * RAD);
const RIGHT = [sinA, -cosA, 0]; // world direction that moves straight right on screen
const TOWARD = [cosA, sinA, 0]; // floor direction toward the viewer
const V3 = [cosA * cosE, sinA * cosE, sinE];
const depth3 = (p) => p[0] * V3[0] + p[1] * V3[1] + p[2] * V3[2];
const at = (u, z, w = 0) => [u * RIGHT[0] + w * TOWARD[0], u * RIGHT[1] + w * TOWARD[1], z];
const add = G.add3, sub = G.sub3, mul = G.mul3;

// ---------- world ----------
const BODY = { x: -14, y: -9.5, w: 28, d: 19, r: 4 };
const H = 46; // rim of the main compartment
const LID = { x: -15, y: -11.6, w: 30, d: 20.4, r: 6 };
const PANEL = { x: -12, y: 9.5, w: 24, d: 2.4, r: 1.2 };
const PANEL_Y = PANEL.y + PANEL.d; // outer face of the back panel
const POCKET = { x: 13, y: -9.8, w: 11.2, d: 11.6, r: 4.4 };
const POCKET_TOP = 17;
const CUP = { x: 14, y: 3.0, w: 5.2, d: 6.0, r: 1.8 };
const CUP_TOP = 4.4;
const POLES = [[17.4, 4.5], [17.4, 7.3]];
const ROCK = [[-27, -13], [-9, -20], [15, -19], [28, -6], [27, 13], [9, 20], [-17, 19], [-29, 4]];

// ---------- the Ten Essentials (plus poles): rest inside the pack, target in the fan ----------
// Each essential has a fan position for a wide card and for a tall one: [u, s], u = screen-right, s = screen-up of its bottom centre.
const ESS = [
  { id: "nav", n: 1, label: "NAVIGATION", rest: [-4, -3, 26.6], wide: [-47, -7], tall: [-42, -9], box: [[-7.5, -5, 0], [7.5, 5, 3.1]] },
  { id: "lamp", n: 2, label: "HEADLAMP", rest: [1.5, -2.8, 36.4], wide: [-74, 9], tall: [-45, 11], box: [[-6.3, -4.9, -0.2], [8.6, 4.9, 3.6]] },
  { id: "sun", n: 3, label: "SUN PROTECTION", rest: [-3, 1.2, 30.2], wide: [-47, 21], tall: [-43, 31], box: [[-6.8, -7.2, 0], [7.4, 4.4, 4.2]] },
  { id: "aid", n: 4, label: "FIRST-AID KIT", rest: [4.6, 3.4, 12.2], wide: [-73, 37], tall: [-36, 52], box: [[-6.5, -4.3, 0], [8.3, 4.3, 4.9]] },
  { id: "knife", n: 5, label: "KNIFE", rest: [6, -5.2, 21.2], wide: [-46, 53], tall: [-13, 82], box: [[-5, -1.3, 0], [5, 1.3, 2]] },
  { id: "fire", n: 6, label: "FIRE", rest: [9.6, 4.2, 21.2], wide: [39, 55], tall: [11, 78], box: [[-1.35, -0.85, 0], [1.35, 0.85, 8.1]] },
  { id: "shelter", n: 7, label: "EMERGENCY SHELTER", rest: [-7.8, 3.8, 12.2], wide: [64, 38], tall: [34, 56], box: [[-4.5, -4.5, 0], [4.5, 4.5, 14]] },
  { id: "food", n: 8, label: "EXTRA FOOD", rest: [4.4, -1.6, 17.4], wide: [40, 27], tall: [44, 37], box: [[-6.6, -4.4, 0], [7.8, 4.0, 1.5]] },
  { id: "water", n: 9, label: "EXTRA WATER", rest: [19.2, -4.1, 0.9], wide: [66, 3], tall: [45, 8], box: [[-4.4, -4.4, 0], [4.4, 4.4, 22.6]] },
  { id: "clothes", n: 10, label: "EXTRA CLOTHES", rest: [0, -0.4, 0.8], wide: [40, -9], tall: [38, -17], box: [[-9.6, -8, 0], [9.6, 8.6, 10.6]] },
];
const LAYOUTS = ["wide", "tall"];
const LID_MOVE = [0, 0, 24];
const POLE_MOVE = [17, -1, 12];

// staggered springs: opening order (closing reverses it)
const OPEN = [
  ["poles", 0],
  ["lid", 0.07],
  ["water", 0.3],
  ["lamp", 0.36],
  ["sun", 0.42],
  ["nav", 0.48],
  ["knife", 0.54],
  ["fire", 0.6],
  ["food", 0.66],
  ["aid", 0.72],
  ["shelter", 0.78],
  ["clothes", 0.84],
];
const CLOSE = [
  ["clothes", 0],
  ["shelter", 0.06],
  ["aid", 0.12],
  ["food", 0.18],
  ["fire", 0.24],
  ["knife", 0.3],
  ["nav", 0.36],
  ["sun", 0.42],
  ["lamp", 0.48],
  ["water", 0.54],
  ["lid", 0.86],
  ["poles", 1.0],
];
const SPRING = { stiffness: 34, damping: 10.6, substeps: 4 };

// ---------- paths: straight up out of the container, out beneath the lid, then into place ----------
function pathOf(points, radius) {
  const clean = points.filter((p, i) => i === 0 || G.len3(sub(p, points[i - 1])) > 0.05);
  const round = clean.length > 2 ? G.fillet(clean, radius, 9) : clean;
  const rest = round[0];
  return round.map((p) => sub(p, rest));
}
for (const e of ESS) {
  const rim = e.id === "water" ? POCKET_TOP : H;
  e.bottom = e.rest[2] + e.box[0][2];
  e.rim = rim;
  e.target = {};
  e.path = {};
  for (const lay of LAYOUTS) {
    const [u, sUp] = e[lay];
    const base = at(u, 0);
    const t = [base[0], base[1], sUp / cosE];
    e.target[lay] = t;
    const up = add(e.rest, [0, 0, rim + 2.4 - e.bottom]);
    const pts = [e.rest, up];
    if (e.id === "water") pts.push([t[0], t[1], Math.max(up[2], t[2])]);
    else if (Math.abs(u) < 22) {
      const wide = at(Math.sign(u) * 27, 0);
      pts.push([wide[0], wide[1], up[2] + 1], [wide[0], wide[1], t[2]]);
    } else {
      const mid = at(u * 0.6, 0);
      pts.push([mid[0], mid[1], up[2] + 1]);
    }
    pts.push(t);
    e.path[lay] = pathOf(pts, 4.5);
  }
}
const lidPath = [[0, 0, 0], LID_MOVE];
const polePath = pathOf([[0, 0, 0], [0, 0, 9], [POLE_MOVE[0] * 0.8, POLE_MOVE[1] * 0.8, 11], POLE_MOVE], 3);

// ---------- projection and one viewBox per layout ----------
const boxPts = ([a, b], o = [0, 0, 0]) => {
  const out = [];
  for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) out.push(add(o, [x, y, z]));
  return out;
};
const common = [];
for (const p of ROCK) common.push([p[0], p[1], -7.5], [p[0], p[1], 0]);
common.push(...boxPts([[LID.x, LID.y, H], [LID.x + LID.w, LID.y + LID.d, H + 9.4]], LID_MOVE));
for (const [x, y] of POLES) common.push([x - 2, y, 0], [x + 2, y, 66], add([x + 2, y + 2, 66], POLE_MOVE), add([x - 2, y - 2, 0], POLE_MOVE));
common.push([-31, 12, 3], [-31, 12, 11], [POCKET.x + POCKET.w, POCKET.y, 0]);
const extentOf = (lay) => [...common, ...ESS.flatMap((e) => boxPts(e.box, e.target[lay]))];
const packed = [];
for (const p of ROCK) packed.push([p[0], p[1], -7.5], [p[0], p[1], 0]);
for (const [x, y] of POLES) packed.push([x, y, 66]);
packed.push(...boxPts([[LID.x, LID.y, H], [LID.x + LID.w, LID.y + LID.d, H + 9.4]]), [-31, 12, 3]);

const P = k.fitProjection([...extentOf("wide"), ...extentOf("tall")], 400, 400, { pad: 0, azimuth: AZ, elevation: EL });
const KS = G.scaleOf(P);
const bboxOf = (pts) => {
  const f = pts.map((p) => k.iso(p, P));
  return [Math.min(...f.map((p) => p[0])), Math.min(...f.map((p) => p[1])), Math.max(...f.map((p) => p[0])), Math.max(...f.map((p) => p[1]))];
};
const PAD = 6;
const pb = bboxOf(packed);
const VIEW = {};
for (const lay of LAYOUTS) {
  const b = bboxOf(extentOf(lay));
  const vb = [b[0] - PAD, b[1] - PAD, b[2] - b[0] + PAD * 2, b[3] - b[1] + PAD * 2].map((v) => Math.round(v * 10) / 10);
  const zoom = Math.min((vb[2] * 0.9) / (pb[2] - pb[0]), (vb[3] * 0.88) / (pb[3] - pb[1]), 1.7);
  VIEW[lay] = { vb, zoom: Math.round(zoom * 1000) / 1000, centre: [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2] };
}
const PACKED_CENTRE = [(pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2];

// ---------- drawing helpers ----------
const iso = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 4, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const cyl = (x, y, r, z, h, steps) => k.cylinder(x, y, r, z, h, P, steps ?? Math.max(16, Math.min(72, Math.round(r * KS * 2.2))));
const pathFlat = (pts, closed = false) => k.pathOf(pts, closed);
const signed = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
};
const oriented = (pts) => (signed(pts) < 0 ? [...pts].reverse() : pts);
const LIGHT2 = [-sinA, cosA];
function shadeOf(n) {
  const h = Math.hypot(n[0], n[1]);
  if (n[2] > 0.62) return 4;
  const lit = h > 1e-6 ? ((n[0] * LIGHT2[0] + n[1] * LIGHT2[1]) / h) * (1 - Math.max(0, n[2])) + Math.max(0, n[2]) * 1.2 : 1;
  return Math.max(0, Math.min(3, Math.floor(((lit + 1) / 2) * 4)));
}
function chain(segments) {
  const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const left = segments.map((s) => s.slice());
  const out = [];
  while (left.length) {
    const line = left.pop();
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const [a, b] = left[i];
        const head = key(line[0]), tail = key(line[line.length - 1]);
        if (key(a) === tail) line.push(b);
        else if (key(b) === tail) line.push(a);
        else if (key(b) === head) line.unshift(a);
        else if (key(a) === head) line.unshift(b);
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    out.push(pathFlat(line));
  }
  return out.join("");
}

// A strap or pad swept along a 3D centreline: rectangular section, width along W, thickness along cross(T, W).
function sweep(C, Wd, hw, ht, { closed = false, out = null } = {}) {
  const n = C.length;
  const Wv = C.map((_, i) => (typeof Wd === "function" ? Wd(i / (n - 1)) : Wd));
  const T = C.map((_, i) => {
    const a = C[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = C[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    return G.unit3(sub(b, a));
  });
  let N = C.map((_, i) => G.unit3(G.cross3(T[i], Wv[i])));
  if (out) {
    const mid = Math.floor(n / 2);
    const o = typeof out === "function" ? out(C[mid]) : out;
    if (G.dot3(N[mid], o) < 0) N = N.map((v) => mul(v, -1));
  }
  const hwOf = (i) => (typeof hw === "function" ? hw(i / (n - 1)) : hw);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const rail = corners.map(([sw, sn]) => C.map((c, i) => add(c, add(mul(Wv[i], sw * hwOf(i)), mul(N[i], sn * ht)))));
  const railFlat = rail.map((r) => r.map(iso));
  const dirs = [(i) => N[i], (i) => mul(Wv[i], -1), (i) => mul(N[i], -1), (i) => Wv[i]];
  const segs = closed ? n : n - 1;
  const vis = [];
  const faces = [];
  for (let f = 0; f < 4; f++) {
    vis.push([]);
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const normal = G.unit3(add(dirs[f](i), dirs[f](j)));
      const v = G.dot3(normal, G.viewOf(P)) > 1e-4;
      vis[f].push(v);
      if (v) faces.push({ pts: [railFlat[f][i], railFlat[f][j], railFlat[(f + 1) % 4][j], railFlat[(f + 1) % 4][i]], normal });
    }
  }
  const capVis = [];
  if (!closed) {
    for (const [end, sign] of [[0, -1], [n - 1, 1]]) {
      const normal = mul(T[end], sign);
      const v = G.dot3(normal, G.viewOf(P)) > 1e-4;
      capVis.push(v);
      if (v) faces.push({ pts: [0, 1, 2, 3].map((r) => railFlat[r][end]), normal });
    }
  }
  const outline = [], crease = [];
  for (let r = 0; r < 4; r++) {
    const fa = (r + 3) % 4, fb = r;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const a = vis[fa][i], b = vis[fb][i];
      if (a !== b) outline.push([railFlat[r][i], railFlat[r][j]]);
      else if (a && b) crease.push([railFlat[r][i], railFlat[r][j]]);
    }
  }
  for (let f = 0; f < 4; f++) {
    for (let i = 0; i < n; i++) {
      let a, b;
      if (closed) {
        a = vis[f][(i - 1 + segs) % segs];
        b = vis[f][i % segs];
      } else if (i === 0) {
        a = capVis[0];
        b = vis[f][0];
      } else if (i === n - 1) {
        a = vis[f][segs - 1];
        b = capVis[1];
      } else {
        a = vis[f][i - 1];
        b = vis[f][i];
      }
      const seg = [railFlat[f][i], railFlat[(f + 1) % 4][i]];
      if (a !== b) outline.push(seg);
      else if (a && b && !closed && (i === 0 || i === n - 1)) crease.push(seg);
    }
  }
  const buckets = [[], [], [], []];
  const top = [];
  for (const face of faces) {
    const tone = shadeOf(face.normal);
    const d = pathFlat(oriented(face.pts), true);
    if (tone === 4) top.push(d);
    else buckets[tone].push(d);
  }
  return {
    fill: faces.map((f) => pathFlat(oriented(f.pts), true)).join(""),
    shades: buckets.map((b) => b.join("")),
    top: top.join("") || "M0 0",
    crease: chain(crease),
    outline: chain(outline),
    seamless: true,
    rail,
    vis,
    N,
  };
}
// a line along a strap's outer face, inset from one edge (stitching)
function stitchOf(sw, C, Wd, hw, ht, inset, from = 0, to = 1) {
  const n = C.length;
  const pts = [];
  for (let i = Math.round(from * (n - 1)); i <= Math.round(to * (n - 1)); i++) {
    const Wi = typeof Wd === "function" ? Wd(i / (n - 1)) : Wd;
    const h = typeof hw === "function" ? hw(i / (n - 1)) : hw;
    pts.push(iso(add(C[i], add(mul(Wi, sw * (h - inset)), mul(sw === 0 ? [0, 0, 0] : [0, 0, 0], 0)))));
  }
  return pts;
}
function catmull(points, per = 6) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
// facing test for a plan ring, as extrude does it
function facingOf(ring) {
  const counter = signed(ring) > 0;
  return ring.map(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length];
    const [nx, ny] = counter ? [by - ay, -(bx - ax)] : [-(by - ay), bx - ax];
    return { n: G.unit3([nx, ny, 0]), on: nx * cosA + ny * sinA > 1e-9 };
  });
}
// a closed outline on a vertical face, plane x = c or y = c, as a rounded rectangle (slots, vents, windows)
function faceSlot(axis, c, a0, a1, z0, z1, r) {
  const pts = [];
  const ring = k.ringOf({ x: a0, y: z0, w: a1 - a0, d: z1 - z0, r }, 4);
  for (const [a, z] of ring) pts.push(iso(axis === "y" ? [a, c, z] : [c, a, z]));
  return pathFlat(pts, true);
}
// an open-topped soft container (the main compartment, the mesh pocket, the pole loop)
function container(plan, z0, h, { steps = 6, lip = 0.6, inner = "", innerBack = "", bevel = 0 } = {}) {
  const ring = k.ringOf(plan, steps);
  const inRing = k.ringOf(k.insetPlan(plan, lip), steps);
  const top = z0 + h;
  const n = ring.length;
  const face = facingOf(ring);
  const T = (p) => iso([p[0], p[1], top]);
  const B = (p) => iso([p[0], p[1], z0]);
  const hull = k.slabOf(plan, z0, h, P, steps).fill;
  const back = [`<path class="iso-fill" d="${hull}"/>`];
  const voidD = pathFlat(inRing.map(T), true);
  back.push(`<path class="pk-void" d="${voidD}"/>`);
  const walls = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    if (face[i].on) continue;
    const j = (i + 1) % n;
    const a = inRing[i], b = inRing[j];
    const quad = [iso([a[0], a[1], top]), iso([b[0], b[1], top]), iso([b[0], b[1], top - h * 0.95]), iso([a[0], a[1], top - h * 0.95])];
    const tone = shadeOf(mul(face[i].n, -1));
    walls[tone].push(pathFlat(oriented(quad), true));
  }
  walls.forEach((d, tone) => d.length && back.push(`<path class="pk-wall" data-shade="${tone}" d="${d.join("")}"/>`));
  const lipBack = [], lipFront = [], rimBack = [], rimFront = [], inBack = [], inFront = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q = pathFlat(oriented([T(ring[i]), T(ring[j]), T(inRing[j]), T(inRing[i])]), true);
    (face[i].on ? lipFront : lipBack).push(q);
    (face[i].on ? rimFront : rimBack).push([T(ring[i]), T(ring[j])]);
    (face[i].on ? inFront : inBack).push([T(inRing[i]), T(inRing[j])]);
  }
  back.push(`<path class="iso-top" d="${lipBack.join("")}"/>`);
  back.push(innerBack);
  back.push(L(chain(inBack), { tone: "lo" }));
  back.push(`<path class="iso-line iso-edge" data-tone="hi" d="${chain(rimBack)}"/>`);
  // front: the walls that face the viewer, the near lip and the near rim
  const shades = [[], [], [], []];
  const sideFill = [];
  const bottom = [];
  const verticals = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (face[i].on) {
      const quad = oriented([T(ring[i]), T(ring[j]), B(ring[j]), B(ring[i])]);
      shades[shadeOf(face[i].n)].push(pathFlat(quad, true));
      sideFill.push(pathFlat(quad, true));
      bottom.push([B(ring[i]), B(ring[j])]);
    }
    const prev = face[(i - 1 + n) % n].on;
    if (prev !== face[i].on) verticals.push(pathFlat([T(ring[i]), B(ring[i])]));
  }
  const front = [`<g class="iso-solid" data-seamless="">`];
  front.push(`<path class="iso-fill" d="${sideFill.join("")}"/>`);
  shades.forEach((d, tone) => d.length && front.push(`<path class="iso-shade" data-shade="${tone}" d="${d.join("")}"/>`));
  front.push(`<path class="iso-top" d="${lipFront.join("")}"/>`);
  front.push(L(chain(inFront), { tone: "lo" }));
  front.push(`<path class="iso-line iso-crease" data-tone="mid" d="${chain(rimFront)}"/>`);
  front.push(inner);
  front.push(`<path class="iso-line iso-edge" data-tone="hi" d="${chain(bottom)}${verticals.join("")}"/>`);
  front.push(`</g>`);
  return { back: `<g class="iso-solid">${back.join("")}</g>`, front: front.join(""), ring, face };
}
// dots spread over the visible walls of a plan ring (mesh)
function meshDots(plan, z0, z1, step, steps = 6) {
  const ring = k.ringOf(plan, steps);
  const face = facingOf(ring);
  const pts = [];
  let carry = 0;
  for (let i = 0; i < ring.length; i++) {
    if (!face[i].on) {
      carry = 0;
      continue;
    }
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = carry; s < len; s += step) {
      const t = s / len;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const row = Math.round(s * 7 + i) % 2;
      for (let z = z0 + (row ? step / 2 : step); z < z1 - 0.4; z += step) pts.push(iso([x, y, z]));
    }
    carry = (carry + step - (len % step)) % step;
  }
  return pts;
}

// ---------- the static scene ----------
const statics = []; // { key, svg }
const put = (svg, name) => statics.push({ key: statics.length, svg, name });

// summit rock with a survey disc
{
  const rockTop = 0;
  const out = [`<path class="iso-halo" d="${k.extrude(ROCK, -7.5, 7.5, P).fill}"/>`];
  const step = [[-29, 4], [-17, 19], [-4, 20], [-14, 26], [-30, 17]];
  out.push(S(k.extrude(step, -7.5, 3.4, P, { bevel: 0.6 }), { tone: "lo" }));
  out.push(S(k.extrude(ROCK, -7.5, 7.5, P, { bevel: 1.2 }), { tone: "mid", inner: L(k.ringSeam(ROCK, -3.6, P), { tone: "faint" }) }));
  // cracks: closed lens-shaped fissures on the top
  out.push(L(k.onTop([[-24, -5], [-19, -8.5], [-14, -9.4], [-19, -7.6]], rockTop, P, true), { tone: "faint" }));
  out.push(L(k.onTop([[18, 6], [22, 3], [25, 1.8], [21.4, 4.4]], rockTop, P, true), { tone: "faint" }));
  for (const [x, y, r] of [[22, 14, 1.4], [-24, 10, 1.1], [24, -12, 1.0]]) {
    out.push(S(k.extrude(k.circleRing(x, y, r, 7).map(([a, b], i) => [a + (i % 2 ? 0.3 : -0.2), b]), rockTop, r * 0.7, P), { tone: "lo" }));
  }
  // benchmark disc
  const bm = [-19, 9];
  out.push(S(cyl(bm[0], bm[1], 2.6, rockTop, 0.35), { tone: "mid", crease: "lo" }));
  out.push(L(k.ring(bm[0], bm[1], 2.0, rockTop + 0.35, P, 40), { tone: "lo" }));
  out.push(L(k.lineOnTop([bm[0] - 2.0, bm[1]], [bm[0] + 2.0, bm[1]], rockTop + 0.35, P) + k.lineOnTop([bm[0], bm[1] - 2.0], [bm[0], bm[1] + 2.0], rockTop + 0.35, P), { tone: "lo" }));
  out.push(D([iso([bm[0], bm[1], rockTop + 0.35])], { size: 0.55, tone: "hi" }));
  put(out.join(""), "rock");
}

// main compartment
const bodySeams = [
  L(k.sideSeam(BODY, 5.4, P, 6), { tone: "lo" }),
  L(k.sideSeam(BODY, 6.1, P, 6), { tone: "lo", dotted: true }),
  L(k.sideSeam(BODY, 43.2, P, 6), { tone: "faint" }),
  L(k.sideSeam(BODY, 42.5, P, 6), { tone: "lo", dotted: true }),
  L(k.segment([BODY.x + BODY.w, -1.5, 0], [BODY.x + BODY.w, -1.5, H], P), { tone: "faint" }),
].join("");
const body = container(BODY, 0, H, { steps: 6, lip: 0.7, inner: bodySeams });
put(body.back, "body.back");
const SLOT_BAG = statics.length - 0.5; // gear inside the pack sorts here
put(body.front, "body.front");
const SLOT_LID = statics.length - 0.5;

// back panel (frame sheet behind it), vents, lumbar pad
{
  const out = [];
  out.push(S(slab(PANEL, 3.6, 39.6, 4, 0.7), { tone: "mid", inner: L(k.sideSeam(PANEL, 41.9, P, 4), { tone: "lo", dotted: true }) }));
  out.push(L([faceSlot("y", PANEL_Y, -9.6, -7.6, 19, 38, 1), faceSlot("y", PANEL_Y, 7.6, 9.6, 19, 38, 1), faceSlot("y", PANEL_Y, -1, 1, 20, 39, 1)].join(""), { tone: "lo" }));
  const pad = { x: -10, y: PANEL_Y, w: 20, d: 1.4, r: 0.7 };
  out.push(S(slab(pad, 6.5, 9.5, 4, 0.5), { tone: "mid", inner: L(k.sideSeam(pad, 11.2, P, 4), { tone: "faint" }) }));
  out.push(L(faceSlot("y", pad.y + pad.d, -7.5, 7.5, 8.2, 9.7, 0.75) + faceSlot("y", pad.y + pad.d, -7.5, 7.5, 12.9, 14.4, 0.75), { tone: "lo" }));
  put(out.join(""), "panel");
}
// haul loop
{
  const C = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI - (i / 18) * Math.PI;
    C.push([Math.cos(a) * 2.6, PANEL_Y - 0.6, 43.2 + Math.sin(a) * 2.6]);
  }
  const loop = sweep(C, [0, 1, 0], 0.65, 0.3, { out: (c) => [c[0], 0, c[2] - 43.2] });
  put(S(loop, { tone: "mid" }), "haul");
}
// shoulder straps with webbing, ladder locks and a sternum strap
const strapLine = (side) =>
  catmull(
    [
      [side * 4.0, PANEL_Y + 0.75, 43.2],
      [side * 4.6, PANEL_Y + 2.4, 40.8],
      [side * 5.8, PANEL_Y + 3.8, 35],
      [side * 7.0, PANEL_Y + 4.1, 28],
      [side * 8.0, PANEL_Y + 3.4, 21],
      [side * 8.7, PANEL_Y + 1.9, 15.6],
      [side * 9.0, PANEL_Y + 0.95, 13.2],
    ],
    5,
  );
const strapHW = (t) => 1.7 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15));
const STRAP_HT = 0.75;
function strapAt(side, z) {
  const C = strapLine(side);
  let best = C[0];
  for (const c of C) if (Math.abs(c[2] - z) < Math.abs(best[2] - z)) best = c;
  return best;
}
for (const side of [-1, 1]) {
  // lower webbing to the bottom corner of the panel, with a ladder lock
  const C = strapLine(side);
  const end = C[C.length - 1];
  const foot = [side * 10.6, PANEL_Y + 0.25, 4.6];
  const web = [];
  for (let i = 0; i <= 8; i++) web.push(G.lerp3(add(end, [0, -0.4, 0]), foot, i / 8));
  const webbing = sweep(web, [1, 0, 0], 1.25, 0.18, { out: [0, 1, 0] });
  const out = [S(webbing, { tone: "lo" })];
  const lock = { x: side * 9.2 - 1.8, y: PANEL_Y + 0.2, w: 3.6, d: 0.9, r: 0.4 };
  out.push(S(slab(lock, 8.4, 2.2, 3), { tone: "mid", inner: L(k.segment([lock.x + 0.5, lock.y + lock.d, 9.5], [lock.x + lock.w - 0.5, lock.y + lock.d, 9.5], P), { tone: "lo" }) }));
  put(out.join(""), `web${side}`);
}
for (const side of [-1, 1]) {
  const C = strapLine(side);
  const s = sweep(C, [1, 0, 0], strapHW, STRAP_HT, { out: [0, 1, 0.2] });
  const n = C.length;
  const outer = (sw, inset) => C.map((c, i) => iso(add(add(c, mul(s.N[i], STRAP_HT)), [sw * (strapHW(i / (n - 1)) - inset), 0, 0])));
  const stitches = L(pathFlat(outer(1, 0.55)), { tone: "lo", dotted: true }) + L(pathFlat(outer(-1, 0.55)), { tone: "lo", dotted: true });
  put(S(s, { tone: "hi", inner: stitches }), `strap${side}`);
}
{
  const l = strapAt(-1, 30), r = strapAt(1, 30);
  const y = Math.max(l[1], r[1]) + STRAP_HT;
  const web = { x: l[0] + 0.6, y, w: r[0] - l[0] - 1.2, d: 0.35, r: 0.15 };
  const out = [S(slab(web, 29.2, 1.6, 2), { tone: "lo" })];
  const buckle = { x: -2.2, y: y + 0.35, w: 4.4, d: 1.0, r: 0.45 };
  out.push(S(slab(buckle, 28.6, 2.8, 3, 0.3), { tone: "mid", inner: L(faceSlot("y", buckle.y + buckle.d, -1.4, -0.3, 29.3, 30.7, 0.3) + faceSlot("y", buckle.y + buckle.d, 0.3, 1.4, 29.3, 30.7, 0.3), { tone: "lo" }) }));
  put(out.join(""), "sternum");
}
// hip belt wings (left one carries the female buckle, right one the male)
const wingLine = (side) =>
  catmull(
    [
      [side * 10.6, PANEL_Y - 0.2, 7],
      [side * 14.5, PANEL_Y + 1.0, 7],
      [side * 18.5, PANEL_Y + 1.0, 7],
      [side * 22, PANEL_Y - 0.3, 7],
      [side * 24, PANEL_Y - 0.9, 7],
    ],
    5,
  );
function wing(side) {
  const C = wingLine(side);
  const n = C.length;
  const hw = (t) => 3.9 - 1.3 * t * t;
  const s = sweep(C, [0, 0, 1], hw, 0.95, { out: [0, 1, 0] });
  const seam = C.map((c, i) => iso(add(add(c, mul(s.N[i], 0.95)), [0, 0, hw(i / (n - 1)) - 0.6])));
  const seam2 = C.map((c, i) => iso(add(add(c, mul(s.N[i], 0.95)), [0, 0, -(hw(i / (n - 1)) - 0.6)])));
  const out = [S(s, { tone: "mid", inner: L(pathFlat(seam), { tone: "lo", dotted: true }) + L(pathFlat(seam2), { tone: "lo", dotted: true }) })];
  const end = C[n - 1];
  const tip = add(end, [side * 3.2, -0.2, 0]);
  const web = [];
  for (let i = 0; i <= 4; i++) web.push(G.lerp3(add(end, [-side * 0.6, 0, 0]), tip, i / 4));
  out.push(S(sweep(web, [0, 0, 1], 1.2, 0.18, { out: [0, 1, 0] }), { tone: "lo" }));
  if (side > 0) {
    const b = { x: tip[0] - 0.2, y: tip[1] - 0.45, w: 3.4, d: 0.9, r: 0.35 };
    out.push(S(slab(b, 5.4, 3.2, 3, 0.3), { tone: "mid", inner: L(k.segment([b.x + 1.2, b.y + b.d, 5.4], [b.x + 1.2, b.y + b.d, 8.6], P) + k.segment([b.x + 2.4, b.y + b.d, 5.4], [b.x + 2.4, b.y + b.d, 8.6], P), { tone: "lo" }) }));
  } else {
    const b = { x: tip[0] - 4.2, y: tip[1] - 0.6, w: 4.4, d: 1.2, r: 0.5 };
    out.push(S(slab(b, 5.0, 4.0, 3, 0.3), { tone: "mid", inner: L(faceSlot("y", b.y + b.d, b.x + 0.9, b.x + 3.0, 5.9, 8.1, 0.5), { tone: "lo" }) }));
  }
  return out.join("");
}
put(wing(-1), "wing-1");
// side compression straps with ladder locks on the +x panel
{
  const out = [];
  const ring = k.ringOf(k.insetPlan(BODY, -0.35), 6);
  for (const z of [24, 35]) {
    const pts = ring.filter(([x, y]) => x > 9 && y > -9.95 && y < 7.5).sort((a, b) => b[1] - a[1]);
    const run = [[BODY.x + BODY.w + 0.35, 7.5, z], ...pts.map(([x, y]) => [x, y, z])];
    const strap = sweep(run, [0, 0, 1], 1.15, 0.2, { out: [1, -0.4, 0] });
    out.push(S(strap, { tone: "lo" }));
    const lk = { x: BODY.x + BODY.w + 0.4, y: -4.6, w: 0.8, d: 3.2, r: 0.3 };
    out.push(S(slab(lk, z - 1.6, 3.2, 2, 0.2), { tone: "mid", inner: L(k.segment([lk.x + lk.w, lk.y + 0.6, z - 0.6], [lk.x + lk.w, lk.y + lk.d - 0.6, z - 0.6], P) + k.segment([lk.x + lk.w, lk.y + 0.6, z + 0.6], [lk.x + lk.w, lk.y + lk.d - 0.6, z + 0.6], P), { tone: "lo" }) }));
    const tail = { x: BODY.x + BODY.w + 0.35, y: -4.1, w: 0.35, d: 2.2, r: 0.1 };
    out.push(S(slab(tail, z - 6.2, 4.6, 2), { tone: "lo" }));
  }
  // bungee tab for the poles
  out.push(S(slab({ x: BODY.x + BODY.w, y: 5.4, w: 2.4, d: 1.0, r: 0.3 }, 35.2, 1.4, 2), { tone: "mid" }));
  put(out.join(""), "compression");
}
// mesh side pocket
const meshPts = meshDots(POCKET, 1.2, POCKET_TOP - 1.6, 1.15, 6);
const pocket = container(POCKET, 0.6, POCKET_TOP - 0.6, {
  steps: 6,
  lip: 0.45,
  inner: D(meshPts, { size: 0.3, tone: "mid" }) + L(k.sideSeam(POCKET, POCKET_TOP - 1.4, P, 6), { tone: "mid" }),
});
put(pocket.back, "pocket.back");
const SLOT_POCKET = statics.length - 0.5;
put(pocket.front, "pocket.front");
const cup = container(CUP, 0.6, CUP_TOP - 0.6, { steps: 3, lip: 0.4, inner: L(k.sideSeam(CUP, 2.4, P, 3), { tone: "lo", dotted: true }) });
put(cup.back, "cup.back");
const SLOT_CUP = statics.length - 0.5;
put(cup.front, "cup.front");
put(wing(1), "wing1");

// ---------- moving assemblies ----------
const movers = []; // { id, svg, slot, rim, bottom, ref, path, n, label, sel }

// lid with zipper and pull (the one lit accent at rest)
{
  const out = [];
  const z = H;
  out.push(`<path class="iso-halo pk-lid-halo" d="${k.slabOf(k.insetPlan(LID, 2), z, 0.1, P).fill}"/>`);
  const seam = L(k.sideSeam(LID, z + 3.4, P, 6), { tone: "lo" }) + L(k.sideSeam(LID, z + 3.9, P, 6), { tone: "faint", dotted: true });
  out.push(S(slab(LID, z, 6.8, 6, 1.1), { tone: "hi", crease: "lo", inner: seam }));
  const dome = k.insetPlan(LID, 2.4);
  out.push(S(slab(dome, z + 6.8, 1.3, 6, 0.8), { tone: "hi", crease: "lo" }));
  // lash points on the lid top
  for (const x of [-6, 6]) out.push(S(slab({ x: x - 1.2, y: -4, w: 2.4, d: 1.1, r: 0.4 }, z + 8.1, 0.45, 2), { tone: "mid" }));
  // zipper pull hanging from the seam on the +x face
  const px = LID.x + LID.w, py = -5.5;
  const pull = `<g class="pk-pull">${S(slab({ x: px, y: py - 0.75, w: 0.55, d: 1.5, r: 0.3 }, z + 0.6, 3.0, 2), { tone: "hi", lit: true })}${L(k.sideRing([px + 0.55, py, z + 1.5], 0.42, "x", P, 12), { tone: "lit" })}</g>`;
  out.push(pull);
  movers.push({ id: "lid", svg: out.join(""), slot: SLOT_LID, rim: H + 9, bottom: H, ref: [0, 0, H + 4], path: { wide: lidPath, tall: lidPath }, n: 0, label: "TOP LID", sel: false });
}

// trekking poles with their bungee
function poleSvg(x, y) {
  const o = [];
  o.push(S(cyl(x, y, 0.42, 0.9, 2.2, 14), { tone: "hi" }));
  o.push(S(cyl(x, y, 0.62, 3.1, 1.6, 16), { tone: "mid" }));
  o.push(S(cyl(x, y, 2.0, 4.7, 0.5, 36), { tone: "mid", crease: "lo" }));
  o.push(L(G.spokesOf(G.frameAlong([x, y, 5.2], [0, 0, 1]), 0, 0.9, 1.75, 6, P), { tone: "lo" }));
  o.push(L(k.ring(x, y, 0.9, 5.2, P, 20), { tone: "lo" }));
  o.push(S(cyl(x, y, 0.62, 5.2, 21.8, 16), { tone: "hi", crease: "none" }));
  o.push(S(cyl(x, y, 1.05, 27, 2.4, 20), { tone: "mid" }));
  o.push(S(slab({ x: x + 0.7, y: y - 0.45, w: 0.8, d: 0.9, r: 0.3 }, 27.2, 2.0, 2), { tone: "mid" }));
  o.push(S(cyl(x, y, 0.78, 29.4, 16.6, 16), { tone: "hi", crease: "none" }));
  o.push(S(cyl(x, y, 1.12, 46, 2.4, 20), { tone: "mid" }));
  o.push(S(slab({ x: x + 0.8, y: y - 0.45, w: 0.8, d: 0.9, r: 0.3 }, 46.2, 2.0, 2), { tone: "mid" }));
  o.push(S(cyl(x, y, 0.92, 48.4, 2.6, 16), { tone: "hi", crease: "none" }));
  o.push(S(cyl(x, y, 1.2, 51, 3.4, 20), { tone: "mid" }));
  const gripRidges = [56.5, 58, 59.5].map((z) => k.sideArc(x, y, 1.55, z, P, 16)).join("");
  o.push(S(cyl(x, y, 1.55, 54.4, 9.4, 24), { tone: "mid", inner: L(gripRidges, { tone: "lo" }) }));
  o.push(S(cyl(x, y, 1.65, 63.8, 1.2, 24), { tone: "hi" }));
  o.push(L(k.ring(x, y, 0.7, 65, P, 16), { tone: "lo" }));
  return o.join("");
}
{
  const [a, b] = POLES;
  const cx = a[0];
  const loop = [];
  const R = 1.25;
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const y = s > 0 ? b[1] : a[1];
    loop.push([cx + c * R, y + s * R, 36]);
  }
  const pieces = tubePieces(loop, 0.28, P, { closed: true, maxLength: 3 });
  const front = pieces.filter((p) => p.mid[0] > cx + 0.15 || p.mid[1] > b[1] + 0.6);
  const back = pieces.filter((p) => !front.includes(p));
  const out = [];
  out.push(back.map((p) => tubeSvg(p, { tone: "mid" })).join(""));
  out.push(poleSvg(a[0], a[1]));
  out.push(poleSvg(b[0], b[1]));
  out.push(front.map((p) => tubeSvg(p, { tone: "mid" })).join(""));
  out.push(S(cyl(cx + R, (a[1] + b[1]) / 2, 0.62, 35.1, 1.8, 16), { tone: "mid" }));
  out.push(L(k.ring(cx + R, (a[1] + b[1]) / 2, 0.3, 36.9, P, 12), { tone: "lo" }));
  movers.push({ id: "poles", svg: out.join(""), slot: SLOT_CUP, rim: 13, bottom: 0.9, ref: [cx, 6, 30], path: { wide: polePath, tall: polePath }, n: 0, label: "TREKKING POLES", sel: true });
}

// gear builders, each drawn at its rest origin o = bottom centre
const GEAR = {
  nav(o) {
    const [x, y, z] = o;
    const out = [];
    const map = { x: x - 7.5, y: y - 5, w: 15, d: 10, r: 0.4 };
    const folds = L(k.sideSeam(map, z + 0.5, P, 2), { tone: "faint" }) + L(k.sideSeam(map, z + 0.95, P, 2), { tone: "faint" });
    out.push(S(slab(map, z, 1.4, 2), { tone: "hi", crease: "lo", inner: folds }));
    const t = z + 1.4;
    out.push(L(k.lineOnTop([x - 2.5, y - 5], [x - 2.5, y + 5], t, P) + k.lineOnTop([x - 7.5, y], [x + 7.5, y], t, P), { tone: "lo" }));
    // a summit in contour lines
    const peak = (cx, cy, rs) => rs.map((r, i) => k.onTop(k.circleRing(cx, cy, r, 14).map(([a, b], j) => [a + Math.sin(j * 1.7 + i) * 0.25 * r * 0.4, b + Math.cos(j * 1.3) * 0.2 * r * 0.4]), t, P, true)).join("");
    out.push(L(peak(x - 5.2, y + 2.6, [0.6, 1.3, 2.0]), { tone: "lo" }));
    const plate = { x: x + 0.6, y: y - 4.4, w: 5.8, d: 8.8, r: 0.8 };
    out.push(S(slab(plate, t, 0.55, 3, 0.3), { tone: "mid", crease: "lo" }));
    const pt = t + 0.55;
    const ticks = k.topTicks(plate.y + 1, plate.y + plate.d - 1, 0.8, 5, plate.x, pt, [0.6, 1.1], P, "y");
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
    const bz = [x + 4.2, y + 1.2];
    out.push(L(k.lineOnTop([bz[0], plate.y], [bz[0], bz[1] - 2.3], pt, P), { tone: "mid" }));
    out.push(S(cyl(bz[0], bz[1], 2.3, pt, 0.9, 40), { tone: "hi", crease: "lo", inner: L(k.knurl(bz[0], bz[1], 2.3, pt, pt + 0.9, 30, P, 0.15), { tone: "lo" }) }));
    const rt = k.radialTicks(bz[0], bz[1], 1.95, 24, 6, pt + 0.9, [0.3, 0.6], P);
    out.push(L(rt.minor, { tone: "lo" }), L(rt.major, { tone: "mid" }));
    out.push(L(k.ring(bz[0], bz[1], 1.95, pt + 0.9, P, 32), { tone: "faint" }));
    out.push(L(k.lineOnTop([bz[0] - 0.4, bz[1] + 1.2], [bz[0] + 0.4, bz[1] - 1.3], pt + 0.95, P), { tone: "hi", free: true }));
    out.push(D([iso([bz[0], bz[1], pt + 0.95])], { size: 0.4, tone: "hi" }));
    return out.join("");
  },
  lamp(o) {
    const [x, y, z] = o;
    const out = [];
    const ax = 5.6, ay = 4.2, t = 0.6;
    const outerRing = [], innerRing = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const a = 0.08 + (i / N) * (Math.PI * 2 - 0.16);
      outerRing.push([x + Math.cos(a) * ax, y + Math.sin(a) * ay]);
      innerRing.push([x + Math.cos(a) * (ax - t), y + Math.sin(a) * (ay - t)]);
    }
    const band = [...outerRing, ...innerRing.reverse()];
    out.push(S(k.extrude(band, z, 2.4, P, { convex: false }), { tone: "mid", crease: "lo" }));
    const hb = { x: x + 5.0, y: y - 2.4, w: 3.4, d: 4.8, r: 1.2 };
    out.push(S(slab(hb, z - 0.2, 3.8, 4, 0.5), { tone: "hi", crease: "lo" }));
    const lx = hb.x + hb.w;
    out.push(L(k.sideRing([lx, y, z + 1.7], 1.35, "x", P, 28), { tone: "hi" }));
    out.push(L(k.sideRing([lx, y, z + 1.7], 0.75, "x", P, 20), { tone: "lo" }));
    out.push(D([iso([lx, y, z + 1.7])], { size: 0.45, tone: "hi" }));
    out.push(S(cyl(hb.x + 1.6, y + 1.2, 0.55, z + 3.6, 0.45, 14), { tone: "mid" }));
    return out.join("");
  },
  sun(o) {
    const [x, y, z] = o;
    const out = [];
    // sunscreen tube lying along x, behind the glasses
    const F = G.frameAlong([x - 5.6, y - 5.0, z + 2.1], [1, 0, 0]);
    const prof = [[0.6, 1.2], [1.6, 1.9, 1], [2.6, 2.05, 1], [10, 2.05], [10, 1.55], [12.6, 1.55]];
    const crimp = G.prismOf(F, [[-2.1, -0.18], [2.1, -0.18], [2.1, 0.18], [-2.1, 0.18]], -0.6, 0.8, P);
    out.push(S(crimp, { tone: "mid" }));
    out.push(S(G.solidOf(prof, F, P, { smooth: true }), { tone: "hi", crease: "lo", inner: L(G.arcOf(F, 10.6, 1.55, P), { tone: "faint" }) }));
    // folded sunglasses
    const ly = y + 1.8;
    const lens = (cx) => k.circleRing(cx, ly, 1, 28).map(([a, b]) => [cx + (a - cx) * 2.9, ly + (b - ly) * 2.2]);
    for (const cx of [x - 3.2, x + 3.2]) {
      out.push(`<g class="pk-lens">${S(k.extrude(lens(cx), z, 0.55, P), { tone: "mid", crease: "lo" })}</g>`);
      out.push(L(k.onTop([[cx - 2.0, ly + 1.2], [cx + 1.2, ly - 1.5]], z + 0.55, P), { tone: "lo", free: true }));
    }
    out.push(S(slab({ x: x - 6.3, y: ly + 1.75, w: 12.6, d: 0.75, r: 0.3 }, z, 0.95, 2), { tone: "hi" }));
    for (const yy of [ly - 1.0, ly + 0.4]) out.push(S(slab({ x: x - 5.6, y: yy, w: 11.2, d: 0.5, r: 0.2 }, z + 0.55, 0.45, 2), { tone: "hi" }));
    out.push(D([iso([x - 5.4, ly + 2.1, z + 0.95]), iso([x + 5.4, ly + 2.1, z + 0.95])], { size: 0.4, tone: "mid" }));
    return out.join("");
  },
  aid(o) {
    const [x, y, z] = o;
    const out = [];
    const pouch = { x: x - 6.5, y: y - 4.25, w: 13, d: 8.5, r: 2.4 };
    const zip = L(k.sideSeam(pouch, z + 3.1, P, 6), { tone: "lo" }) + L(k.sideSeam(pouch, z + 2.7, P, 6), { tone: "faint", dotted: true });
    out.push(S(slab(pouch, z, 4.6, 6, 1.0), { tone: "hi", crease: "lo", inner: zip }));
    const t = z + 4.6;
    const c = [x - 0.5, y];
    const a = 2.5, b = 0.8;
    const plus = [[c[0] - b, c[1] - a], [c[0] + b, c[1] - a], [c[0] + b, c[1] - b], [c[0] + a, c[1] - b], [c[0] + a, c[1] + b], [c[0] + b, c[1] + b], [c[0] + b, c[1] + a], [c[0] - b, c[1] + a], [c[0] - b, c[1] + b], [c[0] - a, c[1] + b], [c[0] - a, c[1] - b], [c[0] - b, c[1] - b]];
    out.push(S(k.extrude(plus, t, 0.3, P, { convex: false }), { tone: "mid", crease: "lo" }));
    out.push(S(slab({ x: pouch.x + pouch.w, y: y - 2.2, w: 1.7, d: 0.55, r: 0.25 }, z + 2.3, 1.4, 2), { tone: "mid" }));
    return out.join("");
  },
  knife(o) {
    const [x, y, z] = o;
    const out = [];
    const h = { x: x - 5, y: y - 1.3, w: 10, d: 2.6, r: 1.2 };
    out.push(S(slab(h, z, 1.7, 5, 0.35), { tone: "hi", crease: "lo", inner: L(k.sideSeam(h, z + 0.85, P, 5), { tone: "lo" }) }));
    out.push(S(slab({ x: x - 3.4, y: y - 0.4, w: 5.6, d: 0.8, r: 0.3 }, z + 1.7, 0.3, 2), { tone: "mid" }));
    out.push(L(k.ring(x + 3.8, y, 0.55, z + 1.7, P, 16), { tone: "mid" }));
    out.push(D([iso([x + 3.8, y, z + 1.7])], { size: 0.35, tone: "hi" }));
    out.push(L(k.ring(x - 4.0, y, 0.4, z + 1.7, P, 14), { tone: "lo" }));
    return out.join("");
  },
  fire(o) {
    const [x, y, z] = o;
    const out = [];
    const body = { x: x - 1.25, y: y - 0.75, w: 2.5, d: 1.5, r: 0.6 };
    out.push(S(slab(body, z, 6.3, 4), { tone: "hi", crease: "lo", inner: L(k.sideSeam(body, z + 0.8, P, 4), { tone: "faint" }) }));
    const hood = { x: x - 1.3, y: y - 0.8, w: 2.6, d: 1.6, r: 0.35 };
    out.push(S(slab(hood, z + 6.3, 1.5, 3), { tone: "mid", inner: L(faceSlot("x", hood.x + hood.w, y - 0.45, y + 0.45, z + 6.7, z + 7.4, 0.3), { tone: "lo" }) }));
    const F = G.frameAlong([x - 0.95, y + 0.25, z + 8.05], [1, 0, 0]);
    out.push(S(G.disc(0, 1.5, 0.62, F, P), { tone: "mid", inner: L(G.ribsOf(F, 0, 1.5, 0.62, 14, P), { tone: "lo" }) }));
    out.push(S(slab({ x: x - 0.4, y: y - 0.85, w: 0.8, d: 0.55, r: 0.2 }, z + 6.0, 0.9, 2), { tone: "mid" }));
    return out.join("");
  },
  shelter(o) {
    const [x, y, z] = o;
    const out = [];
    const seams = L(k.sideArc(x, y, 4.4, z + 1.8, P, 32) + k.sideArc(x, y, 4.4, z + 10, P, 32), { tone: "lo" }) + L(k.sideArc(x, y, 4.4, z + 10.6, P, 32), { tone: "lo", dotted: true });
    out.push(S(cyl(x, y, 4.4, z, 11.4, 48), { tone: "hi", crease: "lo", inner: seams }));
    out.push(L(k.ring(x, y, 3.4, z + 11.4, P, 36), { tone: "faint" }));
    out.push(S(cyl(x, y, 2.0, z + 11.4, 1.1, 28), { tone: "mid" }));
    out.push(S(cyl(x + 0.6, y + 0.3, 0.7, z + 12.5, 1.5, 16), { tone: "mid", inner: L(k.sideArc(x + 0.6, y + 0.3, 0.7, z + 13.2, P, 10), { tone: "lo" }) }));
    return out.join("");
  },
  food(o) {
    const [x, y, z] = o;
    const out = [];
    const bar = (plan, zz, along) => {
      const o2 = [];
      const crimpW = 1.0;
      const ends = along === "x"
        ? [{ x: plan.x - crimpW, y: plan.y, w: crimpW, d: plan.d, r: 0.15 }, { x: plan.x + plan.w, y: plan.y, w: crimpW, d: plan.d, r: 0.15 }]
        : [{ x: plan.x, y: plan.y - crimpW, w: plan.w, d: crimpW, r: 0.15 }, { x: plan.x, y: plan.y + plan.d, w: plan.w, d: crimpW, r: 0.15 }];
      for (const e of ends) {
        o2.push(S(slab(e, zz + 0.45, 0.55, 2), { tone: "mid" }));
        const ribs = [];
        for (let i = 1; i < 4; i++) {
          const f = i / 4;
          if (along === "x") ribs.push(k.lineOnTop([e.x + e.w * f, e.y], [e.x + e.w * f, e.y + e.d], zz + 1.0, P));
          else ribs.push(k.lineOnTop([e.x, e.y + e.d * f], [e.x + e.w, e.y + e.d * f], zz + 1.0, P));
        }
        o2.push(L(ribs.join(""), { tone: "lo" }));
      }
      o2.push(S(slab(plan, zz, 1.45, 3, 0.4), { tone: "hi", crease: "lo" }));
      const fin = along === "x" ? k.lineOnTop([plan.x, plan.y + plan.d * 0.62], [plan.x + plan.w, plan.y + plan.d * 0.62], zz + 1.45, P) : k.lineOnTop([plan.x + plan.w * 0.62, plan.y], [plan.x + plan.w * 0.62, plan.y + plan.d], zz + 1.45, P);
      o2.push(L(fin, { tone: "faint" }));
      return o2.join("");
    };
    out.push(bar({ x: x - 5.6, y: y - 4.3, w: 10.4, d: 3.8, r: 0.5 }, z, "x"));
    out.push(bar({ x: x - 4.0, y: y + 0.2, w: 10.4, d: 3.8, r: 0.5 }, z, "x"));
    return out.join("");
  },
  water(o) {
    const [x, y, z] = o;
    const out = [];
    const F = G.frameAlong([x, y, z], [0, 0, 1]);
    const prof = [[0, 3.7], [0.5, 4.15, 1], [1.2, 4.3], [16.2, 4.3], [17.4, 4.0, 1], [18.6, 3.1, 1], [19.4, 2.85]];
    const seams = L(G.arcOf(F, 1.6, 4.3, P) + G.arcOf(F, 15.8, 4.3, P), { tone: "faint" });
    out.push(S(G.solidOf(prof, F, P, { smooth: true }), { tone: "hi", crease: "lo", inner: seams }));
    const capF = G.frameAlong([x, y, z + 19.4], [0, 0, 1]);
    const ribs = G.ribsOf(capF, 0.2, 2.6, 3.0, 30, P, { fade: [0.1, 0.55], seams: true });
    out.push(S(G.disc(0, 2.8, 3.0, capF, P), { tone: "mid", crease: "lo", inner: k.fadedSvg(ribs, { tone: "lo" }) }));
    out.push(L(k.ring(x, y, 2.2, z + 22.2, P, 32), { tone: "faint" }));
    // tether loop on the cap
    out.push(S(slab({ x: x - 0.6, y: y + 2.6, w: 1.2, d: 1.6, r: 0.4 }, z + 20.6, 1.2, 2), { tone: "mid" }));
    return out.join("");
  },
  clothes(o) {
    const [x, y, z] = o;
    const out = [];
    // rolled insulated jacket along x, quilted
    const jF = G.frameAlong([x - 9.2, y - 2.6, z + 5.2], [1, 0, 0]);
    const jp = [[0, 3.8], [0.7, 4.8, 1], [1.6, 5.2], [16.8, 5.2], [17.7, 4.8, 1], [18.4, 3.8]];
    const quilt = [4.4, 7.6, 10.8, 14].map((s) => G.arcOf(jF, s, 5.2, P)).join("");
    out.push(S(G.solidOf(jp, jF, P, { smooth: true }), { tone: "hi", crease: "lo", inner: L(quilt, { tone: "lo" }) }));
    out.push(L([3.2, 2.0, 0.9].map((r) => G.circleOf(jF, 18.4 + 0.02, r, P)).join(""), { tone: "lo" }));
    // stuffed rain shell in front of it
    const shell = { x: x - 5.2, y: y + 3.2, w: 9.8, d: 5.4, r: 2.2 };
    out.push(S(slab(shell, z, 4.0, 6, 0.9), { tone: "mid", crease: "lo", inner: L(k.sideSeam(shell, z + 2.2, P, 6), { tone: "lo" }) }));
    out.push(S(slab({ x: shell.x + shell.w, y: shell.y + 2.2, w: 1.2, d: 0.5, r: 0.2 }, z + 1.6, 1.2, 2), { tone: "mid" }));
    // beanie on top of the shell
    const bF = G.frameAlong([x - 0.4, y + 5.9, z + 4.0], [0, 0, 1]);
    const bp = [[0, 2.7], [1.5, 2.7], [1.5, 2.55], [2.3, 2.5, 1], [3.3, 2.15, 1], [4.1, 1.45, 1], [4.55, 0.6, 1], [4.7, 0]];
    const cuff = G.ribsOf(bF, 0, 1.5, 2.7, 26, P, { fade: [0.1, 0.55], seams: "first" });
    out.push(S(G.solidOf(bp, bF, P, { smooth: true }), { tone: "hi", crease: "lo", inner: k.fadedSvg(cuff, { tone: "lo" }) }));
    return out.join("");
  },
};
for (const e of ESS) {
  const svg = GEAR[e.id](e.rest);
  const ref = add(e.rest, [(e.box[0][0] + e.box[1][0]) / 2, (e.box[0][1] + e.box[1][1]) / 2, (e.box[0][2] + e.box[1][2]) / 2]);
  movers.push({ id: e.id, svg, slot: e.id === "water" ? SLOT_POCKET : SLOT_BAG, rim: e.rim + 0.3, bottom: e.bottom, ref, path: e.path, n: e.n, label: e.label, sel: true });
}

// ---------- page ----------
const round2 = (v) => Math.round(v * 100) / 100;
const EX = k.axisVector(P, [1, 0, 0]), EY = k.axisVector(P, [0, 1, 0]), EZ = k.axisVector(P, [0, 0, 1]);
const scene = [
  ...statics.map((s) => `<g class="it" data-k="${s.key}" data-name="${s.name}">${s.svg}</g>`),
  ...movers.map((m) => `<g class="it" data-piece="${m.id}"${m.sel ? " data-sel" : ""}>${m.svg}</g>`),
].join("");
const svg0 = k.figureSvg({
  width: 400,
  height: 400,
  label:
    "A technical day pack standing on a summit rock: back panel with shoulder straps, sternum strap, hip belt and buckle, a top lid with a zipper pull, side compression straps with ladder locks, a mesh side pocket holding a water bottle, and two collapsed trekking poles strapped to the side. Unpacked, the lid lifts and the Ten Essentials rise out of the pack: map and compass, headlamp, sunglasses and sunscreen, first-aid kit, knife, lighter, emergency bivy, two food bars, water bottle, and a rolled jacket, rain shell and beanie.",
  body: `<g class="pk-zoom"><g class="pk-scene">${scene}</g></g>`,
});
const svg = svg0.replace('viewBox="0 0 400 400"', `viewBox="${VIEW.tall.vb.join(" ")}"`);

const DATA = {
  EX, EY, EZ, V: V3, open: OPEN, close: CLOSE, spring: SPRING, views: VIEW, packedCentre: PACKED_CENTRE,
  movers: Object.fromEntries(movers.map((m) => [m.id, { slot: m.slot, rim: m.rim, bottom: m.bottom, ref: m.ref.map(round2), paths: Object.fromEntries(LAYOUTS.map((lay) => [lay, m.path[lay].map((p) => p.map(round2))])), n: m.n, label: m.label, sel: m.sel }])),
};

const live = `
const D = ${JSON.stringify(DATA)};
const stage = document.querySelector(".pk-stage");
const svgEl = stage.querySelector("svg");
const sceneEl = svgEl.querySelector(".pk-scene");
const zoomEl = svgEl.querySelector(".pk-zoom");
const readout = document.querySelector("[data-readout]");
const hintEl = document.querySelector('[data-corner="hint"]');
const liveRegion = document.querySelector("[data-live]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
// touch / coarse pointers get "Tap"; a hybrid laptop switches to it on its first touch
const coarse = matchMedia("(hover: none), (pointer: coarse)");
let touchSeen = false;
function writeHint() { if (hintEl) hintEl.textContent = coarse.matches || touchSeen ? "Tap to unpack" : "Hover to unpack"; }
writeHint();
coarse.addEventListener("change", writeHint);

const IDS = Object.keys(D.movers);
const move = Object.fromEntries(IDS.map((id) => [id, { ...D.movers[id], x: 0, v: 0, target: 0, pending: null }]));
let layout = "";
function useLayout(lay) {
  if (lay === layout) return;
  layout = lay;
  for (const id of IDS) {
    const m = move[id];
    m.path = m.paths[lay];
    m.cum = [0];
    for (let i = 1; i < m.path.length; i++) m.cum.push(m.cum[i - 1] + Math.hypot(m.path[i][0] - m.path[i - 1][0], m.path[i][1] - m.path[i - 1][1], m.path[i][2] - m.path[i - 1][2]));
    m.len = m.cum[m.cum.length - 1];
  }
  svgEl.setAttribute("viewBox", D.views[lay].vb.join(" "));
}
const layoutFor = () => {
  const r = stage.getBoundingClientRect();
  return r.width / Math.max(1, r.height) > 1.4 ? "wide" : "tall";
};
useLayout(layoutFor());
new ResizeObserver(() => { const before = layout; useLayout(layoutFor()); if (layout !== before) place(); }).observe(stage);
const nodes = [...sceneEl.children].map((el) => ({ el, piece: el.dataset.piece || null, key: Number(el.dataset.k ?? 0), shown: "" }));
let order = nodes.map((_, i) => i);
const ESSENTIALS = IDS.filter((id) => move[id].n > 0).sort((a, b) => move[a].n - move[b].n);
const PICKS = [...ESSENTIALS, "poles"];

function along(m, s) {
  if (s <= 0) return [0, 0, 0];
  const d = s * m.len;
  const p = m.path, c = m.cum;
  if (d >= m.len) {
    const a = p[p.length - 2], b = p[p.length - 1];
    const seg = c[c.length - 1] - c[c.length - 2] || 1;
    const over = (d - m.len) / seg;
    return [b[0] + (b[0] - a[0]) * over, b[1] + (b[1] - a[1]) * over, b[2] + (b[2] - a[2]) * over];
  }
  let i = 1;
  while (c[i] < d) i++;
  const t = (d - c[i - 1]) / (c[i] - c[i - 1] || 1);
  return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t, p[i - 1][2] + (p[i][2] - p[i - 1][2]) * t];
}

let apart = false, selected = null, clock = 0, frame = 0, last = 0, visible = false;
let touring = false, tourAt = 0, tourDone = false, idleTimer = 0, leaveTimer = 0, touched = false, nap = 0;

function say(text) { if (readout.textContent !== text) readout.textContent = text; }
// only user-initiated changes reach the live region: the idle tour plays silently (the visible readout still follows it)
function announce(text) { if (!touring && liveRegion && liveRegion.textContent !== text) liveRegion.textContent = text; }

function setApart(on) {
  if (apart === on) return;
  apart = on;
  const goal = on ? 1 : 0;
  const plan = on ? D.open : D.close;
  const changing = plan.filter(([id]) => move[id].target !== goal || move[id].pending);
  const base = changing.length ? changing[0][1] : 0;
  for (const [id, at] of plan) {
    const m = move[id];
    if (m.target === goal && !m.pending) continue;
    m.pending = { value: goal, at: clock + (still.matches ? 0 : at - base) };
  }
  if (!on) select(null);
  announce(on ? "Unpacked: the Ten Essentials and trekking poles" : "Packed: 10 of 10 essentials inside");
  run();
}

function select(id) {
  if (id && (!apart || move[id].x < 0.92)) id = null;
  if (selected === id) return;
  selected = id;
  for (const node of nodes) {
    if (id && node.piece === id) node.el.setAttribute("data-on", "");
    else node.el.removeAttribute("data-on");
  }
  if (id) stage.setAttribute("data-focus", ""); else stage.removeAttribute("data-focus");
  if (id) announce(labelOf(id));
  writeReadout();
}
const labelOf = (id) => (move[id].n ? move[id].n + " / 10 · " + move[id].label : "+2 · " + move[id].label);

function writeReadout() {
  if (selected) return say(labelOf(selected));
  const shares = ESSENTIALS.map((id) => move[id].x);
  const out = shares.filter((x) => x > 0.5).length;
  const resting = IDS.every((id) => !move[id].pending && Math.abs(move[id].x - move[id].target) < 1e-3);
  if (resting && !apart) return say("10 / 10 ESSENTIALS · PACKED");
  if (resting && apart) return say("10 / 10 ESSENTIALS · OUT");
  say(apart ? "UNPACKING · " + out + " / 10 OUT" : "PACKING · " + (10 - out) + " / 10 IN");
}

function step(m, dt, calm) {
  if (m.pending && clock >= m.pending.at) { m.target = m.pending.value; m.pending = null; }
  if (calm) { m.x = m.target; m.v = 0; return !!m.pending; }
  const h = dt / D.spring.substeps;
  for (let i = 0; i < D.spring.substeps; i++) {
    m.v += ((m.target - m.x) * D.spring.stiffness - m.v * D.spring.damping) * h;
    m.x += m.v * h;
  }
  if (Math.abs(m.target - m.x) < 4e-4 && Math.abs(m.v) < 4e-4) { m.x = m.target; m.v = 0; return !!m.pending; }
  return true;
}

const depth = (p) => p[0] * D.V[0] + p[1] * D.V[1] + p[2] * D.V[2];
function place() {
  const keys = new Map();
  let mean = 0;
  for (const id of IDS) {
    const m = move[id];
    const o = along(m, m.x);
    m.o = o;
    m.tx = D.EX[0] * o[0] + D.EY[0] * o[1] + D.EZ[0] * o[2];
    m.ty = D.EX[1] * o[0] + D.EY[1] * o[1] + D.EZ[1] * o[2];
    const inside = m.bottom + o[2] < m.rim;
    m.k = inside ? m.slot + 0.001 * depth([m.ref[0] + o[0], m.ref[1] + o[1], m.ref[2] + o[2]]) : 1000 + depth([m.ref[0] + o[0], m.ref[1] + o[1], m.ref[2] + o[2]]);
    mean += Math.min(1, Math.max(0, m.x));
  }
  mean /= IDS.length;
  for (const node of nodes) {
    if (!node.piece) continue;
    const m = move[node.piece];
    const text = m.x === 0 ? "" : "translate(" + m.tx.toFixed(2) + " " + m.ty.toFixed(2) + ")";
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text); else node.el.removeAttribute("transform");
    }
    node.key = m.k;
  }
  const next = nodes.map((_, i) => i).sort((a, b) => nodes[a].key - nodes[b].key);
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    sceneEl.appendChild(fragment);
    order = next;
  }
  // frame: closer on the packed pack, the whole fan when apart
  const e = mean * mean * (3 - 2 * mean);
  const V = D.views[layout];
  const z = V.zoom + (1 - V.zoom) * e;
  const tx = (V.centre[0] - V.zoom * D.packedCentre[0]) * (1 - e), ty = (V.centre[1] - V.zoom * D.packedCentre[1]) * (1 - e);
  zoomEl.setAttribute("transform", e >= 0.9999 ? "" : "translate(" + tx.toFixed(2) + " " + ty.toFixed(2) + ") scale(" + z.toFixed(4) + ")");
}

const TOUR = { start: 1.6, hold: 0.62 };
function tourTick() {
  const t = clock - tourAt;
  if (t < 0) return;
  if (!apart && t < 1) { setApart(true); return; }
  const settled = IDS.every((id) => !move[id].pending && Math.abs(move[id].x - 1) < 0.02);
  if (apart && settled) {
    if (tour.stepAt === null) tour.stepAt = clock + 0.3;
    const i = Math.floor((clock - tour.stepAt) / TOUR.hold);
    if (i >= 0 && i < ESSENTIALS.length) select(ESSENTIALS[i]);
    // the tour plays once: pack up (still silent), then rest for good
    else if (i >= ESSENTIALS.length) { select(null); setApart(false); touring = false; tourDone = true; }
  }
}
const tour = { stepAt: null };
// seconds until the tour's next step (null while it is still waiting to settle)
function tourWait() {
  if (tour.stepAt === null) return null;
  const i = Math.floor((clock - tour.stepAt) / TOUR.hold);
  return Math.max(0, tour.stepAt + (i + 1) * TOUR.hold - clock) + 0.001;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  const calm = still.matches;
  if (touring) tourTick();
  let moving = false;
  for (const id of IDS) moving = step(move[id], dt, calm) || moving;
  place();
  writeReadout();
  frame = 0;
  if (!visible) return;
  const wait = !moving && touring ? tourWait() : null;
  // nothing moves while the tour holds on an essential: sleep on a timer instead of spinning frames
  if (wait !== null) nap = setTimeout(() => { nap = 0; clock += wait; run(); }, wait * 1000);
  else if (moving || touring) frame = requestAnimationFrame(tick);
}
function run() {
  if (nap) { clearTimeout(nap); nap = 0; }
  if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); }
}

function takeOver() {
  touched = true;
  clearTimeout(idleTimer);
  if (nap) { clearTimeout(nap); nap = 0; }
  if (touring) { touring = false; tourDone = true; if (selected) select(null); }
}

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) {
    run();
    if (!touched && !tourDone && !still.matches && !touring) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { if (!touched) { touring = true; tourAt = clock; tour.stepAt = null; run(); } }, TOUR.start * 1000);
    }
  }
}, { rootMargin: "120px 0px" }).observe(stage);

const pickAt = (target) => {
  const it = target && target.closest ? target.closest(".it[data-sel]") : null;
  return it ? it.dataset.piece : null;
};
stage.addEventListener("pointerenter", (e) => {
  if (e.pointerType === "touch") return;
  takeOver();
  clearTimeout(leaveTimer);
  setApart(true);
});
stage.addEventListener("pointerleave", (e) => {
  if (e.pointerType === "touch") return;
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { if (!still.matches) setApart(false); select(null); }, 160);
});
stage.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  if (apart) select(pickAt(e.target));
});
// a tap (touch down and up without scrolling) toggles packed <-> unpacked, or picks an essential once it is out
let press = null;
stage.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  if (!touchSeen) { touchSeen = true; writeHint(); }
  takeOver();
  press = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
stage.addEventListener("pointercancel", () => { press = null; });
stage.addEventListener("pointerup", (e) => {
  if (e.pointerType !== "touch" || !press || press.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  press = null;
  if (moved > 12) return;
  const id = pickAt(e.target);
  if (apart && id && move[id].x > 0.92) { select(selected === id ? null : id); return; }
  setApart(!apart);
});
stage.addEventListener("focus", () => {
  if (stage.matches(":focus-visible")) { takeOver(); setApart(true); }
});
stage.addEventListener("blur", () => { if (!still.matches) setApart(false); });
stage.addEventListener("keydown", (e) => {
  const key = e.key;
  if (key === " " || key === "Enter") {
    e.preventDefault();
    takeOver();
    if (still.matches) return;
    setApart(!apart);
    return;
  }
  if (key === "Escape") { takeOver(); select(null); if (!still.matches) setApart(false); return; }
  if (key === "ArrowRight" || key === "ArrowLeft" || key === "ArrowDown" || key === "ArrowUp") {
    e.preventDefault();
    takeOver();
    if (!apart) { setApart(true); return; }
    const i = selected ? PICKS.indexOf(selected) : -1;
    const dir = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
    const next = PICKS[(i + dir + PICKS.length) % PICKS.length];
    if (move[next].x > 0.92) select(next);
  }
});

if (still.matches) {
  apart = true;
  for (const id of IDS) { move[id].target = 1; move[id].x = 1; }
  tourDone = true;
}
place();
writeReadout();
`;

const cssDark = `
.iso{
  --anatomy-page:#0B0A0A;--anatomy-card:#0B0A0A;--anatomy-paper:#0B0A0A;
  --anatomy-text:#bdb7aa;--anatomy-strong:#EDE7DA;--anatomy-muted:#878175;
  --anatomy-face:#1c1a17;--anatomy-top:#24211d;
  --anatomy-shade-0:#11100e;--anatomy-shade-1:#161412;--anatomy-shade-2:#1a1816;--anatomy-shade-3:#1f1d1a;
  --anatomy-lit-top:#30281b;--anatomy-lit-shade:#241e15;
  --anatomy-hi:#EDE7DA;--anatomy-mid:#7b766c;--anatomy-lo:#4a4640;--anatomy-faint:#2f2c28;--anatomy-lit:#E8C089;
  --anatomy-halo:#000000;--anatomy-halo-opacity:.8;--anatomy-dot:#EDE7DA;
  --anatomy-mono:"DM Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --pk-void:#050404;--pk-wall-0:#0c0b0a;--pk-wall-1:#0e0d0c;--pk-wall-2:#100f0d;--pk-wall-3:#12110f;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0B0A0A;overflow:hidden;color-scheme:dark}
body{color:var(--anatomy-text);font:12px/1.4 var(--anatomy-mono);-webkit-font-smoothing:antialiased}
.iso-figure{margin:0;height:100%}
.iso-plate{position:relative;height:100vh;height:100dvh;min-height:240px;padding:0;background:var(--anatomy-card);box-shadow:inset 0 0 0 1px #EDE7DA10}
.iso-plate-corners{inset:14px 16px}
/* corner labels sit on their own card-coloured chip, so they keep their 4.5:1 even when a host paints another colour behind the figure */
.iso-plate-corner{font-size:12px;letter-spacing:.05em;background:var(--anatomy-card);padding:3px 5px;margin:-3px -5px}
.iso-plate-corner[data-corner="title"],.iso-plate-corner[data-corner="hint"]{letter-spacing:.09em}
.pk-stage{position:absolute;top:36px;bottom:36px;left:8px;right:8px;outline:none;touch-action:pan-y;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;cursor:default}
.pk-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:-2px}
.pk-stage .iso-svg{width:100%;height:100%;overflow:visible}
.pk-void{fill:var(--pk-void);stroke:none}
.pk-wall[data-shade="0"]{fill:var(--pk-wall-0)}.pk-wall[data-shade="1"]{fill:var(--pk-wall-1)}.pk-wall[data-shade="2"]{fill:var(--pk-wall-2)}.pk-wall[data-shade="3"]{fill:var(--pk-wall-3)}
.pk-lens .iso-top{fill:#0a0909}
.pk-lid-halo{filter:blur(3px);opacity:.5}
.it[data-sel]{cursor:pointer}
.pk-stage[data-focus] .it:not([data-on]){--anatomy-hi:var(--anatomy-mid);--anatomy-mid:var(--anatomy-lo)}
.pk-stage[data-focus] .pk-pull .iso-edge,.pk-stage[data-focus] .pk-pull .iso-line{stroke:var(--anatomy-mid)}
.pk-stage[data-focus] .pk-pull .iso-top{fill:var(--anatomy-top)}
.pk-stage[data-focus] .pk-pull .iso-shade{fill:var(--anatomy-shade-2)}
.it[data-on]{--anatomy-hi:var(--anatomy-lit);--anatomy-mid:var(--anatomy-hi)}
.it[data-on] .iso-top,.it[data-on] .tb-shine{fill:var(--anatomy-lit-top)}
.it[data-on] .iso-shade,.it[data-on] .tb-body{fill:var(--anatomy-lit-shade)}
.it[data-on] [data-seamless]>.iso-shade{stroke:var(--anatomy-lit-shade)}
.it[data-on] [data-seamless]>.iso-top{stroke:var(--anatomy-lit-top)}
.it[data-on] .pk-lens .iso-top{fill:#14110c}
.pk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:440px){
  .pk-stage{bottom:54px}
  .iso-plate-corner[data-corner="hint"]{bottom:20px}
}
`;
// Light theme for the light site: white paper, near-black ink from the kit's light ramp, iceberg-blue accent.
const cssLight = cssDark
  .replace(/\.iso\{[^}]*\}/, `.iso[data-theme="light"]{
  --anatomy-page:#FFFFFF;--anatomy-card:#FFFFFF;--anatomy-paper:#FFFFFF;
  --anatomy-text:#2e2e31;--anatomy-strong:#111111;--anatomy-muted:#5f5f64;
  --anatomy-face:#FFFFFF;--anatomy-top:#FFFFFF;
  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;
  --anatomy-lit-top:#eef7fb;--anatomy-lit-shade:#dbecf4;
  --anatomy-hi:#111111;--anatomy-mid:#7c7c82;--anatomy-lo:#b0b0b5;--anatomy-faint:#d2d2d5;--anatomy-lit:#0F7DAA;
  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.3;--anatomy-dot:#2a2a2e;
  --anatomy-mono:"DM Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --pk-void:#c6c6c2;--pk-wall-0:#d0d0cc;--pk-wall-1:#d7d7d3;--pk-wall-2:#deded9;--pk-wall-3:#e5e5e0;
}`)
  .replace("html,body{margin:0;height:100%;background:#0B0A0A;overflow:hidden;color-scheme:dark}", "html,body{margin:0;height:100%;background:#FFFFFF;overflow:hidden;color-scheme:light}")
  .replace("box-shadow:inset 0 0 0 1px #EDE7DA10", "box-shadow:inset 0 0 0 1px #1111110f")
  .replace(".pk-lens .iso-top{fill:#0a0909}", ".pk-lens .iso-top{fill:#77777d}")
  .replace(".it[data-on] .pk-lens .iso-top{fill:#14110c}", ".it[data-on] .pk-lens .iso-top{fill:#5d8ea5}.it[data-on]{--anatomy-lit:#0B6A93}")
  .replace(".pk-lid-halo{filter:blur(3px);opacity:.5}", ".pk-lid-halo{filter:blur(3px);opacity:.35}");
const css = LIGHT ? cssLight : cssDark;

const plate = k.plateHtml({
  fig: "Fig 1",
  title: "Fourteener pack",
  hint: "Hover to unpack",
  readout: "10 / 10 ESSENTIALS · PACKED",
  body: `<div class="pk-stage" tabindex="0" role="group" aria-roledescription="figure" aria-label="Fourteener pack. Hover, tap, focus or press Space to unpack the Ten Essentials; arrow keys step through them; Escape packs it again.">${svg}</div><div class="pk-sr" aria-live="polite" data-live></div>`,
});
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fourteener pack</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap" rel="stylesheet"><style>${k.ISO_CSS}${css}</style></head><body class="iso" data-theme="${THEME}">${plate}<script type="module">${(kitScript() + live).replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;
writeFileSync(join(HERE, OUT), html);
const solidCount = (html.match(/class="iso-solid/g) || []).length;
console.log(`wrote ${OUT} · wide ${VIEW.wide.vb.join(" ")} · tall ${VIEW.tall.vb.join(" ")} · ${statics.length} static items · ${movers.length} moving assemblies · ${solidCount} solids · ${Math.round(html.length / 1024)} KB · zoom ${VIEW.wide.zoom}/${VIEW.tall.zoom}`);

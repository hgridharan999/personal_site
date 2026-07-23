import { useEffect, useRef } from 'react';
import * as ZdogNS from 'zdog';

const Zdog = ZdogNS.default || ZdogNS;
const TAU = Zdog.TAU;

const BONE = '#EDE7DA';
const AMBER = '#E8C089';
const LINE = 'rgba(237,231,218,0.66)';   // main line
const LINE2 = 'rgba(237,231,218,0.34)';  // faint / construction line
const DIM = 'rgba(237,231,218,0.2)';

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===========================================================================
//  Wireframe primitives
// ===========================================================================
// ring around the Y axis (a washer lying flat on a vertical shaft)
function ringY(addTo, { d, color = LINE, stroke = 1.4, y = 0 }) {
  return new Zdog.Ellipse({ addTo, diameter: d, stroke, color, rotate: { x: TAU / 4 }, translate: { y } });
}
// radial ticks in the X-Y plane (a dial / bezel scale, facing +Z)
function tickRing(addTo, { r, inner, count, color = LINE, stroke = 1, z = 0 }) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    new Zdog.Shape({ addTo, path: [{ x: Math.cos(a) * inner, y: Math.sin(a) * inner, z }, { x: Math.cos(a) * r, y: Math.sin(a) * r, z }], stroke, color });
  }
}
// pointed rose / star in the X-Y plane
function star(addTo, { rOut, rIn, points = 8, color = LINE, stroke = 1.2, z = 0 }) {
  const path = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU;
    const rr = i % 2 ? rIn : rOut;
    path.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, z });
  }
  new Zdog.Shape({ addTo, path, closed: true, stroke, color });
}
// vertical rim lines connecting two coaxial rings (a cylinder wall)
function wall(addTo, { r, y0, y1, count = 24, color = LINE2, stroke = 1 }) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
    new Zdog.Shape({ addTo, path: [{ x, y: y0, z }, { x, y: y1, z }], stroke, color });
  }
}
// knurled cylinder / crown around the Y axis
function knurlY(addTo, { r, len, lines = 16, color = LINE, stroke = 1.1 }) {
  const g = new Zdog.Anchor({ addTo });
  ringY(g, { d: r * 2, color, stroke, y: -len / 2 });
  ringY(g, { d: r * 2, color, stroke, y: len / 2 });
  wall(g, { r, y0: -len / 2, y1: len / 2, count: lines, color, stroke });
  return g;
}
// wireframe box edges centred at origin (half-size h)
function boxEdges(addTo, h, { color = LINE, stroke = 2 } = {}) {
  const V = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) V.push({ x, y, z });
  const E = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
  E.forEach(([a, b]) => new Zdog.Shape({ addTo, path: [V[a], V[b]], stroke, color }));
  return V;
}

// ===========================================================================
//  Scenes — recognisable objects, one per page. Each returns { update(t) }.
// ===========================================================================
const SCENES = {
  // HOME — a navigational compass: cased dial, degree bezel, rose, swinging needle.
  home(illo) {
    const g = new Zdog.Anchor({ addTo: illo });
    const R = 46, depth = 10;
    new Zdog.Ellipse({ addTo: g, diameter: R * 2, stroke: 2.4, color: LINE, translate: { z: depth / 2 } });
    new Zdog.Ellipse({ addTo: g, diameter: R * 2, stroke: 2.4, color: LINE, translate: { z: -depth / 2 } });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU, x = Math.cos(a) * R, y = Math.sin(a) * R;
      new Zdog.Shape({ addTo: g, path: [{ x, y, z: -depth / 2 }, { x, y, z: depth / 2 }], stroke: 1, color: LINE2 });
    }
    const face = new Zdog.Anchor({ addTo: g, translate: { z: depth / 2 + 0.5 } });
    tickRing(face, { r: R - 3, inner: R - 8, count: 36, color: LINE2, stroke: 1 });
    tickRing(face, { r: R - 2, inner: R - 12, count: 4, color: AMBER, stroke: 2.2 });
    new Zdog.Ellipse({ addTo: face, diameter: (R - 15) * 2, stroke: 1.1, color: LINE2 });
    star(face, { rOut: R - 18, rIn: 7, points: 8, color: LINE, stroke: 1.2 });
    star(face, { rOut: R - 26, rIn: 5, points: 4, color: LINE2, stroke: 1 });
    const needle = new Zdog.Anchor({ addTo: g, translate: { z: depth / 2 + 3 } });
    new Zdog.Shape({ addTo: needle, path: [{ x: -5, y: 0 }, { x: 0, y: -(R - 15) }, { x: 5, y: 0 }], closed: true, stroke: 1.2, color: AMBER, fill: true });   // north
    new Zdog.Shape({ addTo: needle, path: [{ x: -4, y: 0 }, { x: 0, y: (R - 17) }, { x: 4, y: 0 }], closed: true, stroke: 1, color: DIM, fill: true });          // south counterweight (dim)
    new Zdog.Shape({ addTo: g, translate: { z: depth / 2 + 4.5 }, stroke: 6, color: LINE });
    // lanyard loop
    new Zdog.Shape({ addTo: g, path: [{ x: 0, y: -R + 2 }, { x: 0, y: -R - 6 }], stroke: 3.5, color: LINE });
    new Zdog.Ellipse({ addTo: g, diameter: 13, stroke: 2.6, color: LINE, translate: { y: -R - 12 } });
    illo.rotate.x = -0.92; illo.rotate.z = 0.12;
    return {
      update(t) {
        g.rotate.z = Math.sin(t * 0.004) * 0.22;
        needle.rotate.z = Math.sin(t * 0.02) * 0.5;
        illo.rotate.x = -0.92 + Math.sin(t * 0.006) * 0.06;
      },
    };
  },

  // WORK — a pocket watch; the hour hand indexes to the active lens.
  work(illo, ctl) {
    const g = new Zdog.Anchor({ addTo: illo });
    const R = 40, depth = 9;
    new Zdog.Ellipse({ addTo: g, diameter: R * 2, stroke: 2.4, color: LINE, translate: { z: depth / 2 } });
    new Zdog.Ellipse({ addTo: g, diameter: R * 2, stroke: 2.4, color: LINE, translate: { z: -depth / 2 } });
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU, x = Math.cos(a) * R, y = Math.sin(a) * R;
      new Zdog.Shape({ addTo: g, path: [{ x, y, z: -depth / 2 }, { x, y, z: depth / 2 }], stroke: 1, color: LINE2 });
    }
    const face = new Zdog.Anchor({ addTo: g, translate: { z: depth / 2 + 0.5 } });
    tickRing(face, { r: R - 4, inner: R - 9, count: 12, color: LINE, stroke: 1.8 });
    tickRing(face, { r: R - 4, inner: R - 6, count: 60, color: DIM, stroke: 0.7 });
    new Zdog.Ellipse({ addTo: face, diameter: (R - 20) * 2, stroke: 0.9, color: LINE2 });
    const hands = new Zdog.Anchor({ addTo: g, translate: { z: depth / 2 + 2 } });
    const hour = new Zdog.Shape({ addTo: hands, path: [{ x: 0, y: 4 }, { x: 0, y: -(R - 22) }], stroke: 2.6, color: LINE });
    const min = new Zdog.Shape({ addTo: hands, path: [{ x: 0, y: 6 }, { x: 0, y: -(R - 11) }], stroke: 1.6, color: AMBER });
    new Zdog.Shape({ addTo: hands, stroke: 5, color: AMBER });
    // stem + crown + bail
    new Zdog.Shape({ addTo: g, path: [{ x: 0, y: -R }, { x: 0, y: -R - 6 }], stroke: 4, color: LINE });
    knurlY(new Zdog.Anchor({ addTo: g, translate: { y: -R - 11 } }), { r: 6, len: 8, lines: 12, color: LINE });
    new Zdog.Ellipse({ addTo: g, diameter: 13, stroke: 2.6, color: LINE, translate: { y: -R - 19 } });
    illo.rotate.x = -0.72; illo.rotate.y = 0.14;
    const clamp = (f) => Math.max(0, Math.min(2, f));
    return {
      update(t) {
        g.rotate.y = 0.14 + Math.sin(t * 0.004) * 0.09;
        min.rotate.z = -t * 0.02;
        hour.rotate.z += (-clamp(ctl.current?.focus ?? 1) * (TAU / 3) - hour.rotate.z) * 0.1;
        illo.rotate.x = -0.72 + Math.sin(t * 0.005) * 0.04;
      },
    };
  },

  // PROJECTS — a missile: slender body, ogive nose, guidance band, tail fins.
  projects(illo) {
    const g = new Zdog.Anchor({ addTo: illo });
    const r = 9, yTop = -30, yBot = 34;
    ringY(g, { d: r * 2, color: LINE, stroke: 2, y: yTop });
    ringY(g, { d: r * 2, color: LINE, stroke: 2, y: yBot });
    wall(g, { r, y0: yTop, y1: yBot, count: 12, color: LINE2, stroke: 0.8 });
    [yTop + 16, 4, yBot - 10].forEach((y) => ringY(g, { d: r * 2, color: LINE2, stroke: 1, y }));
    ringY(g, { d: r * 2 + 1, color: AMBER, stroke: 2, y: yTop + 18 });                  // payload band
    new Zdog.Cone({ addTo: g, diameter: r * 2, length: 24, stroke: 2, color: LINE, rotate: { x: TAU / 4 }, translate: { y: yTop } });
    for (let i = 0; i < 4; i++) {
      const fin = new Zdog.Anchor({ addTo: g, rotate: { y: (i / 4) * TAU } });
      new Zdog.Shape({ addTo: fin, path: [{ x: r, y: yBot - 13 }, { x: r + 9, y: yBot + 8 }, { x: r, y: yBot - 2 }], closed: true, stroke: 1.4, color: LINE });
    }
    new Zdog.Cone({ addTo: g, diameter: r * 1.2, length: 6, stroke: 1.6, color: LINE2, rotate: { x: TAU / 4 }, translate: { y: yBot } });
    illo.rotate.x = -0.05; illo.rotate.z = 0.42;   // canted, in flight
    return {
      update(t) {
        g.rotate.y = t * 0.012;
        illo.rotate.z = 0.42 + Math.sin(t * 0.005) * 0.04;
      },
    };
  },

  // HIKING — a cup anemometer: masted rotor with three hemispherical cups.
  hiking(illo) {
    const g = new Zdog.Anchor({ addTo: illo });
    new Zdog.Shape({ addTo: g, path: [{ y: -6 }, { y: 42 }], stroke: 2, color: LINE });        // mast
    for (let i = 0; i < 3; i++) {                                                              // tripod feet
      const a = (i / 3) * TAU;
      new Zdog.Shape({ addTo: g, path: [{ x: 0, y: 42, z: 0 }, { x: Math.cos(a) * 15, y: 50, z: Math.sin(a) * 15 }], stroke: 1.2, color: LINE2 });
    }
    ringY(g, { d: 11, color: LINE, stroke: 1.6, y: -6 });                                      // hub
    new Zdog.Shape({ addTo: g, translate: { y: -8 }, stroke: 5, color: AMBER });               // hub cap
    const rotor = new Zdog.Anchor({ addTo: g, translate: { y: -6 } });
    for (let i = 0; i < 3; i++) {
      const arm = new Zdog.Anchor({ addTo: rotor, rotate: { y: (i / 3) * TAU } });
      new Zdog.Shape({ addTo: arm, path: [{ x: 0 }, { x: 26 }], stroke: 1.6, color: LINE });
      new Zdog.Hemisphere({ addTo: arm, diameter: 14, stroke: 1.5, color: i === 0 ? AMBER : LINE, translate: { x: 26 }, rotate: { y: -TAU / 4 } });
    }
    illo.rotate.x = -0.42; illo.rotate.y = -0.1;
    return {
      update(t) {
        rotor.rotate.y = t * 0.055;
        illo.rotate.x = -0.42 + Math.sin(t * 0.004) * 0.06;
      },
    };
  },

  // TRAILSENSE — a ballpoint pen: barrel, grip, tapered tip, clip, click button.
  trailsense(illo) {
    const g = new Zdog.Anchor({ addTo: illo, rotate: { z: -0.72 } });   // held on a diagonal
    const r = 7, top = -34, mid = 20;
    ringY(g, { d: r * 2, color: LINE, stroke: 2, y: top });
    ringY(g, { d: r * 2, color: LINE, stroke: 2, y: mid });
    wall(g, { r, y0: top, y1: mid, count: 12, color: LINE2, stroke: 0.8 });
    [8, 11, 14, 17].forEach((y) => ringY(g, { d: r * 2, color: LINE2, stroke: 1, y }));  // grip knurl
    new Zdog.Cone({ addTo: g, diameter: r * 2, length: 16, stroke: 2, color: LINE, rotate: { x: -TAU / 4 }, translate: { y: mid } });   // tapers down to the tip
    new Zdog.Shape({ addTo: g, translate: { y: mid + 17 }, stroke: 3, color: AMBER });   // ball tip
    new Zdog.Cone({ addTo: g, diameter: r * 1.5, length: 6, stroke: 1.6, color: LINE, rotate: { x: TAU / 4 }, translate: { y: top } });  // click end tapers up
    new Zdog.Shape({ addTo: g, translate: { y: top - 9 }, stroke: 7, color: AMBER });     // click button
    new Zdog.Shape({ addTo: g, path: [{ x: r, y: top + 2, z: 1 }, { x: r + 2.5, y: top + 16, z: 1 }, { x: r, y: top + 26, z: 1 }], stroke: 1.6, color: LINE }); // clip
    illo.rotate.x = -0.16; illo.rotate.y = -0.32;
    return {
      update(t) {
        g.rotate.y = t * 0.01;
        illo.rotate.x = -0.16 + Math.sin(t * 0.004) * 0.06;
      },
    };
  },

  // INVESTMENT THESIS — a roulette wheel: bowl, fretted pockets, spinning turret,
  // and a ball orbiting the track the other way.
  thesis(illo) {
    const g = new Zdog.Anchor({ addTo: illo });
    const R = 42;
    ringY(g, { d: R * 2, color: LINE, stroke: 2, y: 0 });                 // bowl rim
    ringY(g, { d: (R - 3) * 2, color: LINE2, stroke: 1, y: 1 });          // ball track
    ringY(g, { d: (R - 8) * 2, color: LINE2, stroke: 1, y: -2 });
    const wheel = new Zdog.Anchor({ addTo: g });
    ringY(wheel, { d: (R - 11) * 2, color: LINE, stroke: 1.4, y: -1 });
    ringY(wheel, { d: (R - 24) * 2, color: LINE, stroke: 1.4, y: -3 });
    const pockets = 20;
    for (let i = 0; i < pockets; i++) {
      const a = (i / pockets) * TAU, c = Math.cos(a), s = Math.sin(a);
      new Zdog.Shape({ addTo: wheel, path: [{ x: c * (R - 24), y: -3, z: s * (R - 24) }, { x: c * (R - 11), y: -1, z: s * (R - 11) }], stroke: 1, color: i % 2 ? AMBER : LINE2 });
    }
    new Zdog.Cone({ addTo: wheel, diameter: (R - 24) * 1.1, length: 16, stroke: 1.4, color: LINE, rotate: { x: -TAU / 4 }, translate: { y: -3 } });
    const cross = new Zdog.Anchor({ addTo: wheel, translate: { y: -19 } });
    [0, 1].forEach((k) => new Zdog.Shape({ addTo: cross, path: [{ x: -15 }, { x: 15 }], stroke: 1.6, color: LINE, rotate: { y: (k * TAU) / 4 } }));
    new Zdog.Shape({ addTo: cross, stroke: 6, color: AMBER });            // spinner knob
    const ball = new Zdog.Shape({ addTo: g, translate: { x: R - 3, y: -1 }, stroke: 5, color: BONE });
    illo.rotate.x = -0.64; illo.rotate.z = 0.1;
    return {
      update(t) {
        wheel.rotate.y = t * 0.02;
        const a = -t * 0.05;
        ball.translate.x = Math.cos(a) * (R - 3);
        ball.translate.z = Math.sin(a) * (R - 3);
        illo.rotate.x = -0.64 + Math.sin(t * 0.004) * 0.04;
      },
    };
  },

  // THESES — a detailed satellite: panelled bus, truss solar wings with cell
  // grids, a dish with feed horn on struts, and a whip antenna.
  theses(illo) {
    const g = new Zdog.Anchor({ addTo: illo });
    const h = 9;
    // bus (body) with face panel lines + a gold-foil (MLI) panel
    boxEdges(g, h, { color: LINE, stroke: 1.6 });
    new Zdog.Shape({ addTo: g, path: [{ x: 0, y: -h, z: h }, { x: 0, y: h, z: h }], stroke: 0.7, color: LINE2 });
    new Zdog.Shape({ addTo: g, path: [{ x: -h, y: 0, z: h }, { x: h, y: 0, z: h }], stroke: 0.7, color: LINE2 });
    new Zdog.Rect({ addTo: g, width: 11, height: 8, stroke: 1, color: AMBER, translate: { x: h + 0.3, y: -3 }, rotate: { y: TAU / 4 } });
    // solar wings — a truss boom, then two cell-grid panels
    [-1, 1].forEach((s) => {
      const b0 = h, b1 = h + 13;
      new Zdog.Shape({ addTo: g, path: [{ x: s * b0, y: -2.5 }, { x: s * b1, y: -2.5 }], stroke: 1, color: LINE });
      new Zdog.Shape({ addTo: g, path: [{ x: s * b0, y: 2.5 }, { x: s * b1, y: 2.5 }], stroke: 1, color: LINE });
      for (let k = 0; k < 3; k++) {
        const x0 = s * (b0 + (b1 - b0) * (k / 3)), x1 = s * (b0 + (b1 - b0) * ((k + 1) / 3));
        new Zdog.Shape({ addTo: g, path: [{ x: x0, y: -2.5 }, { x: x1, y: 2.5 }], stroke: 0.6, color: LINE2 });
      }
      const wing = new Zdog.Anchor({ addTo: g, translate: { x: s * (b1 + 20) } });
      [-1, 1].forEach((half) => {
        const p = new Zdog.Anchor({ addTo: wing, translate: { x: half * 10 } });
        new Zdog.Rect({ addTo: p, width: 19, height: 24, stroke: 1.3, color: LINE });
        for (let c = -1; c <= 1; c++) new Zdog.Shape({ addTo: p, path: [{ x: c * 6.3, y: -12 }, { x: c * 6.3, y: 12 }], stroke: 0.55, color: LINE2 });
        for (let r = -2; r <= 2; r++) new Zdog.Shape({ addTo: p, path: [{ x: -9.5, y: r * 4.8 }, { x: 9.5, y: r * 4.8 }], stroke: 0.5, color: LINE2 });
      });
    });
    // dish antenna — concentric parabola rings + feed horn on 3 struts
    new Zdog.Shape({ addTo: g, path: [{ y: -h }, { y: -h - 5 }], stroke: 1.4, color: LINE });
    const dish = new Zdog.Anchor({ addTo: g, translate: { y: -h - 8, z: 3 }, rotate: { x: -0.6 } });
    new Zdog.Ellipse({ addTo: dish, diameter: 22, stroke: 1.6, color: AMBER });
    new Zdog.Ellipse({ addTo: dish, diameter: 14, stroke: 1, color: AMBER });
    new Zdog.Ellipse({ addTo: dish, diameter: 6, stroke: 0.8, color: AMBER });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; new Zdog.Shape({ addTo: dish, path: [{ x: Math.cos(a) * 9, y: Math.sin(a) * 9, z: 0 }, { x: 0, y: 0, z: 10 }], stroke: 0.7, color: LINE2 }); }
    new Zdog.Shape({ addTo: dish, translate: { z: 10 }, stroke: 3, color: LINE });
    // whip antenna
    new Zdog.Shape({ addTo: g, path: [{ x: -2, y: h }, { x: -7, y: h + 15 }], stroke: 0.8, color: LINE });
    new Zdog.Shape({ addTo: g, translate: { x: -7, y: h + 15 }, stroke: 2.4, color: AMBER });
    illo.rotate.x = -0.34; illo.rotate.y = -0.42;
    return {
      update(t) {
        g.rotate.y = t * 0.006;
        illo.rotate.x = -0.34 + Math.sin(t * 0.005) * 0.06;
      },
    };
  },
};

/**
 * A rotating 3D wireframe object (Zdog), one per page. Renders one static frame
 * immediately (visible under reduced-motion / throttled tabs) then animates.
 * `ctl` carries live reactive values (Work's focused lens index).
 */
export default function PageInstrument({ variant = 'home', size = 112, ctl, style, className }) {
  const canvasRef = useRef(null);
  const ctlRef = useRef({});
  ctlRef.current = { ...ctlRef.current, ...(ctl || {}) };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !Zdog?.Illustration || !SCENES[variant]) return;

    // Hand Zdog the CSS size; Zdog owns the retina backing store (pixelRatio).
    canvas.width = size;
    canvas.height = size;

    let illo, scene;
    try {
      illo = new Zdog.Illustration({ element: canvas, zoom: size / 128 });
      scene = SCENES[variant](illo, ctlRef);
      illo.updateRenderGraph();
    } catch {
      return;
    }
    if (reduced()) return;

    let raf = null, t = 0, frame = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (++frame % 2) return;          // ~30fps — plenty for a slow rotation, halves render cost
      t += 2;
      try {
        if (scene?.update) scene.update(t); else illo.rotate.y += 0.012;
        illo.updateRenderGraph();
      } catch { if (raf) cancelAnimationFrame(raf); raf = null; }
    };
    const onVis = () => {
      if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
      else if (raf === null) { frame = 0; raf = requestAnimationFrame(loop); }
    };
    document.addEventListener('visibilitychange', onVis);
    if (!document.hidden) raf = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [variant, size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    />
  );
}

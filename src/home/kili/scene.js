import { createPainter } from './paint.js';
import { buildRoute } from './route.js';
import { isPhone, layoutLines } from './terrain.js';

const MAX_DPR = 2;

/**
 * The drawing for one band: lays the lines and route out at the band's size, puts the labels on
 * them, and paints the playhead's current state onto the canvas. `layout()` runs again whenever
 * the band changes size.
 */
export function createScene({ band, canvas, ctx, terrain, routeData, labels, head, win }) {
  let W = 0;
  let H = 0;
  let dpr = 1;
  let lines = null;
  let built = null;
  let paintFrame = null;
  let life = head.life(1);

  const scene = {
    get lineCount() { return lines.N; },
    get width() { return W; },
    get height() { return H; },

    /** Measure the band and rebuild everything that depends on its size. */
    layout() {
      W = Math.max(1, Math.round(band.clientWidth));
      H = Math.max(1, Math.round(band.clientHeight));
      dpr = Math.min(win.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      lines = layoutLines(terrain, W, H, isPhone(W));
      built = buildRoute(routeData, lines);
      paintFrame = createPainter(ctx, lines, built);
      labels.place(lines, built, terrain);
    },

    sizeChanged() {
      return Math.round(band.clientWidth) !== W || Math.round(band.clientHeight) !== H;
    },

    /** Take the playhead's state for the next paint, and fade in the labels it has reached. */
    update() {
      life = head.life(built.total);
      labels.reveal(head.lifeNow, life.routeLen, built);
    },

    paint() {
      paintFrame({ dpr, drawT: head.drawT, full: head.done, ...life });
    },

    clear() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
  return scene;
}

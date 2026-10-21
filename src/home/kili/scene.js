import { createPainter } from './paint.js';
import { buildRoute } from './route.js';
import { isPhone, layoutLines } from './terrain.js';

const MAX_DPR = 2;
// While the drawing is moving (about 5 s) the canvas is kept at one pixel per CSS pixel, even on a
// 2x screen: repainting four times the pixels 30 times a second starves the whole page. When it
// settles it is repainted once at full density, so the still frame is crisp.

/**
 * The drawing for one band: lays the lines and route out at the band's size, puts the labels on
 * them, and paints the playhead's current state onto the canvas. `layout()` runs again whenever
 * the band changes size or pixel density.
 */
export function createScene({ band, canvas, ctx, terrain, routeData, labels, head, win }) {
  let W = 0;
  let H = 0;
  let fullDpr = 1; // the screen's density, capped
  let dpr = 1; // the density the canvas is at now
  let sharp = false;
  let lines = null;
  let built = null;
  let paintFrame = null;
  let life = head.life(1);

  const screenDpr = () => Math.min(win.devicePixelRatio || 1, MAX_DPR);
  /** Size the canvas bitmap for the current density; this also clears it, so paint after. */
  function resizeBitmap() {
    dpr = fullDpr; // crisp from the first frame: no draft density, so nothing sharpens later
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const scene = {
    get lineCount() { return lines.N; },
    get width() { return W; },
    get height() { return H; },

    /** Measure the band and rebuild everything that depends on its size. */
    layout() {
      W = Math.max(1, Math.round(band.clientWidth));
      H = Math.max(1, Math.round(band.clientHeight));
      fullDpr = screenDpr();
      sharp = head.still;
      resizeBitmap();
      lines = layoutLines(terrain, W, H, isPhone(W));
      built = buildRoute(routeData, lines);
      paintFrame = createPainter(ctx, lines, built);
      labels.place(lines, built, terrain);
    },

    /** The band's size or the screen's density is not what the layout was made for. */
    sizeChanged() {
      return Math.round(band.clientWidth) !== W || Math.round(band.clientHeight) !== H || screenDpr() !== fullDpr;
    },

    /** Kept for the callers that mark a still frame; the density never changes, so nothing is redrawn. */
    setSharp(next) {
      sharp = next;
    },

    /** Take the playhead's state for the next paint, and fade in the labels it has reached. */
    update() {
      life = head.life(built.total);
      labels.reveal(head.lifeNow, life.routeLen, built);
    },

    paint() {
      paintFrame({ dpr, pixelW: canvas.width, pixelH: canvas.height, drawT: head.drawT, full: head.done, ...life });
    },

    clear() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
  return scene;
}

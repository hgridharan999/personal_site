import { createLabels } from './labels.js';
import { createScene } from './scene.js';
import { parseTerrain } from './terrain.js';
import { createPlayhead } from './timeline.js';
import { watchBand } from './watch.js';

// The ending's animation loop. This file is loaded on demand (a dynamic import from
// useKiliBand), together with the modules it uses, so a visitor who never scrolls to the ending
// downloads none of it.
//
// The loop costs nothing when it cannot be seen: no requestAnimationFrame is pending while the
// band is off screen, the tab is hidden, motion is paused, or the visitor asked for reduced
// motion (which gets the finished, coloured still frame instead).

const FRAME_MS = 30; // the slow tide and band of light need no more than ~30 redraws a second
const START_AT = 0.3; // draw in once this much of the band is on screen
const COSTS_KEPT = 240;

/**
 * Starts the ending inside `band`. `terrainData` and `routeData` are the fetched JSON files
 * (`routeData` may be null: the terrain then draws without a route). Returns a controller:
 * `togglePause()`, `setPaused(bool)`, `dispose()`, `stats()` and `state()`. `onMotion(bool)`
 * says whether there is any motion to pause (false under reduced motion); `onPaused(bool)`
 * follows the toggle.
 */
export function createKiliBand({ band, terrainData, routeData, onMotion = () => {}, onPaused = () => {}, win = window }) {
  const labels = createLabels(band);
  const { canvas } = labels;
  const ctx = canvas?.getContext('2d');
  if (!ctx) throw new Error('kili: no 2d canvas');
  const mq = win.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mq.matches;
  const head = createPlayhead();
  const scene = createScene({ band, canvas, ctx, terrain: parseTerrain(terrainData), routeData, labels, head, win });
  scene.layout();

  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let onScreen = false;
  let paused = false;
  let disposed = false;
  const costs = [];
  const canRun = () => !disposed && onScreen && !win.document.hidden && !reduced() && !paused;
  // nothing to draw before the draw-in begins or once the finished frame is up
  const hasWork = () => head.started && !(head.done && head.still);

  function kick() {
    if (raf || !hasWork() || !canRun()) return;
    last = performance.now();
    raf = win.requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (!canRun()) return;
    const t0 = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const busy = head.advance(dt, scene.lineCount);
    if (head.done) scene.update();
    if (busy && !(head.done && now - lastDraw < FRAME_MS)) {
      scene.paint();
      lastDraw = now;
      costs.push(performance.now() - t0);
      if (costs.length > COSTS_KEPT) costs.shift();
    }
    if (busy) raf = win.requestAnimationFrame(frame);
  }

  function showFinished() {
    head.freeze(scene.lineCount);
    scene.update();
    scene.paint();
  }

  function startDrawIn() {
    if (head.started) return;
    if (reduced() || paused) showFinished();
    else {
      head.begin(scene.lineCount, false);
      kick();
    }
  }

  function setPaused(next) {
    if (next === paused) return;
    paused = next;
    onPaused(paused);
    if (paused) {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
      if (head.started && !head.done) showFinished();
    } else {
      if (!reduced()) head.thaw();
      kick();
    }
  }

  const stopWatching = watchBand({
    band,
    win,
    mq,
    thresholds: [0, START_AT, 0.6],
    onView(visible, ratio) {
      onScreen = visible;
      if (ratio >= START_AT) startDrawIn();
      if (visible) kick();
    },
    onResize() {
      if (!scene.sizeChanged()) return;
      scene.layout();
      if (head.done) scene.update();
      scene.paint();
    },
    onWake: kick,
    onPreference() {
      onMotion(!reduced());
      if (reduced()) showFinished();
      else if (head.thaw()) kick();
    },
  });
  try {
    onMotion(!reduced());
    if (reduced()) showFinished();
  } catch (error) {
    dispose(); // the observers above are live: nothing else could release them
    throw error;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    stopWatching();
    labels.reset();
    scene.clear();
    if (import.meta.env?.DEV && win.__kili === api) delete win.__kili;
  }

  /** Frame cost in ms over the last few hundred redraws, for checking the loop stays cheap. */
  function stats() {
    if (!costs.length) return null;
    const sorted = costs.slice().sort((a, b) => a - b);
    const at = (q) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(3);
    return { n: sorted.length, median: at(0.5), p95: at(0.95), max: +sorted[sorted.length - 1].toFixed(3) };
  }

  const api = {
    get paused() { return paused; },
    togglePause() {
      setPaused(!paused);
      return paused;
    },
    setPaused,
    dispose,
    stats,
    /** For the dev-server checks: is a frame queued, and where is the timeline. */
    state: () => ({
      raf: !!raf, onScreen, paused, started: head.started, done: head.done, still: head.still,
      drawT: +head.drawT.toFixed(2), lifeT: +head.lifeT.toFixed(2), lines: scene.lineCount, width: scene.width, height: scene.height,
    }),
  };
  if (import.meta.env?.DEV) win.__kili = api;
  return api;
}

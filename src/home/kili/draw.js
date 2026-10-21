import { createLabels } from './labels.js';
import { createScene } from './scene.js';
import { parseTerrain } from './terrain.js';
import { createPlayhead } from './timeline.js';
import { watchBand } from './watch.js';

// The ending's animation loop. This file is loaded on demand (a dynamic import from
// useKiliBand), together with the modules it uses, so a visitor who never scrolls to the ending
// downloads none of it.
//
// The canvas only moves while the lines draw in (about 2 s). Then it paints its final frame and
// the loop stops for good: no requestAnimationFrame is queued again, and the drawing is a still
// picture. Nothing runs while the band is off screen, the tab is hidden, the page is scrolling,
// or the visitor asked for reduced motion (who gets the finished frame straight away).

const START_AT = 0.3; // draw in once this much of the band is on screen
const COSTS_KEPT = 240;

/**
 * Starts the ending inside `band`. `terrainData` and `routeData` are the fetched JSON files
 * (`routeData` may be null: the terrain then draws without a route). Returns a controller:
 * `togglePause()`, `setPaused(bool)` (jump to the finished frame), `dispose()`, `stats()` and
 * `state()`. The optional `onMotion(bool)` and `onPaused(bool)` report whether there is motion
 * and whether it is paused; the page no longer needs them.
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
  let onScreen = false;
  let paused = false;
  let scrolling = false; // the page is scrolling: nothing here moves until it stops
  let disposed = false;
  const costs = [];
  const visible = () => !disposed && onScreen && !win.document.hidden;
  const canRun = () => visible() && !reduced() && !paused && !scrolling;
  // nothing to draw before the draw-in begins, or once the final frame is up
  const hasWork = () => head.started && !head.still;


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
    const step = head.advance(dt, scene.lineCount);
    if (step === 'idle') return;
    if (head.done) scene.update();
    const settling = step === 'settle';
    // every frame while it moves: the draw-in and the route read as one smooth stroke
    if (settling) scene.setSharp(true); // marks the still frame
    scene.paint();
    costs.push(performance.now() - t0);
    if (costs.length > COSTS_KEPT) costs.shift();
    if (!settling) raf = win.requestAnimationFrame(frame); // settled: the drawing is a still picture now
  }

  function showFinished() {
    head.freeze(scene.lineCount);
    scene.setSharp(true);
    scene.update();
    scene.paint();
  }

  function startDrawIn() {
    if (head.started) return;
    if (reduced() || paused) showFinished();
    else {
      head.begin();
      kick();
    }
  }

  /** Repaint the current frame at full density (or draft density), for a pause in the middle of life. */
  function holdSharp(on) {
    scene.setSharp(on);
    scene.update();
    scene.paint();
  }

  function setPaused(next) {
    if (next === paused) return;
    paused = next;
    onPaused(paused);
    if (paused) {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
      if (head.started && !head.done) showFinished();
      else if (head.started && !head.still) holdSharp(true); // frozen mid-life: show it crisp
    } else {
      if (head.started && !head.still) holdSharp(false); // moving again: back to draft density
    }
    kick();
  }

  const stopWatching = watchBand({
    band,
    win,
    mq,
    thresholds: [0, START_AT, 0.6],
    onView(inView, ratio) {
      onScreen = inView;
      if (ratio >= START_AT) startDrawIn();
      if (inView) kick();
    },
    onResize() {
      if (!scene.sizeChanged()) return;
      scene.layout();
      if (head.done) scene.update();
      scene.paint();
    },
    onWake: kick,
    // While the page scrolls the drawing and the light hold still, so the browser only has to move
    // finished layers. They pick up where they were once it has been still for a moment.
    onScroll(next) {
      scrolling = next;
      kick();
    },
    onPreference() {
      onMotion(!reduced());
      if (reduced()) showFinished();
      else kick();
      kick();
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
      drawT: +head.drawT.toFixed(2), lines: scene.lineCount, width: scene.width, height: scene.height,
    }),
  };
  if (import.meta.env?.DEV) win.__kili = api;
  return api;
}

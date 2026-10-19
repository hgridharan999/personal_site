import { createGovernor } from './governor.js';
import { STILL_T } from './iceberg.js';
import { createTap, wirePointer } from './pointer.js';
import { createRenderer } from './renderer.js';
import { onMediaChange, watchBand, watchContext } from './watch.js';
import { createWake } from './wake.js';

/*
 * The imperative core of the ending: one object owns the canvas, the GL context, the rAF loop, every
 * observer and every listener, and dispose() undoes all of it. useIcebergGL() creates one inside a
 * single effect, so React StrictMode's mount, unmount, mount leaves nothing behind. This module is
 * loaded on demand (see the hook), so none of it is in the page's main chunk.
 */

const CLOCK_START = 3.0; // the mockup's clock started at 3s, so the first frame is not the t=0 pose

class BandEngine {
  #band;
  #cb;
  #mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  #gov = createGovernor();
  #tap = createTap();
  #abort = new AbortController();
  #cleanups = []; // run in reverse by dispose()
  #box = new Float32Array(4);
  #trail = new Float32Array(0);
  #canvas = null;
  #renderer = null;
  #wake = null;
  #disposed = false;
  #glOK = false;
  #visible = false;
  #paused = false;
  #raf = 0;
  #clock = CLOCK_START;
  #status = 'idle';
  #motion = false;

  constructor(band, callbacks) {
    this.#band = band;
    this.#cb = callbacks;
  }

  #setStatus(s) {
    if (this.#disposed || s === this.#status) return;
    this.#status = s;
    this.#cb.onStatus(s);
  }

  #setMotion(m) {
    if (this.#disposed || m === this.#motion) return;
    this.#motion = m;
    this.#cb.onMotion(m);
  }

  #resize() {
    const r = this.#band.getBoundingClientRect();
    this.#renderer.resize(r.width, r.height, this.#gov.quality);
  }

  #draw(t) {
    if (!this.#glOK) return;
    this.#wake?.fill(this.#trail, this.#box); // an empty box tells the shader to skip the wake
    this.#renderer.draw(t, this.#tap.data, this.#trail, this.#box);
    this.#setStatus('on'); // the first drawn frame is what hides the SVG fallback
  }

  #still() {
    if (!this.#glOK) return;
    this.#resize();
    this.#draw(STILL_T);
  }

  /** One rAF tick. The clock, the wake and the press ring all advance by the capped frame time, so none runs while stopped. */
  #frame = (ts) => {
    this.#raf = requestAnimationFrame(this.#frame);
    const step = this.#gov.tick(ts);
    if (step.resize) this.#resize();
    this.#clock += step.dt;
    this.#wake?.update(step.dt);
    this.#tap.advance(step.dt);
    if (step.draw) this.#draw(this.#clock);
  };

  /** The loop runs only when it can be seen and is wanted; everything else costs 0 rAF. */
  #sync = () => {
    if (this.#disposed) return;
    const reduced = this.#mq.matches;
    const run = this.#glOK && !this.#paused && !reduced && this.#visible && !document.hidden;
    if (run && !this.#raf) {
      this.#gov.restart();
      this.#raf = requestAnimationFrame(this.#frame);
    } else if (!run && this.#raf) {
      cancelAnimationFrame(this.#raf);
      this.#raf = 0;
      this.#wake?.reset(); // nothing may be left to pop when the loop resumes
      this.#tap.clear();
    }
    if (this.#glOK && reduced) this.#still();
    this.#setMotion(this.#glOK && !reduced);
  };

  /** Build the renderer (this waits for the shader to finish compiling). False if there is none to be had. */
  async #boot() {
    const renderer = await createRenderer(this.#canvas, { signal: this.#abort.signal });
    if (this.#disposed) {
      renderer?.dispose();
      return false;
    }
    if (!renderer) return false;
    this.#renderer = renderer;
    this.#wake = renderer.trailN ? createWake(renderer.trailN) : null;
    this.#trail = new Float32Array(renderer.trailN * 4);
    this.#glOK = true;
    this.#resize();
    return true;
  }

  #lost = () => {
    this.#glOK = false;
    this.#setStatus('off'); // back to the SVG fallback
    this.#sync();
  };

  #restored = async () => {
    // every GL object died with the context: start from a fresh renderer on the same canvas
    if (this.#disposed || !(await this.#boot())) return;
    this.#draw(this.#mq.matches ? STILL_T : this.#clock);
    this.#sync();
  };

  #onResize = () => {
    if (!this.#glOK) return;
    this.#resize();
    if (!this.#raf) this.#draw(this.#mq.matches ? STILL_T : this.#clock);
  };

  /** Create the canvas and renderer, then start watching. The SVG fallback stays until the first frame draws. */
  async init() {
    if (this.#disposed) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    this.#canvas = canvas;
    this.#band.appendChild(canvas);
    this.#cleanups.push(() => canvas.remove());
    if (!(await this.#boot())) {
      canvas.remove(); // an opaque, never-drawn canvas would cover the SVG fallback
      this.#setStatus('off');
      return;
    }
    this.#cleanups.push(() => this.#renderer?.dispose());
    this.#cleanups.push(
      watchContext(canvas, { onLost: this.#lost, onRestored: this.#restored }),
      wirePointer(canvas, { running: () => this.#raf !== 0, wake: () => this.#wake, tap: this.#tap }),
      watchBand(this.#band, { onResize: this.#onResize, onVisible: (v) => { this.#visible = v; this.#sync(); } }),
      onMediaChange(this.#mq, this.#sync),
    );
    document.addEventListener('visibilitychange', this.#sync);
    this.#cleanups.push(() => document.removeEventListener('visibilitychange', this.#sync));

    if (this.#mq.matches) this.#still();
    else this.#draw(this.#clock);
    this.#sync();
  }

  togglePause() {
    if (this.#disposed) return;
    this.#paused = !this.#paused;
    this.#cb.onPaused(this.#paused);
    this.#sync();
    if (this.#paused) this.#draw(this.#clock); // sync cleared the wake, so this is the calm frame
  }

  /** Cancel the rAF and any shader wait, disconnect every observer, remove every listener, delete the GL objects, lose the context, remove the canvas. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#abort.abort();
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    while (this.#cleanups.length) {
      try { this.#cleanups.pop()(); } catch { /* keep tearing down */ }
    }
  }
}

/**
 * @param {HTMLElement} band the <section class="band"> the canvas is appended to
 * @param {{ onStatus(s: 'idle' | 'on' | 'off'): void, onMotion(m: boolean): void, onPaused(p: boolean): void }} callbacks
 */
export function createBandEngine(band, callbacks) {
  return new BandEngine(band, callbacks);
}

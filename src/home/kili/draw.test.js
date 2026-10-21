import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createKiliBand } from './draw.js';
import { routeJson, terrainJson } from './testData.js';
import { LIFE_END, totalDraw } from './timeline.js';

// A browser-shaped stand-in: just enough window, document, canvas and observers to run the
// loop in node, with a rAF queue the test steps by hand.

const FRAME = 1000 / 60;
const terrainData = terrainJson();
const routeData = routeJson();

class FakePath2D {
  moveTo() {}
  lineTo() {}
  arc() {}
  closePath() {}
}

function fakeContext() {
  const calls = {};
  const state = {};
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === 'calls') return calls;
      if (key in target) return target[key];
      return (...args) => {
        calls[key] = (calls[key] ?? 0) + 1;
        return key === 'createLinearGradient' ? { addColorStop() {} } : args[0];
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return ctx;
}

function fakeStyle() {
  return { setProperty(name, value) { this[name] = value; } };
}

function fakeElement(extra = {}) {
  const classes = new Set();
  return {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    style: fakeStyle(),
    dataset: {},
    offsetWidth: 90,
    removeAttribute(name) { if (name === 'style') this.style = fakeStyle(); },
    ...extra,
  };
}

/** Everything the controller touches, plus handles for the test to drive it. */
function setup({ width = 1440, height = 360, reduced = false, hidden = false, labels = false, dpr = 1 } = {}) {
  const ctx = fakeContext();
  const canvas = { width: 0, height: 0, getContext: (kind) => (kind === '2d' ? ctx : null) };
  const els = labels
    ? {
      peak: fakeElement(), 'peak-text': fakeElement(), mawenzi: fakeElement(), key: fakeElement(), glow: fakeElement(),
      machame: fakeElement({ dataset: { wp: 'Machame Gate' } }), barafu: fakeElement({ dataset: { wp: 'Barafu Camp' } }),
    }
    : {};
  const band = {
    clientWidth: width,
    clientHeight: height,
    querySelector: (sel) => (sel === 'canvas' ? canvas : els[(sel.match(/data-kili="([^"]+)"/) ?? [])[1]] ?? null),
    querySelectorAll: () => (labels ? [els.machame, els.barafu] : []),
  };

  const queue = new Map();
  let nextId = 1;
  let now = performance.now();
  const env = {
    ctx, canvas, band, els, queue, io: null, ro: null, motionListeners: new Set(), docListeners: new Map(),
    winListeners: new Map(), timers: new Map(),
    reduced, hidden,
    step(frames = 1) {
      for (let n = 0; n < frames; n += 1) {
        now += FRAME;
        const due = [...queue.values()];
        queue.clear();
        due.forEach((cb) => cb(now));
      }
    },
    /** Run frames until the queue empties or `seconds` of animation have passed. */
    run(seconds) {
      for (let t = 0; t < seconds * 60 && queue.size; t += 1) env.step();
    },
    see(ratio) { env.io.cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]); },
    /** The page scrolls once. */
    scroll() { env.winListeners.get('scroll')?.(); },
    /** Time passes with no more scrolling: every pending timer fires. */
    quiet() { const due = [...env.timers.values()]; env.timers.clear(); due.forEach((fn) => fn()); },
    setReduced(value) {
      env.reduced = value;
      env.motionListeners.forEach((fn) => fn());
    },
  };
  const mq = {
    get matches() { return env.reduced; },
    addEventListener: (type, fn) => env.motionListeners.add(fn),
    removeEventListener: (type, fn) => env.motionListeners.delete(fn),
  };
  env.win = {
    devicePixelRatio: dpr,
    document: {
      get hidden() { return env.hidden; },
      addEventListener: (type, fn) => env.docListeners.set(type, fn),
      removeEventListener: (type) => env.docListeners.delete(type),
    },
    matchMedia: () => mq,
    addEventListener: (type, fn) => env.winListeners.set(type, fn),
    removeEventListener: (type) => env.winListeners.delete(type),
    setTimeout: (fn) => { const id = nextId++; env.timers.set(id, fn); return id; },
    clearTimeout: (id) => { env.timers.delete(id); },
    requestAnimationFrame: (cb) => { queue.set(nextId, cb); return nextId++; },
    cancelAnimationFrame: (id) => { queue.delete(id); },
    IntersectionObserver: class {
      constructor(cb) { this.cb = cb; env.io = this; }
      observe() { this.observing = true; }
      disconnect() { this.observing = false; }
    },
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; env.ro = this; }
      observe() { this.observing = true; }
      disconnect() { this.observing = false; }
    },
  };
  return env;
}

function start(options = {}, callbacks = {}) {
  const env = setup(options);
  const ending = createKiliBand({ band: env.band, terrainData, routeData, win: env.win, ...callbacks });
  return { env, ending };
}

beforeAll(() => { globalThis.Path2D = FakePath2D; });
afterAll(() => { delete globalThis.Path2D; });

describe('scrolling', () => {
  it('holds the drawing while the page scrolls and picks up where it was once the scrolling stops', () => {
    const { env, ending } = start();
    env.see(0.5);
    env.run(0.4);
    const before = ending.state().drawT;
    env.scroll();
    env.step(3);
    expect(env.queue.size).toBe(0); // no frames while scrolling
    expect(ending.state().drawT).toBe(before);
    env.quiet();
    expect(env.queue.size).toBe(1);
    env.step(2);
    expect(ending.state().drawT).toBeGreaterThan(before);
  });

  it('holds the light while the page scrolls, and runs it again once the scrolling stops', () => {
    const { env } = start({ labels: true });
    env.see(0.5);
    env.run(30);
    expect(env.els.glow.dataset.glow).toBe('run');
    env.scroll();
    expect(env.els.glow.dataset.glow).toBe('hold');
    env.quiet();
    expect(env.els.glow.dataset.glow).toBe('run');
  });

  it('waits for the scrolling to stop before it starts drawing in', () => {
    const { env, ending } = start();
    env.scroll();
    env.see(0.5);
    env.step(3);
    expect(ending.state().drawT).toBeLessThanOrEqual(0);
    env.quiet();
    env.step(3);
    expect(ending.state().drawT).toBeGreaterThan(0);
  });

  it('stops listening for scrolls when it is disposed', () => {
    const { env, ending } = start();
    expect(env.winListeners.has('scroll')).toBe(true);
    env.scroll();
    ending.dispose();
    expect(env.winListeners.has('scroll')).toBe(false);
    expect(env.timers.size).toBe(0);
  });
});

describe('starting', () => {
  it('needs a 2d canvas and a terrain that adds up', () => {
    const env = setup();
    env.canvas.getContext = () => null;
    expect(() => createKiliBand({ band: env.band, terrainData, routeData, win: env.win })).toThrow('no 2d canvas');
    expect(() => createKiliBand({ band: setup().band, terrainData: { grid: [3, 3] }, routeData, win: setup().win })).toThrow();
  });

  it('sizes the canvas to the band: draft density while it moves, then the screen density capped at 2', () => {
    const { env } = start({ width: 1000, height: 330, dpr: 3 });
    expect([env.canvas.width, env.canvas.height]).toEqual([1000, 330]);
    env.see(0.5);
    env.run(totalDraw(64) + LIFE_END - 0.5);
    expect(env.canvas.width).toBe(1000); // still moving: still a draft
    env.run(1);
    expect([env.canvas.width, env.canvas.height]).toEqual([2000, 660]); // settled: crisp, and not 3x
    const finished = start({ width: 1000, height: 330, dpr: 3, reduced: true });
    expect(finished.env.canvas.width).toBe(2000);
    const low = start({ width: 1000, height: 330, dpr: 1 });
    expect([low.env.canvas.width, low.env.canvas.height]).toEqual([1000, 330]);
  });

  it('uses 64 lines on a desktop band and 48 on a phone band', () => {
    expect(start({ width: 1440 }).ending.state().lines).toBe(64);
    expect(start({ width: 375, height: 290 }).ending.state().lines).toBe(48);
  });

  it('treats the band as always in view when there is no IntersectionObserver', () => {
    const env = setup();
    env.win.IntersectionObserver = undefined;
    const ending = createKiliBand({ band: env.band, terrainData, routeData, win: env.win });
    expect(ending.state()).toMatchObject({ onScreen: true, started: true, raf: true });
  });

  it('queues no frame until the band is on screen', () => {
    const { env, ending } = start();
    expect(env.queue.size).toBe(0);
    expect(ending.state()).toMatchObject({ raf: false, onScreen: false, started: false });
    expect(env.io.observing).toBe(true);
  });
});

describe('the animation', () => {
  let env;
  let ending;
  beforeEach(() => ({ env, ending } = start()));

  it('waits for a good part of the band before it draws in', () => {
    env.see(0.1);
    expect(ending.state()).toMatchObject({ onScreen: true, started: false, raf: false });
    env.see(0.5);
    expect(ending.state()).toMatchObject({ started: true, raf: true });
    expect(env.queue.size).toBe(1);
  });

  it('draws the lines in, then runs the colour and the light until the tab or band goes away', () => {
    env.see(0.5);
    env.run(totalDraw(64) + 0.2);
    expect(ending.state().done).toBe(true);
    const before = ending.state().lifeT;
    env.run(1);
    expect(ending.state().lifeT).toBeGreaterThan(before);
    expect(env.queue.size).toBe(1);
  });

  it('redraws about 30 times a second once the lines are down, not 60', () => {
    env.see(0.5);
    env.run(totalDraw(64) + 0.2);
    const painted = () => env.ctx.calls.clearRect;
    const start60 = painted();
    env.run(2);
    const perSecond = (painted() - start60) / 2;
    expect(perSecond).toBeGreaterThan(25);
    expect(perSecond).toBeLessThan(35);
  });

  it('logs what each redraw cost', () => {
    expect(ending.stats()).toBeNull();
    env.see(0.5);
    env.run(0.5);
    expect(ending.stats()).toMatchObject({ n: expect.any(Number) });
    expect(ending.stats().median).toBeGreaterThanOrEqual(0);
  });

  it('stops asking for frames the moment the band leaves the screen, and starts again on return', () => {
    env.see(0.5);
    env.run(0.3);
    env.see(0);
    env.step();
    expect(env.queue.size).toBe(0);
    expect(ending.state().raf).toBe(false);
    env.see(0.4);
    expect(env.queue.size).toBe(1);
  });

  it('stops while the tab is hidden, and starts again when it is shown', () => {
    env.see(0.5);
    env.run(0.3);
    env.hidden = true;
    env.docListeners.get('visibilitychange')();
    env.step();
    expect(env.queue.size).toBe(0);
    env.hidden = false;
    env.docListeners.get('visibilitychange')();
    expect(env.queue.size).toBe(1);
  });

  it('never queues a frame while the tab is hidden, even if the band comes into view', () => {
    env.hidden = true;
    env.see(0.8);
    expect(env.queue.size).toBe(0);
  });
});

describe('pausing', () => {
  it('cancels the queued frame at once and shows the finished frame when paused mid draw-in', () => {
    const paused = vi.fn();
    const { env, ending } = start({}, { onPaused: paused });
    env.see(0.5);
    env.run(0.5);
    expect(ending.state().done).toBe(false);
    expect(ending.togglePause()).toBe(true);
    expect(env.queue.size).toBe(0);
    expect(ending.state()).toMatchObject({ raf: false, paused: true, done: true, still: true });
    expect(paused).toHaveBeenLastCalledWith(true);
    env.step(5);
    expect(env.queue.size).toBe(0);
  });

  it('freezes mid-life where it is, with no frame queued', () => {
    const { env, ending } = start();
    env.see(0.5);
    env.run(totalDraw(64) + 1);
    ending.setPaused(true);
    expect(env.queue.size).toBe(0);
    const lifeT = ending.state().lifeT;
    env.step(30);
    expect(ending.state().lifeT).toBe(lifeT);
  });

  it('lets the light start when played again after a pause mid draw-in, with no frame queued', () => {
    const { env, ending } = start({ labels: true });
    env.see(0.5);
    env.run(0.5);
    ending.togglePause();
    expect(env.els.glow.dataset.glow).toBeUndefined();
    expect(ending.togglePause()).toBe(false);
    expect(env.queue.size).toBe(0);
    expect(ending.state()).toMatchObject({ still: true, paused: false, glow: true });
    expect(env.els.glow.dataset.glow).toBe('run');
  });

  it('shows the finished frame, not an empty band, when paused before it ever came into view', () => {
    const { env, ending } = start();
    ending.setPaused(true);
    env.see(0.9);
    expect(env.queue.size).toBe(0);
    expect(ending.state()).toMatchObject({ done: true, still: true });
  });

  it('says so each time it changes, and only then', () => {
    const paused = vi.fn();
    const { ending } = start({}, { onPaused: paused });
    ending.setPaused(false);
    expect(paused).not.toHaveBeenCalled();
    ending.setPaused(true);
    ending.setPaused(true);
    expect(paused).toHaveBeenCalledTimes(1);
  });
});

describe('reduced motion', () => {
  it('shows the finished coloured frame at once and never queues a frame', () => {
    const onMotion = vi.fn();
    const { env, ending } = start({ reduced: true }, { onMotion });
    expect(onMotion).toHaveBeenCalledWith(false);
    expect(ending.state()).toMatchObject({ done: true, still: true, started: true, raf: false });
    expect(env.ctx.calls.stroke).toBeGreaterThan(1000);
    env.see(1);
    env.step(10);
    expect(env.queue.size).toBe(0);
  });

  it('says there is motion when it is not asked for', () => {
    const onMotion = vi.fn();
    start({}, { onMotion });
    expect(onMotion).toHaveBeenCalledWith(true);
  });

  it('follows the preference live, in both directions', () => {
    const onMotion = vi.fn();
    const { env, ending } = start({}, { onMotion });
    env.see(0.5);
    env.run(0.3);
    env.setReduced(true);
    expect(onMotion).toHaveBeenLastCalledWith(false);
    expect(ending.state()).toMatchObject({ done: true, still: true });
    env.step(3);
    expect(env.queue.size).toBe(0);
    env.setReduced(false);
    expect(onMotion).toHaveBeenLastCalledWith(true);
    expect(env.queue.size).toBe(0); // the finished frame is up: nothing left to draw
    expect(ending.state()).toMatchObject({ still: true, glow: true });
  });
});

describe('after life', () => {
  it('paints one last frame when the colour and route are done, then asks for no more frames', () => {
    const { env, ending } = start();
    env.see(0.5);
    env.run(totalDraw(64) + LIFE_END + 0.5);
    expect(env.queue.size).toBe(0);
    expect(ending.state()).toMatchObject({ raf: false, done: true, still: true, glow: true });
    const painted = env.ctx.calls.clearRect;
    env.step(120);
    expect(env.ctx.calls.clearRect).toBe(painted);
    expect(env.queue.size).toBe(0);
  });

  it('has no work left, so an idle band in view costs no frames at all', () => {
    const { env, ending } = start();
    env.see(0.5);
    env.run(totalDraw(64) + LIFE_END + 0.5);
    env.see(0.2);
    env.see(0.9);
    env.docListeners.get('visibilitychange')();
    expect(env.queue.size).toBe(0);
    expect(ending.state().raf).toBe(false);
  });

  it('settles on the finished frame: the whole route and every label', () => {
    const { env } = start({ labels: true });
    env.see(0.5);
    env.run(totalDraw(64) + LIFE_END + 0.5);
    for (const name of ['peak', 'mawenzi', 'key', 'machame', 'barafu']) expect(env.els[name].classList.contains('on')).toBe(true);
  });
});

describe('the light', () => {
  const settled = () => {
    const made = start({ labels: true });
    made.env.see(0.5);
    made.env.run(totalDraw(64) + LIFE_END + 0.5);
    return made;
  };

  it('is placed from the layout and does not run before the canvas has settled', () => {
    const { env } = start({ labels: true });
    expect(env.els.glow.style['--g0']).toMatch(/^translate(.+) scale(.+)$/);
    expect(env.els.glow.style['--g7']).toMatch(/^translate/);
    env.see(0.5);
    env.run(1);
    expect(env.els.glow.dataset.glow).toBeUndefined();
  });

  it('starts running when life ends', () => {
    expect(settled().env.els.glow.dataset.glow).toBe('run');
  });

  it('holds while the band is off screen, and runs again on return', () => {
    const { env } = settled();
    env.see(0);
    expect(env.els.glow.dataset.glow).toBe('hold');
    env.see(0.5);
    expect(env.els.glow.dataset.glow).toBe('run');
  });

  it('holds while the tab is hidden, and runs again when it is shown', () => {
    const { env } = settled();
    env.hidden = true;
    env.docListeners.get('visibilitychange')();
    expect(env.els.glow.dataset.glow).toBe('hold');
    env.hidden = false;
    env.docListeners.get('visibilitychange')();
    expect(env.els.glow.dataset.glow).toBe('run');
  });

  it('holds while motion is paused, and runs again when played', () => {
    const { env, ending } = settled();
    ending.togglePause();
    expect(env.els.glow.dataset.glow).toBe('hold');
    ending.togglePause();
    expect(env.els.glow.dataset.glow).toBe('run');
  });

  it('never starts under reduced motion, and starts if the preference is lifted', () => {
    const { env } = start({ labels: true, reduced: true });
    env.see(1);
    expect(env.els.glow.dataset.glow).toBeUndefined();
    env.setReduced(false);
    expect(env.els.glow.dataset.glow).toBe('run');
    env.setReduced(true);
    expect(env.els.glow.dataset.glow).toBeUndefined();
  });

  it('is cleared when the ending is disposed', () => {
    const { env, ending } = settled();
    ending.dispose();
    expect(env.els.glow.dataset.glow).toBeUndefined();
    expect(env.els.glow.style['--g0']).toBeUndefined();
  });
});

describe('the labels', () => {
  it('are placed on the drawing and fade in as the route reaches them', () => {
    const { env, ending } = start({ labels: true });
    const { peak, mawenzi, key, machame, barafu } = env.els;
    for (const el of [peak, mawenzi, machame, barafu]) {
      expect(Number.parseFloat(el.style.left)).toBeGreaterThan(0);
      expect(Number.parseFloat(el.style.top)).toBeGreaterThan(0);
      expect(el.classList.contains('on')).toBe(false);
    }
    expect(key.style.right).toBe('130px');
    env.see(0.5);
    env.run(totalDraw(64) + 0.1);
    expect(ending.state().done).toBe(true);
    expect(key.classList.contains('on')).toBe(true);
    expect(peak.classList.contains('on')).toBe(false);
    env.run(2);
    expect(machame.classList.contains('on')).toBe(true);
    env.run(3);
    for (const el of [peak, mawenzi, key, machame, barafu]) expect(el.classList.contains('on')).toBe(true);
  });

  it('all show on the finished frame', () => {
    const { env } = start({ labels: true, reduced: true });
    for (const name of ['peak', 'mawenzi', 'key', 'machame', 'barafu']) expect(env.els[name].classList.contains('on')).toBe(true);
  });

  it('keep the peak label inside a narrow band', () => {
    const { env } = start({ labels: true, width: 375, height: 290 });
    expect(env.els['peak-text'].style.transform).toMatch(/^translateX\(-?[\d.]+px\)$/);
  });
});

describe('resizing and disposing', () => {
  it('lays out again when the band changes size, and not when it does not', () => {
    const { env } = start({ width: 1440 });
    env.ro.cb();
    expect(env.canvas.width).toBe(1440);
    env.band.clientWidth = 700;
    env.ro.cb();
    expect(env.canvas.width).toBe(700);
  });

  it('switches to the phone layout when the band gets narrow', () => {
    const { env, ending } = start({ width: 1440 });
    env.band.clientWidth = 375;
    env.ro.cb();
    expect(ending.state().lines).toBe(48);
  });

  it('lets go of everything', () => {
    const { env, ending } = start({ labels: true });
    env.see(0.5);
    env.run(totalDraw(64) + 1);
    expect(env.queue.size).toBe(1);
    expect(env.win.__kili).toBe(ending);
    ending.dispose();
    expect(env.queue.size).toBe(0);
    expect(env.io.observing).toBe(false);
    expect(env.ro.observing).toBe(false);
    expect(env.docListeners.size).toBe(0);
    expect(env.motionListeners.size).toBe(0);
    expect(env.win.__kili).toBeUndefined();
    for (const name of ['peak', 'mawenzi', 'key', 'machame', 'barafu']) {
      expect(env.els[name].classList.contains('on')).toBe(false);
      expect(Object.keys(env.els[name].style)).toEqual(['setProperty']);
    }
    env.see(0.9);
    env.step(5);
    expect(env.queue.size).toBe(0);
    ending.dispose();
  });
});

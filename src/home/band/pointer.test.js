import { describe, expect, it } from 'vitest';
import { bindPointer, wirePointer } from './pointer.js';

/** A canvas stand-in: a rect, and listeners that tests can fire. */
function fakeCanvas(rect = { left: 100, top: 50, width: 1000, height: 320 }) {
  const listeners = new Map();
  return {
    listeners,
    getBoundingClientRect: () => rect,
    addEventListener: (name, fn, opts) => listeners.set(name, { fn, opts }),
    removeEventListener: (name, fn) => { if (listeners.get(name)?.fn === fn) listeners.delete(name); },
    fire: (name, e) => listeners.get(name)?.fn({ isPrimary: true, buttons: 0, clientX: 0, clientY: 0, ...e }),
  };
}

function fakeWater() {
  const calls = [];
  return {
    calls,
    point: (...a) => calls.push(['point', ...a]),
    press: (...a) => calls.push(['press', ...a]),
    leave: () => calls.push(['leave']),
  };
}

describe('bindPointer', () => {
  it('reports positions in band-height units: x from the centre line, y from the top', () => {
    const canvas = fakeCanvas();
    const seen = [];
    bindPointer(canvas, { onPoint: (...a) => seen.push(a), onPress: () => {}, onLeave: () => {} });
    canvas.fire('pointermove', { clientX: 100 + 500, clientY: 50 + 160 }); // the middle of the band
    canvas.fire('pointermove', { clientX: 100 + 1000, clientY: 50 + 320, buttons: 1 }); // its bottom right corner
    expect(seen[0]).toEqual([0, 0.5, false]);
    expect(seen[1][0]).toBeCloseTo(500 / 320, 10);
    expect(seen[1][1]).toBe(1);
    expect(seen[1][2]).toBe(true);
  });

  it('a press is also a pointer position with the button down', () => {
    const canvas = fakeCanvas();
    const log = [];
    bindPointer(canvas, { onPoint: (...a) => log.push(['point', ...a]), onPress: (...a) => log.push(['press', ...a]), onLeave: () => {} });
    canvas.fire('pointerdown', { clientX: 600, clientY: 210 });
    expect(log).toEqual([['point', 0, 0.5, true], ['press', 0, 0.5]]);
  });

  it('ignores a second finger, and leaving or a cancelled touch ends the stroke', () => {
    const canvas = fakeCanvas();
    const log = [];
    bindPointer(canvas, { onPoint: () => log.push('point'), onPress: () => log.push('press'), onLeave: () => log.push('leave') });
    canvas.fire('pointermove', { isPrimary: false });
    canvas.fire('pointerdown', { isPrimary: false });
    canvas.fire('pointerleave', { isPrimary: false });
    expect(log).toEqual([]);
    canvas.fire('pointerleave');
    canvas.fire('pointercancel');
    expect(log).toEqual(['leave', 'leave']);
  });

  it('listens passively (it must never be able to delay scrolling) and unbinds everything', () => {
    const canvas = fakeCanvas();
    const unbind = bindPointer(canvas, { onPoint: () => {}, onPress: () => {}, onLeave: () => {} });
    expect([...canvas.listeners.keys()].sort()).toEqual(['pointercancel', 'pointerdown', 'pointerleave', 'pointermove']);
    for (const { opts } of canvas.listeners.values()) expect(opts).toEqual({ passive: true });
    unbind();
    expect(canvas.listeners.size).toBe(0);
  });
});

describe('wirePointer', () => {
  it('feeds the water while the loop runs, and ignores input while it does not', () => {
    const canvas = fakeCanvas();
    const water = fakeWater();
    let running = false;
    wirePointer(canvas, { running: () => running, water: () => water });
    canvas.fire('pointermove', { clientX: 600, clientY: 210 });
    canvas.fire('pointerdown', { clientX: 600, clientY: 210 });
    expect(water.calls).toEqual([]);
    running = true;
    canvas.fire('pointermove', { clientX: 600, clientY: 210 });
    canvas.fire('pointerdown', { clientX: 600, clientY: 210 });
    expect(water.calls).toEqual([['point', 0, 0.5, false], ['point', 0, 0.5, true], ['press', 0, 0.5]]);
  });

  it('always passes a leave through (a stroke must end even if the loop just stopped)', () => {
    const canvas = fakeCanvas();
    const water = fakeWater();
    wirePointer(canvas, { running: () => false, water: () => water });
    canvas.fire('pointerleave');
    expect(water.calls).toEqual([['leave']]);
  });

  it('asks for the water every time, so a restored context\'s new simulation is used', () => {
    const canvas = fakeCanvas();
    let water = fakeWater();
    const first = water;
    wirePointer(canvas, { running: () => true, water: () => water });
    water = fakeWater();
    canvas.fire('pointermove', { clientX: 600, clientY: 210 });
    expect(first.calls).toEqual([]);
    expect(water.calls).toHaveLength(1);
  });

  it('copes with no water at all (before the first boot, or after a lost context)', () => {
    const canvas = fakeCanvas();
    wirePointer(canvas, { running: () => true, water: () => null });
    expect(() => {
      canvas.fire('pointermove', { clientX: 600, clientY: 210 });
      canvas.fire('pointerdown', { clientX: 600, clientY: 210 });
      canvas.fire('pointerleave');
    }).not.toThrow();
  });
});

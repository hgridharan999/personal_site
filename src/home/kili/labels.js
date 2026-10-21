import { labelAnchors } from './route.js';

// The HTML labels over the canvas: Uhuru Peak, Mawenzi, the two camp names and the legend.
// KiliEnding renders them (so the words come from content.js); this file finds them by their
// data attributes, puts them on the drawing and fades them in as the route reaches them. It
// only touches `left`, `top`, `right`, one transform and the `on` class, and `reset` undoes all
// of that, so a remount starts from the markup as rendered.

const place = (el, x, y) => {
  if (!el) return;
  el.style.left = `${x.toFixed(1)}px`;
  el.style.top = `${y.toFixed(1)}px`;
};

export function createLabels(band) {
  const one = (name) => band.querySelector(`[data-kili="${name}"]`);
  const peak = one('peak');
  const peakText = one('peak-text');
  const mawenzi = one('mawenzi');
  const key = one('key');
  const waypoints = new Map([...band.querySelectorAll('[data-kili="wp"]')].map((el) => [el.dataset.wp, el]));
  const canvas = band.querySelector('canvas');
  const shown = new Set();

  const show = (el) => {
    if (!el || shown.has(el)) return;
    el.classList.add('on');
    shown.add(el);
  };

  return {
    canvas,

    /** Put every label where the current layout draws its place. */
    place(layout, built, terrain) {
      const at = labelAnchors(layout, built, terrain);
      place(peak, at.peak.x, at.peak.y);
      place(mawenzi, at.mawenzi.x, at.mawenzi.y);
      if (peakText) {
        // keep the peak's label inside the band when the summit sits near an edge
        const edge = layout.phone ? 10 : 24;
        const half = peakText.offsetWidth / 2;
        const shift = Math.max(0, edge - (at.peak.x - half)) + Math.min(0, (layout.width - edge) - (at.peak.x + half));
        peakText.style.transform = `translateX(${shift.toFixed(1)}px)`;
      }
      for (const w of built.waypoints) place(waypoints.get(w.name), w.x, w.y);
      if (key) key.style.right = `${Math.max(layout.phone ? 16 : 32, layout.sx0).toFixed(0)}px`;
    },

    /** Fade in what the drawing has reached: the legend once colour starts, the rest as the route arrives. */
    reveal(lifeT, routeLen, built) {
      if (lifeT >= 0) show(key);
      if (routeLen >= built.ascentLength - 0.5) {
        show(peak);
        show(mawenzi);
      }
      for (const w of built.waypoints) if (routeLen >= w.at - 0.5) show(waypoints.get(w.name));
    },

    reset() {
      for (const el of shown) el.classList.remove('on');
      shown.clear();
      for (const el of [peak, mawenzi, key, peakText, ...waypoints.values()]) el?.removeAttribute('style');
    },
  };
}

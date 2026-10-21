// What the browser tells the ending about: whether the band is on screen, whether its size
// changed, whether the tab came back, and whether motion is still welcome. Each signal goes to
// one callback; the returned function stops listening to all of them.

/**
 * @param {object} o
 * @param {HTMLElement} o.band the element to observe
 * @param {Window} o.win
 * @param {MediaQueryList} o.mq prefers-reduced-motion
 * @param {number[]} o.thresholds intersection ratios to be told about
 * @param {(visible: boolean, ratio: number) => void} o.onView the band came into or left the viewport
 * @param {() => void} o.onResize the band's box changed
 * @param {() => void} o.onWake the tab's visibility changed
 * @param {() => void} o.onPreference the reduced-motion setting changed
 * @param {(scrolling: boolean) => void} [o.onScroll] the page started scrolling, or has been still
 *   for QUIET_MS since the last scroll
 */
/** How long the page must be still after a scroll before the ending moves again, in ms. */
export const QUIET_MS = 150;

export function watchBand({ band, win, mq, thresholds, onView, onResize, onWake, onPreference, onScroll }) {
  const io = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      onView(e.isIntersecting, e.intersectionRatio);
    }, { threshold: thresholds })
    : null;
  const ro = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(onResize) : null;

  // Scrolling: one call when it starts, one once it has been still for QUIET_MS. Passive, so the
  // listener can never hold up the scroll itself.
  let scrolling = false;
  let quietTimer = 0;
  const settle = () => { quietTimer = 0; scrolling = false; onScroll?.(false); };
  const onScrollEvent = () => {
    if (!scrolling) { scrolling = true; onScroll?.(true); }
    if (quietTimer) win.clearTimeout(quietTimer);
    quietTimer = win.setTimeout(settle, QUIET_MS);
  };
  const listens = onScroll && typeof win.addEventListener === 'function';
  if (listens) win.addEventListener('scroll', onScrollEvent, { passive: true });

  if (io) io.observe(band);
  else onView(true, 1); // no observer: treat the band as always in view
  ro?.observe(band);
  win.document.addEventListener('visibilitychange', onWake);
  if (mq.addEventListener) mq.addEventListener('change', onPreference);
  else mq.addListener(onPreference);

  return () => {
    if (listens) win.removeEventListener('scroll', onScrollEvent);
    if (quietTimer) win.clearTimeout(quietTimer);
    io?.disconnect();
    ro?.disconnect();
    win.document.removeEventListener('visibilitychange', onWake);
    if (mq.removeEventListener) mq.removeEventListener('change', onPreference);
    else mq.removeListener(onPreference);
  };
}

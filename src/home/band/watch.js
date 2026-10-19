/*
 * Small subscriptions the engine needs, each returning its own unsubscribe so teardown is one list.
 */

/** matchMedia change listener that also works on old Safari. */
export function onMediaChange(mq, fn) {
  if (mq.addEventListener) {
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }
  mq.addListener(fn);
  return () => mq.removeListener(fn);
}

/**
 * Size and on-screen state of the band. Without IntersectionObserver it reports "visible" once and
 * leaves it there, which is the safe side (the loop just keeps running).
 * @param {{ onResize(): void, onVisible(visible: boolean): void }} cb
 */
export function watchBand(band, { onResize, onVisible }) {
  const stops = [];
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(onResize);
    ro.observe(band);
    stops.push(() => ro.disconnect());
  }
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => onVisible(entries[entries.length - 1].isIntersecting), { threshold: 0 });
    io.observe(band);
    stops.push(() => io.disconnect());
  } else {
    onVisible(true);
  }
  return () => stops.forEach((stop) => stop());
}

/**
 * WebGL context loss and restore. The default action on loss must be prevented, or the browser
 * never restores the context.
 * @param {{ onLost(): void, onRestored(): void }} cb
 */
export function watchContext(canvas, { onLost, onRestored }) {
  const lost = (e) => {
    e.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}

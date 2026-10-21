import { useCallback, useEffect, useRef, useState } from 'react';

const LAZY_MARGIN = '0px 0px 100% 0px'; // wake up one screen before the band is reached
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
const TERRAIN_URL = `${DATA_BASE}kilimanjaro.json`;
const ROUTE_URL = `${DATA_BASE}kili-route.json`;

/** Call `fn` once, when the band is within a screen of the viewport (at once without IntersectionObserver). Returns a cancel. */
function whenNear(band, fn) {
  if (typeof IntersectionObserver !== 'function') {
    fn();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fn();
    },
    { rootMargin: LAZY_MARGIN },
  );
  io.observe(band);
  return () => io.disconnect();
}

async function getJSON(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

/**
 * Drives the ending's canvas. ONE effect owns the whole lifecycle: it waits until the band is a
 * screen away, then loads the drawing code and the two data files on demand, starts it, and its
 * cleanup disposes all of it (canvas, rAF, observers, listeners, fetches), so StrictMode's extra
 * mount/unmount cycle is harmless. The drawing code is a separate chunk and the terrain is
 * fetched, never bundled, so a visitor who never scrolls down downloads neither.
 *
 * @param {{ current: HTMLElement | null }} bandRef the element holding the canvas and labels
 * @returns {{ motion: boolean, paused: boolean, failed: boolean, toggle: () => void }}
 *   motion: whether the pause toggle makes sense (the drawing runs and reduced motion is off)
 */
export function useKiliBand(bandRef) {
  const [motion, setMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const controllerRef = useRef(null);

  useEffect(() => {
    const band = bandRef.current;
    if (!band) return undefined;
    let disposed = false;
    const abort = new AbortController();
    // a late callback (a media query change, an observer) must never set state on an unmounted component
    const guarded = (set) => (value) => { if (!disposed) set(value); };
    setMotion(false);
    setPaused(false);
    setFailed(false);

    const load = async () => {
      const [{ createKiliBand }, terrainData, routeData] = await Promise.all([
        import('./draw.js'),
        getJSON(TERRAIN_URL, abort.signal),
        // no route is not fatal: the terrain still draws
        getJSON(ROUTE_URL, abort.signal).catch((error) => {
          if (!abort.signal.aborted) console.warn('kili: route unavailable', error);
          return null;
        }),
      ]);
      if (disposed) return;
      controllerRef.current = createKiliBand({ band, terrainData, routeData, onMotion: guarded(setMotion), onPaused: guarded(setPaused) });
    };
    // a failed chunk or data load collapses the band, so the page never shows an empty gap
    const cancelNear = whenNear(band, () => load().catch((error) => {
      if (abort.signal.aborted) return;
      console.warn('kili: ending unavailable', error);
      guarded(setFailed)(true);
    }));

    return () => {
      disposed = true;
      abort.abort();
      cancelNear();
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [bandRef]);

  const toggle = useCallback(() => controllerRef.current?.togglePause(), []);
  return { motion, paused, failed, toggle };
}

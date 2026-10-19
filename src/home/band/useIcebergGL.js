import { useCallback, useEffect, useRef, useState } from 'react';

const LAZY_MARGIN = '0px 0px 100% 0px'; // wake up one screen before the band is reached

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

/**
 * Drives the ending's WebGL canvas. ONE effect owns the whole lifecycle: it waits until the band is
 * a screen away, loads the engine (canvas, context, rAF, observers, listeners) on demand, and its
 * cleanup disposes all of it, so StrictMode's extra mount/unmount cycle is harmless. The canvas is
 * created in code, not rendered, for the same reason: every mount gets its own context. The engine
 * and the shader text are a separate chunk, so a visitor who never scrolls down never downloads them.
 *
 * @param {{ current: HTMLElement | null }} bandRef the <section> the canvas is appended to
 * @returns {{ status: 'idle' | 'on' | 'off', motion: boolean, paused: boolean, toggle: () => void }}
 *   status: 'on' once a frame has drawn (hides the SVG fallback); motion: whether the pause
 *   toggle makes sense (WebGL works and reduced motion is off)
 */
export function useIcebergGL(bandRef) {
  const [status, setStatus] = useState('idle');
  const [motion, setMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const engineRef = useRef(null);

  useEffect(() => {
    const band = bandRef.current;
    if (!band) return undefined;
    let disposed = false;
    // a late callback (a context event, an observer) must never set state on an unmounted component
    const guarded = (set) => (value) => { if (!disposed) set(value); };
    setStatus('idle');
    setMotion(false);
    setPaused(false);

    const load = async () => {
      const { createBandEngine } = await import('./engine.js');
      if (disposed) return;
      const engine = createBandEngine(band, {
        onStatus: guarded(setStatus),
        onMotion: guarded(setMotion),
        onPaused: guarded(setPaused),
      });
      engineRef.current = engine;
      await engine.init();
    };
    // a failed chunk load or init just leaves the SVG fallback in place
    const cancelNear = whenNear(band, () => load().catch((error) => console.warn('band: WebGL ending unavailable', error)));

    return () => {
      disposed = true;
      cancelNear();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [bandRef]);

  const toggle = useCallback(() => engineRef.current?.togglePause(), []);
  return { status, motion, paused, toggle };
}

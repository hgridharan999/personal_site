import { useEffect, useRef, useState } from 'react';

/**
 * Custom cursor: a bone ring that lerps toward the pointer and swells over
 * anything marked [data-hot]. Only rendered on fine-pointer, motion-OK devices —
 * otherwise it returns null and the native cursor is used (see ascent.css).
 */
export default function Cursor() {
  const dot = useRef(null);
  const [enabled] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (!enabled) return;
    const p = { x: innerWidth / 2, y: innerHeight / 2, cx: innerWidth / 2, cy: innerHeight / 2 };

    let raf = null;
    const loop = () => {
      p.cx += (p.x - p.cx) * 0.18;
      p.cy += (p.y - p.cy) * 0.18;
      if (dot.current) dot.current.style.transform = `translate(${p.cx}px, ${p.cy}px) translate(-50%, -50%)`;
      // stop looping once the ring has settled on the pointer — restart on move
      if (Math.abs(p.x - p.cx) > 0.1 || Math.abs(p.y - p.cy) > 0.1) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    };
    const kick = () => { if (raf === null && !document.hidden) raf = requestAnimationFrame(loop); };

    const onMove = (e) => { p.x = e.clientX; p.y = e.clientY; kick(); };
    const onOver = (e) => {
      const hot = e.target.closest && e.target.closest('[data-hot]');
      dot.current && dot.current.classList.toggle('is-hot', !!hot);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseover', onOver, { passive: true });
    kick();

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div ref={dot} className="asc-cursor" aria-hidden="true" />;
}

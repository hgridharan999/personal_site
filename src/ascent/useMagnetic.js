import { useEffect, useRef } from 'react';
import { gsap } from '../lib/gsap';

const canAnimate = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Magnetic pull — the element leans toward the cursor while hovered and springs
 * back on leave. A quiet, high-end interaction; no-ops on touch / reduced-motion.
 *
 * @param {number} strength  fraction of the offset to follow (0.2–0.4 feels good)
 * @param {number} childStrength  optional stronger pull for an inner [data-mag-child]
 */
export function useMagnetic(strength = 0.3, childStrength = 0.55) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return;

    const child = el.querySelector('[data-mag-child]');
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    const cxTo = child && gsap.quickTo(child, 'x', { duration: 0.5, ease: 'power3.out' });
    const cyTo = child && gsap.quickTo(child, 'y', { duration: 0.5, ease: 'power3.out' });

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      xTo(dx * strength);
      yTo(dy * strength);
      if (cxTo) { cxTo(dx * childStrength); cyTo(dy * childStrength); }
    };
    const onLeave = () => {
      xTo(0); yTo(0);
      if (cxTo) { cxTo(0); cyTo(0); }
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [strength, childStrength]);

  return ref;
}

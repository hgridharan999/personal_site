import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

const canAnimate = () =>
  typeof window !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Per-letter mask reveal driven by anime.js — each glyph rises out of an
 * overflow-hidden mask with a staggered, expo-ish ease. Falls back to a static
 * (already-visible) render when the user prefers reduced motion.
 */
export default function SplitReveal({ text, className = '', delay = 0, style, letterStyle }) {
  const root = useRef(null);

  useEffect(() => {
    if (!canAnimate() || !root.current) return;
    const letters = root.current.querySelectorAll('.sr-glyph');
    animate(letters, {
      translateY: ['115%', '0%'],
      opacity: [0, 1],
      duration: 1000,
      delay: stagger(26, { start: delay }),
      ease: 'outExpo',
    });
    // Fail-safe: setTimeout fires even if the RAF-driven animation is throttled
    // (background tab, blocked frame) — the name is never left invisible.
    const safe = setTimeout(() => {
      letters.forEach((g) => { g.style.opacity = '1'; g.style.transform = 'none'; });
    }, delay + 1600);
    return () => clearTimeout(safe);
  }, [delay]);

  const rest = !canAnimate(); // pre-position: hidden when we WILL animate, shown otherwise
  return (
    <span ref={root} className={className} style={{ display: 'inline-block', ...style }} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top' }}>
          <span
            className="sr-glyph"
            style={{
              display: 'inline-block', willChange: 'transform',
              transform: rest ? 'none' : 'translateY(115%)',
              opacity: rest ? 1 : 0,
              ...letterStyle,
            }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        </span>
      ))}
    </span>
  );
}

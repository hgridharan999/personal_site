import { useEffect, useRef } from 'react';
import { createTimer } from 'animejs';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/\\<>=+*';
const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const rndGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/**
 * Terminal-style decode: characters churn through random glyphs and resolve
 * left→right into the target text. Driven by an anime.js timer. The element's
 * real text is the initial (and fail-safe) content, so it is never left broken
 * if the animation is throttled or the user prefers reduced motion.
 */
export function scramble(el, text, { duration = 750, delay = 0 } = {}) {
  if (!el) return () => {};
  if (reduced()) { el.textContent = text; return () => {}; }

  const chars = [...text];
  const start = performance.now() + delay;

  const timer = createTimer({
    duration: delay + duration + 60,
    onUpdate: () => {
      const p = (performance.now() - start) / duration; // <0 during delay
      if (p >= 1) { el.textContent = text; return; }
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === ' ') { out += ' '; continue; }
        const threshold = (i / chars.length) * 0.7; // resolve progressively L→R
        out += p > threshold ? chars[i] : rndGlyph();
      }
      el.textContent = out;
    },
    onComplete: () => { el.textContent = text; },
  });

  // Fail-safe: fires on the wall clock even if RAF (and the timer) are paused.
  const safe = setTimeout(() => { el.textContent = text; }, delay + duration + 350);

  return () => { timer?.pause?.(); clearTimeout(safe); };
}

export default function ScrambleText({
  text, as: Tag = 'span', delay = 0, duration = 750,
  runOnMount = true, hover = false, className, style, ...rest
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!runOnMount) return;
    return scramble(ref.current, text, { delay, duration });
  }, [text, delay, duration, runOnMount]);

  const onMouseEnter = hover ? () => scramble(ref.current, text, { duration: 420 }) : undefined;

  return (
    <Tag ref={ref} className={className} style={style} onMouseEnter={onMouseEnter} aria-label={text} {...rest}>
      {text}
    </Tag>
  );
}

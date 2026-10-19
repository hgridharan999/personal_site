import { useEffect } from 'react';

// Longer than the 0.42s open animation. Removing the class afterwards also cancels any
// transition a paused timeline (a hidden tab, a headless capture) left unfinished.
const ANIM_MS = 700;

/**
 * Two jobs for the rows that open, both through one delegated click listener on the root.
 *
 * 1. Forward clicks. A row's title line (role, company link, date) sits above its <details>, so
 *    it is not part of the <summary>. A mouse click on it that is not on a link is passed on to
 *    the summary, which keeps the whole row feeling clickable. Keyboard users never need this:
 *    they toggle the summary itself.
 * 2. Animate. A real click on a summary marks its <details> `.is-anim` for a moment, which is the
 *    only time home.css plays the open and close motion. A row opened any other way (find-in-page,
 *    a script, restored page state) just appears in its final state with no hidden first frame.
 *    Keyboard toggles arrive as clicks too.
 */
export function useRowMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers = new Map();

    const animate = (details) => {
      details.classList.add('is-anim');
      clearTimeout(timers.get(details));
      timers.set(details, setTimeout(() => {
        details.classList.remove('is-anim');
        timers.delete(details);
      }, ANIM_MS));
    };

    const onClick = (event) => {
      const { target } = event;
      if (!(target instanceof Element)) return;
      // A link opens its site and never toggles the row, so it must not replay the animation
      // on a row that is already open.
      if (target.closest('a')) return;

      if (target.closest('.xp-head')) {
        // Dragging across the title to copy it ends in a click; leave the row alone then.
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        // The forwarded click re-enters this listener as a summary click and animates there.
        target.closest('.xp').querySelector('summary').click();
        return;
      }

      const summary = target.closest('.xp summary');
      if (!summary || reducedMotion.matches || document.hidden) return;
      animate(summary.parentElement);
    };

    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('click', onClick);
      timers.forEach((timer, details) => {
        clearTimeout(timer);
        details.classList.remove('is-anim');
      });
      timers.clear();
    };
  }, [rootRef]);
}

import { useLayoutEffect } from 'react';

const THEME_LIGHT = '#FFFFFF';
// The colour every other page uses; index.html ships it, so it is restored when leaving "/".
const THEME_DARK = '#0B0A0A';

function setThemeColor(color) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

/**
 * The site shell is dark: src/index.css paints a dark body, a noise layer and a custom cursor.
 * While the homepage is mounted this marks <html> with hm-page (home.css undoes those rules for
 * the document) and turns the browser UI white to match. A layout effect, so it lands before
 * first paint when React navigates here from a dark page. It is symmetric, so StrictMode's
 * mount, cleanup, mount leaves the same state as a single mount.
 */
export function useHomeDocument() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('hm-page');
    setThemeColor(THEME_LIGHT);
    return () => {
      root.classList.remove('hm-page');
      setThemeColor(THEME_DARK);
    };
  }, []);
}

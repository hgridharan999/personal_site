import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches, kept live. useSyncExternalStore reads the real
 * value on the first render, so a page that swaps layout on width (filters in an aside, or in a
 * disclosure) never paints the wrong one first. Without matchMedia it reports false.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback((notify) => {
    if (typeof window.matchMedia !== 'function') return () => {};
    const list = window.matchMedia(query);
    list.addEventListener('change', notify);
    return () => list.removeEventListener('change', notify);
  }, [query]);

  const getSnapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

import { useEffect, useRef } from 'react';

/**
 * Focus for a control that goes away when its action succeeds: call the returned `arm()` as
 * the action starts, and once `when` turns true, `ref` takes the focus. Never fires on a page
 * load, so a puzzle solved earlier tonight does not pull the page down to it.
 */
export function useFocusAfter(ref, when) {
  const armed = useRef(false);
  useEffect(() => {
    if (when && armed.current) {
      armed.current = false;
      ref.current?.focus();
    }
  }, [ref, when]);
  return () => { armed.current = true; };
}

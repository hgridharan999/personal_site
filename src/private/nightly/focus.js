import { useEffect } from 'react';

// Where focus goes when the control that held it disappears. Each view swap on /nightly unmounts
// the button that was just pressed, which drops focus to <body>; the next view picks it up.

/** True when nothing but <body> has focus: a focused control just unmounted. */
export function focusLost(doc = globalThis.document) {
  if (!doc) return false;
  return !doc.activeElement || doc.activeElement === doc.body;
}

/**
 * On mount (and whenever `when` turns true), moves focus to `ref` if focus was lost. Never takes
 * focus from something Hari is using.
 */
export function useCatchFocus(ref, when = true) {
  useEffect(() => {
    if (when && focusLost()) ref.current?.focus();
  }, [ref, when]);
}

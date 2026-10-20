import { useEffect } from 'react';

const SITE_NAME = 'Hari Gridharan';

/**
 * Sets "<title> · Hari Gridharan" while the page is mounted and puts the previous title back on
 * unmount, so leaving for the homepage (whose title lives in index.html) needs no bookkeeping.
 * A falsy title leaves the document title alone, which lets a page that has not loaded yet wait.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = `${title} · ${SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

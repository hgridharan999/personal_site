import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// BrowserRouter keeps the old scroll offset when the route changes, so a link
// near the bottom of the long homepage (the footer's "Privacy", an essay)
// would open the next page part-way down. Back/forward (POP) keeps the browser's
// own restoration.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}

import { useCallback } from 'react';
import { getToday, pollToday } from './nightlyApi.js';
import { isBusy, messageFor } from './view.js';

/**
 * How the page catches up with the server: on arrival, after a 202, and after a failed call.
 * - `load()` reads `today` from scratch (the loading state), and follows it if the server is busy;
 *   a failure becomes the error view unless it was a 401.
 * - `follow(action)` polls `today` while the session is busy; a poll that runs out of time leaves
 *   a "slow" notice on that action.
 * - `recover(action, err)` re-reads the truth after a failure: it keeps polling if the server is
 *   still at it, and otherwise explains the failure beside the action.
 * `authLost(err)` handles a 401 (it redirects to sign in) and returns true when it did.
 */
export function useRecovery({ alive, setToday, setNotice, setError, authLost }) {
  const follow = useCallback(async (action) => {
    const result = await pollToday({ cancelled: () => !alive.current });
    if (!result) return;
    setToday(result.today);
    if (result.timedOut) setNotice({ action, slow: true, message: 'This is taking longer than usual.' });
  }, [alive, setToday, setNotice]);

  const recover = useCallback(async (action, err) => {
    if (authLost(err)) return;
    try {
      const fresh = await getToday();
      if (!alive.current) return;
      setToday(fresh);
      if (isBusy(fresh.session)) return void (await follow(action));
    } catch (reread) {
      if (authLost(reread)) return;
      // otherwise the re-read failed too, and the message below still applies
    }
    if (alive.current) setNotice({ action, message: messageFor(err) });
  }, [alive, setToday, setNotice, authLost, follow]);

  const load = useCallback(async () => {
    setToday(null);
    setError(null);
    setNotice(null);
    try {
      const fresh = await getToday();
      if (!alive.current) return;
      setToday(fresh);
      if (isBusy(fresh.session)) await follow(fresh.session.status === 'grading' ? 'grade' : 'generate');
    } catch (err) {
      if (alive.current && !authLost(err)) setError(err);
    }
  }, [alive, setToday, setNotice, setError, authLost, follow]);

  return { load, follow, recover };
}

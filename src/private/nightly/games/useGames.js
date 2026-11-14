import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGames, logScore, makePuzzles, solve } from './gamesApi.js';
import { isAuthLost, messageFor } from '../view.js';

// A refused solve means the page is behind the server (solved in another tab, or the flaw is
// gone), so the payload is read again to show what is really there.
const REREAD = new Set(['ALREADY_SOLVED', 'NO_PUZZLES']);
// messageFor's closed-night line speaks of the brief's draft; nothing here is saved as a draft.
const CLOSED = "This night closed at 3am. Reload for tonight's games.";
const noticeText = (err) => (err?.code === 'NIGHT_CLOSED' ? CLOSED : messageFor(err));

/**
 * The Games section's data and actions, apart from the brief's: its own fetch, busy flags and
 * notices. `notice` is the last failed action, `{ action, puzzle?, message }`. Each action
 * resolves to the new payload, or null when it failed or was already running. A 401 sends Hari
 * to sign in, the same way useNightly does.
 */
export function useGames() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({ make: false, solve: false, log: false });
  const [notice, setNotice] = useState(null);
  const alive = useRef(true);
  const running = useRef(new Set()); // actions in flight: a second press is ignored
  const night = payload?.night;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const authLost = useCallback((err) => {
    if (!isAuthLost(err)) return false;
    if (alive.current) navigateRef.current('/login', { replace: true, state: { from: '/nightly' } });
    return true;
  }, []);

  const keep = (next) => { if (alive.current) setPayload(next); };

  const load = useCallback(async () => {
    setError(null);
    try {
      keep(await getGames());
    } catch (err) {
      if (!authLost(err) && alive.current) setError(err);
    }
  }, [authLost]);

  const run = async (action, call, extra = {}) => {
    if (running.current.has(action)) return null;
    running.current.add(action);
    setBusy((b) => ({ ...b, [action]: true }));
    setNotice(null);
    try {
      const next = await call();
      keep(next);
      return next;
    } catch (err) {
      if (authLost(err) || !alive.current) return null;
      setNotice({ action, ...extra, message: noticeText(err) });
      if (REREAD.has(err?.code)) getGames().then(keep, () => {});
      return null;
    } finally {
      running.current.delete(action);
      if (alive.current) setBusy((b) => ({ ...b, [action]: false }));
    }
  };

  const make = () => run('make', () => makePuzzles());

  const solveOne = (puzzle, answer) => run('solve', () => solve(night, puzzle, answer), { puzzle });

  /** Posts the entries one after another; each saved score shows at once, the last payload stays. */
  const saveLog = (entries) => run('log', async () => {
    let last = payload;
    for (const { game, score } of entries) {
      last = await logScore(night, game, score);
      keep(last);
    }
    return last;
  });

  useEffect(() => { load(); }, [load]);

  return { payload, error, busy, notice, load, make, solveOne, saveLog };
}

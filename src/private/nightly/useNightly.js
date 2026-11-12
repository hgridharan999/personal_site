import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearDraft, toSubmitBody } from './draft.js';
import { generate, grade, publish, submit } from './nightlyApi.js';
import { isAuthLost, messageFor, viewFor } from './view.js';
import { useRecovery } from './useRecovery.js';

/** window.localStorage when the browser allows it; the draft helpers treat null as "no storage". */
export function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Tonight's session and the actions on it. `notice` is the last failed action's message,
 * `{ action, code?, slow?, message }`, shown beside that action's button. A 401 anywhere sends
 * Hari to sign in and back here; the draft is already saved on this device.
 */
export function useNightly(storage) {
  const navigate = useNavigate();
  const [today, setToday] = useState(null);
  const [error, setError] = useState(null);
  const [flags, setFlags] = useState({ generating: false, grading: false, submitting: false, publishing: false });
  const [notice, setNotice] = useState(null);
  const alive = useRef(true);
  const graded = useRef(new Set()); // session ids this visit has already asked to grade
  const submitting = useRef(false); // guards submit by itself, whatever the buttons do

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const flag = (name, value) => { if (alive.current) setFlags((f) => ({ ...f, [name]: value })); };
  const setSession = (session) => setToday((t) => ({ ...t, session }));

  // navigate sits in a ref so authLost, and so load, keep one identity: the load effect runs once.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const authLost = useCallback((err) => {
    if (!isAuthLost(err)) return false;
    if (alive.current) navigateRef.current('/login', { replace: true, state: { from: '/nightly' } });
    return true;
  }, []);
  const { load, follow, recover } = useRecovery({ alive, setToday, setNotice, setError, authLost });

  /** Runs one action with its busy flag; a 202 switches to polling. */
  const run = useCallback(async (action, name, call) => {
    flag(name, true);
    setNotice(null);
    try {
      const res = await call();
      if (!alive.current) return;
      if (res.inProgress) await follow(action);
      else setSession(res.session);
    } catch (err) {
      if (alive.current) await recover(action, err);
    } finally {
      flag(name, false);
    }
  }, [follow, recover]);

  const runGenerate = () => run('generate', 'generating', () => generate());

  const runGrade = useCallback((id) => {
    graded.current.add(id);
    return run('grade', 'grading', () => grade(id));
  }, [run]);

  const runSubmit = async (draft) => {
    if (submitting.current) return;
    submitting.current = true;
    const { id, date } = today.session;
    flag('submitting', true);
    setNotice(null);
    try {
      const res = await submit(toSubmitBody(id, draft));
      clearDraft(storage, date);
      if (!alive.current) return;
      setSession(res.session);
      flag('submitting', false);
      await runGrade(id);
    } catch (err) {
      // A closed night keeps the form (and the saved draft) on screen; anything else re-reads.
      if (err?.code === 'NIGHT_CLOSED' || err?.status === 400) {
        setNotice({ action: 'submit', code: err.code, message: messageFor(err) });
      } else await recover('submit', err);
    } finally {
      submitting.current = false;
      flag('submitting', false);
    }
  };

  const runPublish = () => run('publish', 'publishing', () => publish(today.session.id));

  useEffect(() => { load(); }, [load]);

  // A session left submitted with no error (the tab closed mid-submit) is graded once, on arrival.
  const session = today?.session;
  useEffect(() => {
    if (session?.status === 'submitted' && !session.gradeError && !flags.grading && !graded.current.has(session.id)) {
      runGrade(session.id);
    }
  }, [session, flags.grading, runGrade]);

  const view = viewFor(today, { generating: flags.generating, grading: flags.grading, error });
  return { today, view, error, flags, notice, load, runGenerate, runGrade, runSubmit, runPublish };
}

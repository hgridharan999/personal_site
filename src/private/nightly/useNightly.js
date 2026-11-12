import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraft, toSubmitBody } from './draft.js';
import { generate, getToday, grade, pollToday, publish, submit } from './nightlyApi.js';
import { isBusy, messageFor, viewFor } from './view.js';

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
 * `{ action, message }`, shown beside that action's button; `slow` marks a poll that ran its
 * six minutes without the server finishing.
 */
export function useNightly(storage) {
  const [today, setToday] = useState(null);
  const [error, setError] = useState(null);
  const [flags, setFlags] = useState({ generating: false, grading: false, submitting: false, publishing: false });
  const [notice, setNotice] = useState(null);
  const alive = useRef(true);
  const graded = useRef(new Set()); // session ids this visit has already asked to grade

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const flag = (name, value) => { if (alive.current) setFlags((f) => ({ ...f, [name]: value })); };
  const setSession = (session) => setToday((t) => ({ ...t, session }));

  /** Polls while the server is busy; a poll that runs out of time leaves a "slow" notice. */
  const follow = useCallback(async (action) => {
    const result = await pollToday({ cancelled: () => !alive.current });
    if (!result) return;
    setToday(result.today);
    if (result.timedOut) setNotice({ action, slow: true, message: 'This is taking longer than usual.' });
  }, []);

  /** After a failed call, re-read the truth: keep polling if the server is still at it, else explain. */
  const recover = useCallback(async (action, err) => {
    try {
      const fresh = await getToday();
      if (!alive.current) return;
      setToday(fresh);
      if (isBusy(fresh.session)) return void (await follow(action));
    } catch {
      // the re-read failed too; the message below still applies
    }
    if (alive.current) setNotice({ action, message: messageFor(err) });
  }, [follow]);

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
      if (alive.current) setError(err);
    }
  }, [follow]);

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

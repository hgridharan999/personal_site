import { useEffect, useRef, useState } from 'react';
import { Notice } from '../NightlyStates';
import { formatScore, parseAnswer, sprintSummary } from './gamesLogic';
import { useFocusAfter } from './useFocusAfter';

const MAX_SECONDS = 3600;
// iOS decimal keypads have no minus key, so the one answer that can be negative gets a full keyboard
const SIGNED = /percent change/i;
const exact = (n) => formatScore(n, Number.isInteger(n) ? 0 : 1);

function SprintResult({ sprint }) {
  const { result, problems } = sprint;
  return (
    <>
      <p className="nt-score">{sprintSummary(result)}</p>
      <ol className="nt-games-problems">
        {problems.map((p, i) => (
          <li key={i} className="nt-games-problem">
            <p className="nt-prompt">{p.prompt}</p>
            <p className="sp-text">
              <span aria-hidden="true" className="nt-games-mark">{result.correct?.[i] ? '✓' : '✗'}</span>
              <span className="sr-only">{result.correct?.[i] ? 'Right.' : 'Wrong.'}</span>
              {' '}Answer: {exact(result.answers[i])}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

function SprintInput({ i, prompt, value, onChange }) {
  const id = `nt-sprint-${i}`;
  const signed = SIGNED.test(prompt);
  return (
    <li className="nt-games-problem">
      <label htmlFor={id} className="nt-prompt">{prompt}</label>
      {signed && <p id={`${id}-hint`} className="nt-meta">Type a minus for a fall, e.g. -12.5</p>}
      <input
        id={id}
        className="sp-input nt-games-input"
        type="text"
        inputMode={signed ? 'text' : 'decimal'}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={signed ? `${id}-hint` : undefined}
      />
    </li>
  );
}

/** Five quick calculations, timed from Start to Submit. One attempt; the result shows which were wrong. */
export default function SprintCard({ sprint, busy, notice, onSolve }) {
  const [values, setValues] = useState(['', '', '', '', '']);
  const [started, setStarted] = useState(false);
  const startedAt = useRef(0);
  const headRef = useRef(null);
  const solved = useFocusAfter(headRef, Boolean(sprint.result));

  useEffect(() => {
    if (started) document.getElementById('nt-sprint-0')?.focus();
  }, [started]);

  const start = () => {
    startedAt.current = performance.now();
    setStarted(true);
  };
  const submit = (e) => {
    e.preventDefault();
    if (busy) return; // Submit is aria-disabled, so it can still be pressed
    const seconds = Math.min(MAX_SECONDS, Math.round((performance.now() - startedAt.current) / 1000));
    solved();
    onSolve({ answers: values.map(parseAnswer), seconds });
  };
  const setValue = (i, text) => setValues((v) => v.map((x, j) => (j === i ? text : x)));

  let body;
  if (sprint.result) body = <SprintResult sprint={sprint} />;
  else if (!started) {
    body = (
      <>
        <p className="sp-text">Five quick calculations, timed from Start to Submit. One attempt.</p>
        <button type="button" className="btn nt-primary" onClick={start}>Start</button>
      </>
    );
  } else {
    body = (
      <form onSubmit={submit} noValidate>
        <ol className="nt-games-problems">
          {sprint.problems.map((p, i) => (
            <SprintInput key={i} i={i} prompt={p.prompt} value={values[i]} onChange={(t) => setValue(i, t)} />
          ))}
        </ol>
        <div className="nt-games-actions">
          <button type="submit" className="btn nt-primary" aria-disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
          <Notice notice={notice} />
        </div>
      </form>
    );
  }

  return (
    <section className="nt-games-card" aria-labelledby="nt-sprint-title">
      <h4 id="nt-sprint-title" ref={headRef} tabIndex={-1} className="nt-games-card__title">Sprint</h4>
      {body}
    </section>
  );
}

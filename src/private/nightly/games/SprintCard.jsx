import { useEffect, useRef, useState } from 'react';
import { Notice } from '../NightlyStates';
import { formatScore, parseAnswer, sprintSummary, unreadableCount, unreadableNotice } from './gamesLogic';
import { useFocusAfter } from './useFocusAfter';

const MAX_SECONDS = 3600;
// iOS decimal keypads have no minus key, so the one answer that can be negative gets a full keyboard
const SIGNED = /percent change/i;
const exact = (n) => formatScore(n, Number.isInteger(n) ? 0 : 1);
const inputId = (i) => `nt-sprint-${i}`;

// li is a flex column, which hides list markers, so the number is drawn as text
const Num = ({ i }) => <span aria-hidden="true" className="nt-games-num">{i + 1}. </span>;

/** What Hari typed for problem i: "blank" for a null, or null for a row saved before it was kept. */
function typed(given, i) {
  if (!given) return null;
  return given[i] === null || given[i] === undefined ? 'blank' : exact(given[i]);
}

function SprintResult({ sprint }) {
  const { result, problems } = sprint;
  return (
    <>
      <p className="nt-score">{sprintSummary(result)}</p>
      <ol className="nt-games-problems">
        {problems.map((p, i) => {
          const yours = typed(result.given, i);
          return (
            <li key={i} className="nt-games-problem">
              <p className="nt-prompt"><Num i={i} />{p.prompt}</p>
              <p className="sp-text">
                <span aria-hidden="true" className="nt-games-mark">{result.correct?.[i] ? '✓' : '✗'}</span>
                <span className="sr-only">{result.correct?.[i] ? 'Right.' : 'Wrong.'}</span>
                {yours === null
                  ? <>{' '}Answer: {exact(result.answers[i])}</>
                  : <>{' '}You: {yours}<span aria-hidden="true"> ·</span><span className="sr-only">,</span> answer: {exact(result.answers[i])}</>}
              </p>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Enter in any box but the last moves on to the next box instead of submitting the one attempt. */
function nextOnEnter(i, last) {
  return (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || last) return;
    e.preventDefault();
    document.getElementById(inputId(i + 1))?.focus();
  };
}

function SprintInput({ i, last, prompt, value, onChange }) {
  const id = inputId(i);
  const signed = SIGNED.test(prompt);
  return (
    <li className="nt-games-problem">
      <label htmlFor={id} className="nt-prompt"><Num i={i} />{prompt}</label>
      {signed && <p id={`${id}-hint`} className="nt-meta">Type a minus for a fall, e.g. -12.5</p>}
      <input
        id={id}
        className="sp-input nt-games-input"
        type="text"
        inputMode={signed ? 'text' : 'decimal'}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={nextOnEnter(i, last)}
        aria-describedby={signed ? `${id}-hint` : undefined}
      />
    </li>
  );
}

/** Five quick calculations, timed from Start to Submit. One attempt; the result shows which were wrong. */
export default function SprintCard({ sprint, busy, notice, onSolve }) {
  const [values, setValues] = useState(['', '', '', '', '']);
  const [started, setStarted] = useState(false);
  // blank or unreadable answers were reported once; the next Submit sends them anyway
  const [confirming, setConfirming] = useState(false);
  const startedAt = useRef(0);
  const headRef = useRef(null);
  const solved = useFocusAfter(headRef, Boolean(sprint.result));

  useEffect(() => {
    if (started) document.getElementById(inputId(0))?.focus();
  }, [started]);

  const start = () => {
    startedAt.current = performance.now();
    setStarted(true);
  };
  const submit = (e) => {
    e.preventDefault();
    if (busy) return; // Submit is aria-disabled, so it can still be pressed
    if (!confirming && unreadableCount(values) > 0) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    const seconds = Math.min(MAX_SECONDS, Math.round((performance.now() - startedAt.current) / 1000));
    solved();
    onSolve({ answers: values.map(parseAnswer), seconds });
  };
  const setValue = (i, text) => {
    setValues((v) => v.map((x, j) => (j === i ? text : x)));
    setConfirming(false);
  };

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
            <SprintInput
              key={i}
              i={i}
              last={i === sprint.problems.length - 1}
              prompt={p.prompt}
              value={values[i]}
              onChange={(t) => setValue(i, t)}
            />
          ))}
        </ol>
        <div className="nt-games-actions">
          <button type="submit" className="btn nt-primary" aria-disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
          <Notice notice={confirming ? { message: unreadableNotice(unreadableCount(values)) } : notice} />
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

import { useRef, useState } from 'react';
import { Notice } from '../NightlyStates';
import { useFocusAfter } from './useFocusAfter';

const PICK_FIRST = { message: 'Pick one of the four first.' };

function FlawResult({ flaw }) {
  const { score, choice, flawName, explanation } = flaw.result;
  return (
    <>
      <p className="nt-score">{score === 1 ? 'Right' : 'Wrong'}: the flaw is {flawName}.</p>
      {score !== 1 && <p className="sp-text">You picked {flaw.choices[choice]}.</p>}
      <p className="nt-feedback">{explanation}</p>
    </>
  );
}

function FlawForm({ flaw, busy, notice, onSolve }) {
  const [choice, setChoice] = useState(null);
  const [unpicked, setUnpicked] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (busy) return; // Submit is aria-disabled, so it can still be pressed
    if (choice === null) {
      setUnpicked(true);
      document.getElementById('nt-flaw-0')?.focus();
      return;
    }
    onSolve(choice);
  };
  const pick = (i) => {
    setChoice(i);
    setUnpicked(false);
  };
  return (
    <form onSubmit={submit} noValidate>
      <fieldset className="nt-picker">
        <legend className="nt-type">Which flaw?</legend>
        {flaw.choices.map((name, i) => (
          <label key={i} className="nt-choice">
            <input id={`nt-flaw-${i}`} type="radio" name="nt-flaw" value={i} checked={choice === i} onChange={() => pick(i)} />
            <span>{name}</span>
          </label>
        ))}
      </fieldset>
      <div className="nt-games-actions">
        <button type="submit" className="btn nt-primary" aria-disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
        <Notice notice={notice ?? (unpicked ? PICK_FIRST : null)} />
      </div>
    </form>
  );
}

/** Spot the flaw: make tonight's argument if it is not there yet, pick the flaw, see the answer. */
export default function FlawCard({ flaw, busy, notice, onMake, onSolve }) {
  const headRef = useRef(null);
  const made = useFocusAfter(headRef, Boolean(flaw));
  const solved = useFocusAfter(headRef, Boolean(flaw?.result));

  const make = () => {
    if (busy.make) return; // aria-disabled while making, so it can still be pressed
    made();
    onMake();
  };
  const solve = (choice) => {
    solved();
    onSolve(choice);
  };

  let body;
  if (!flaw) {
    body = (
      <>
        <p className="sp-text">A short argument with one flaw in its reasoning. Name the flaw.</p>
        <button type="button" className="btn nt-primary" aria-disabled={busy.make} onClick={make}>
          {busy.make ? 'Making…' : "Make tonight's flaw"}
        </button>
        <Notice notice={notice} />
      </>
    );
  } else {
    body = (
      <>
        {flaw.setting && <p className="nt-meta">{flaw.setting}</p>}
        <p className="nt-prose">{flaw.argument}</p>
        {flaw.result
          ? <FlawResult flaw={flaw} />
          : <FlawForm flaw={flaw} busy={busy.solve} notice={notice} onSolve={solve} />}
      </>
    );
  }

  return (
    <section className="nt-games-card" aria-labelledby="nt-flaw-title">
      <h4 id="nt-flaw-title" ref={headRef} tabIndex={-1} className="nt-games-card__title">Spot the flaw</h4>
      {body}
    </section>
  );
}

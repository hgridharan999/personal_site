import { useEffect, useRef, useState } from 'react';
import { draftProblems, emptyDraft, fieldId, loadDraft, saveDraft } from './draft';
import NightlyBrief from './NightlyBrief';
import ConfirmSubmit from './ConfirmSubmit';
import { Problems, Question, TakeFields } from './NightlyFields';
import { Notice } from './NightlyStates';

const focusField = (field) => document.getElementById(fieldId(field))?.focus();

/**
 * Where focus goes around submit, so it never drops to the page: back to Submit after Cancel or
 * Confirm, and, when the server turns the submit down (night closed, 400), to the first problem
 * or to Submit once the fields are enabled again.
 */
function useSubmitFocus({ confirming, notice, submitting, draft }) {
  const submitRef = useRef(null);
  const refocus = useRef(false);
  const awaiting = useRef(false); // a submit went out and its failure has not been shown yet

  useEffect(() => {
    if (!confirming && refocus.current) {
      refocus.current = false;
      submitRef.current?.focus();
    }
  }, [confirming]);

  useEffect(() => {
    if (!notice || submitting || !awaiting.current) return;
    awaiting.current = false;
    const first = draftProblems(draft)[0];
    if (first) focusField(first.field);
    else submitRef.current?.focus();
  }, [notice, submitting, draft]);

  return {
    submitRef,
    returnToSubmit: () => { refocus.current = true; },
    sent: () => { awaiting.current = true; },
  };
}

/**
 * The brief, the three answers and the take, with the draft saved to this device on every
 * keystroke until submit succeeds. Submitting asks once, inline, because it cannot be undone.
 * A blank field is marked and focused; the server's refusal is shown beside Submit.
 */
export default function NightlyForm({ session, storage, submitting, notice, onSubmit }) {
  const { stories = [], niche, questions = [], date } = session;
  const [draft, setDraft] = useState(() => loadDraft(storage, date) ?? emptyDraft());
  const [problems, setProblems] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const edited = useRef(false);
  const { submitRef, returnToSubmit, sent } = useSubmitFocus({ confirming, notice, submitting, draft });
  const locked = submitting || notice?.code === 'NIGHT_CLOSED';

  useEffect(() => {
    if (edited.current) saveDraft(storage, date, draft);
  }, [storage, date, draft]);

  /** `change` is a patch, or a function of the current draft that returns one. */
  const update = (change) => {
    edited.current = true;
    setDraft((d) => ({ ...d, ...(typeof change === 'function' ? change(d) : change) }));
    setProblems([]);
  };
  const setAnswer = (i, text) => update((d) => ({ answers: d.answers.map((a, j) => (j === i ? text : a)) }));
  const problemFor = (field) => problems.find((p) => p.field === field);

  const ask = (e) => {
    e.preventDefault();
    if (locked) return; // Submit is aria-disabled, so it can still be pressed
    const missing = draftProblems(draft);
    setProblems(missing);
    if (missing.length > 0) focusField(missing[0].field);
    else setConfirming(true);
  };
  const back = () => {
    returnToSubmit();
    setConfirming(false);
  };
  const confirm = () => {
    sent();
    back();
    onSubmit(draft);
  };

  return (
    <>
      <NightlyBrief stories={stories} niche={niche} />
      <form className="nt-form" onSubmit={ask} noValidate>
        <section className="nt-section" aria-labelledby="nt-q-title">
          <h2 id="nt-q-title" className="nt-section__title">Three questions</h2>
          <ol className="nt-fields" role="list">
            {questions.map((q, i) => (
              <Question
                key={i}
                i={i}
                question={q}
                story={stories[q.story_index]}
                value={draft.answers[i]}
                onChange={(text) => setAnswer(i, text)}
                disabled={submitting}
                problem={problemFor(`a${i}`)}
              />
            ))}
          </ol>
        </section>

        <TakeFields stories={stories} draft={draft} update={update} disabled={submitting} problemFor={problemFor} />

        <div className="nt-actions">
          <Problems problems={problems} />
          {confirming ? (
            <ConfirmSubmit onConfirm={confirm} onCancel={back} />
          ) : (
            <button ref={submitRef} type="submit" className="nt-btn nt-btn--primary" aria-disabled={locked}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
          <Notice notice={notice} />
        </div>
      </form>
    </>
  );
}

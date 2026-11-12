import { useEffect, useRef, useState } from 'react';
import { draftProblems, emptyDraft, loadDraft, saveDraft } from './draft';
import { typeName } from './view';
import NightlyBrief from './NightlyBrief';
import ConfirmSubmit from './ConfirmSubmit';
import { Notice } from './NightlyStates';

/** One question: its type and prompt label the answer box; the story it is about describes it. */
function Question({ i, question, story, value, onChange, disabled }) {
  const id = `nt-a${i}`;
  return (
    <li className="nt-field">
      <label htmlFor={id} className="nt-q">
        <span className="asc-mono nt-type">{i + 1} · {typeName(question.type)}</span>
        <span className="nt-prompt">{question.prompt}</span>
      </label>
      {story && <p id={`${id}-on`} className="nt-muted nt-on">On: {story.headline}</p>}
      <textarea
        id={id}
        className="nt-textarea"
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-describedby={story ? `${id}-on` : undefined}
      />
    </li>
  );
}

/** The story picker and the take, which is Hari's alone: no model call ever touches it. */
function TakeFields({ stories, draft, update, disabled }) {
  return (
    <section className="nt-section" aria-labelledby="nt-take-title">
      <h2 id="nt-take-title" className="nt-section__title">Your take</h2>
      <fieldset className="nt-picker" disabled={disabled}>
        <legend className="asc-mono nt-type">Which story is it on?</legend>
        {stories.map((story, i) => (
          <label key={story.url ?? i} className="nt-choice">
            <input type="radio" name="nt-story" value={i} checked={draft.storyIndex === i} onChange={() => update({ storyIndex: i })} />
            <span>{story.headline}</span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="nt-take" className="asc-mono nt-type nt-label">Your take</label>
      <p id="nt-take-hint" className="nt-muted">3 to 5 sentences, starting from something you saw or did</p>
      <textarea
        id="nt-take"
        className="nt-textarea nt-textarea--take"
        rows={7}
        value={draft.take}
        onChange={(e) => update({ take: e.target.value })}
        disabled={disabled}
        aria-describedby="nt-take-hint"
      />
    </section>
  );
}

/**
 * The brief, the three answers and the take, with the draft saved to this device on every
 * keystroke until submit succeeds. Submitting asks once, inline, because it cannot be undone.
 */
export default function NightlyForm({ session, storage, submitting, notice, onSubmit }) {
  const { stories = [], niche, questions = [], date } = session;
  const [draft, setDraft] = useState(() => loadDraft(storage, date) ?? emptyDraft());
  const [problems, setProblems] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const edited = useRef(false);
  const submitRef = useRef(null);
  const refocus = useRef(false);
  const closed = notice?.code === 'NIGHT_CLOSED';

  useEffect(() => {
    if (edited.current) saveDraft(storage, date, draft);
  }, [storage, date, draft]);

  // Cancel hands focus back to Submit once Submit is back on screen.
  useEffect(() => {
    if (!confirming && refocus.current) {
      refocus.current = false;
      submitRef.current?.focus();
    }
  }, [confirming]);

  /** `change` is a patch, or a function of the current draft that returns one. */
  const update = (change) => {
    edited.current = true;
    setDraft((d) => ({ ...d, ...(typeof change === 'function' ? change(d) : change) }));
    setProblems([]);
  };
  const setAnswer = (i, text) => update((d) => ({ answers: d.answers.map((a, j) => (j === i ? text : a)) }));

  const ask = (e) => {
    e.preventDefault();
    const missing = draftProblems(draft);
    setProblems(missing);
    if (missing.length === 0) setConfirming(true);
  };
  const cancel = () => {
    refocus.current = true;
    setConfirming(false);
  };
  const confirm = () => {
    setConfirming(false);
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
                key={q.type}
                i={i}
                question={q}
                story={stories[q.story_index]}
                value={draft.answers[i]}
                onChange={(text) => setAnswer(i, text)}
                disabled={submitting}
              />
            ))}
          </ol>
        </section>

        <TakeFields stories={stories} draft={draft} update={update} disabled={submitting} />

        <div className="nt-actions">
          {problems.length > 0 && (
            <ul className="nt-problems" role="alert">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {confirming ? (
            <ConfirmSubmit onConfirm={confirm} onCancel={cancel} />
          ) : (
            <button ref={submitRef} type="submit" className="nt-btn nt-btn--primary" disabled={submitting || closed}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
          <Notice notice={notice} />
        </div>
      </form>
    </>
  );
}

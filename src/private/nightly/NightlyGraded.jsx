import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { typeName } from './view';
import { useCatchFocus } from './focus';
import { Notice } from './NightlyStates';

function ScoredAnswer({ answer }) {
  return (
    <li className="nt-answer">
      <div className="nt-answer__top">
        <p className="nt-type">{typeName(answer.questionType)}</p>
        <p className="nt-score">
          <span aria-hidden="true">{answer.score}/5</span>
          <span className="sr-only">Score: {answer.score} out of 5</span>
        </p>
      </div>
      <p className="nt-prompt">{answer.prompt}</p>
      <p className="nt-prose nt-written">{answer.answer}</p>
      <p className="nt-feedback"><span className="sr-only">Feedback: </span>{answer.feedback}</p>
    </li>
  );
}

function Outcome({ outcome }) {
  if (outcome === 'published') return <>Published on <Link to="/notes">/notes</Link>.</>;
  if (outcome === 'skipped') return 'Kept private.';
  return null;
}

/**
 * Publish or Skip. Skip only hides the choice for this visit; publishing is one-way. The outcome
 * lands in a status line that is always on the page, and focus moves to it, since the buttons go.
 */
function PublishChoice({ take, publishing, notice, onPublish }) {
  const [skipped, setSkipped] = useState(false);
  const statusRef = useRef(null);
  const chose = useRef(false);
  let outcome = null;
  if (take.published) outcome = 'published';
  else if (skipped) outcome = 'skipped';

  useEffect(() => {
    if (outcome && chose.current) {
      chose.current = false;
      statusRef.current?.focus();
    }
  }, [outcome]);

  // aria-disabled (not disabled) keeps a pressed button focusable while the publish runs.
  const choose = (act) => () => {
    if (publishing) return;
    chose.current = true;
    act();
  };

  return (
    <>
      {!outcome && (
        <div className="nt-actions">
          <div className="nt-confirm__buttons">
            <button type="button" className="btn nt-primary" aria-disabled={publishing} onClick={choose(onPublish)}>
              {publishing ? 'Publishing…' : 'Publish to /notes'}
            </button>
            <button type="button" className="btn btn-line" aria-disabled={publishing} onClick={choose(() => setSkipped(true))}>Skip</button>
          </div>
          <Notice notice={notice} />
        </div>
      )}
      <p ref={statusRef} className="sp-text nt-choice-done" role="status" tabIndex={-1}>
        <Outcome outcome={outcome} />
      </p>
    </>
  );
}

/** The graded night: each answer with its score and one line, the two takes, and the follow-up. */
export default function NightlyGraded({ session, publishing, notice, onPublish }) {
  const { answers = [], take, stories } = session;
  const story = stories?.[take.storyIndex];
  const headingRef = useRef(null);
  useCatchFocus(headingRef); // the Grading heading that held focus has just gone

  return (
    <>
      <section className="nt-section" aria-labelledby="nt-scores-title">
        <h2 id="nt-scores-title" className="head nt-section__title" ref={headingRef} tabIndex={-1}>Your answers, graded</h2>
        <ol className="nt-answers" role="list">
          {answers.map((a) => <ScoredAnswer key={a.idx} answer={a} />)}
        </ol>
      </section>

      <section className="nt-section" aria-labelledby="nt-takes-title">
        <h2 id="nt-takes-title" className="head nt-section__title">The takes</h2>
        {story && <p className="sp-text nt-on">On: {story.headline}</p>}
        <div className="nt-compare">
          <article className="nt-take" aria-labelledby="nt-yours">
            <h3 id="nt-yours" className="nt-type">Your take</h3>
            <p className="nt-prose nt-written">{take.body}</p>
          </article>
          <article className="nt-take nt-take--model" aria-labelledby="nt-model">
            <h3 id="nt-model" className="nt-type">Model&rsquo;s take</h3>
            <p className="nt-prose nt-written">{take.modelTake}</p>
          </article>
        </div>
      </section>

      <section className="nt-section" aria-labelledby="nt-follow-title">
        <h2 id="nt-follow-title" className="head nt-section__title">Follow-up</h2>
        <p className="nt-prose">{take.followUp}</p>
      </section>

      <section className="nt-section" aria-label="Publish">
        <PublishChoice take={take} publishing={publishing} notice={notice} onPublish={onPublish} />
      </section>
    </>
  );
}

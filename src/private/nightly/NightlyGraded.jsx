import { useState } from 'react';
import { Link } from 'react-router-dom';
import { typeName } from './view';
import { Notice } from './NightlyStates';

function ScoredAnswer({ answer }) {
  return (
    <li className="nt-answer">
      <div className="nt-answer__top">
        <p className="asc-mono nt-type">{typeName(answer.questionType)}</p>
        <p className="nt-score">
          <span aria-hidden="true">{answer.score}/5</span>
          <span className="nt-sr">Score: {answer.score} out of 5</span>
        </p>
      </div>
      <p className="nt-prompt">{answer.prompt}</p>
      <p className="nt-prose nt-written">{answer.answer}</p>
      <p className="nt-feedback">{answer.feedback}</p>
    </li>
  );
}

/** Publish or Skip. Skip only hides the choice for this visit; publishing is one-way. */
function PublishChoice({ take, publishing, notice, onPublish }) {
  const [skipped, setSkipped] = useState(false);

  if (take.published) {
    return (
      <p className="nt-muted nt-choice-done">
        Published on <Link to="/notes" className="nt-link">/notes</Link>.
      </p>
    );
  }
  if (skipped) return <p className="nt-muted nt-choice-done">Kept private.</p>;

  return (
    <div className="nt-actions">
      <div className="nt-confirm__buttons">
        <button type="button" className="nt-btn nt-btn--primary" onClick={onPublish} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish to /notes'}
        </button>
        <button type="button" className="nt-btn" onClick={() => setSkipped(true)} disabled={publishing}>Skip</button>
      </div>
      <Notice notice={notice} />
    </div>
  );
}

/** The graded night: each answer with its score and one line, the two takes, and the follow-up. */
export default function NightlyGraded({ session, publishing, notice, onPublish }) {
  const { answers = [], take, stories } = session;
  const story = stories?.[take.storyIndex];

  return (
    <>
      <section className="nt-section" aria-labelledby="nt-scores-title">
        <h2 id="nt-scores-title" className="nt-section__title">Your answers, graded</h2>
        <ol className="nt-answers" role="list">
          {answers.map((a) => <ScoredAnswer key={a.idx} answer={a} />)}
        </ol>
      </section>

      <section className="nt-section" aria-labelledby="nt-takes-title">
        <h2 id="nt-takes-title" className="nt-section__title">The takes</h2>
        {story && <p className="nt-muted nt-on">On: {story.headline}</p>}
        <div className="nt-compare">
          <article className="nt-take" aria-labelledby="nt-yours">
            <h3 id="nt-yours" className="asc-mono nt-type">Your take</h3>
            <p className="nt-prose nt-written">{take.body}</p>
          </article>
          <article className="nt-take nt-take--model" aria-labelledby="nt-model">
            <h3 id="nt-model" className="asc-mono nt-type">Model&rsquo;s take</h3>
            <p className="nt-prose nt-written">{take.modelTake}</p>
          </article>
        </div>
      </section>

      <section className="nt-section" aria-labelledby="nt-follow-title">
        <h2 id="nt-follow-title" className="nt-section__title">Follow-up</h2>
        <p className="nt-prose">{take.followUp}</p>
      </section>

      <section className="nt-section" aria-label="Publish">
        <PublishChoice take={take} publishing={publishing} notice={notice} onPublish={onPublish} />
      </section>
    </>
  );
}

import { typeName } from './view';

/**
 * The locked answers and take, read-only. Used while grading and when grading failed; it shows
 * only what Hari wrote, never a grading field, so it is safe before the session is graded.
 */
export function LockedAnswers({ session, title = 'Your answers' }) {
  const answers = session.answers ?? [];
  const { take } = session;
  const story = take ? session.stories?.[take.storyIndex] : null;

  return (
    <section className="nt-section" aria-labelledby="nt-locked-title">
      <h2 id="nt-locked-title" className="head nt-section__title">{title}</h2>
      {answers.length === 0 && !take && <p className="sp-text">Nothing was written this night.</p>}
      <ol className="nt-answers" role="list">
        {answers.map((a) => (
          <li key={a.idx} className="nt-answer">
            <p className="nt-type">{typeName(a.questionType)}</p>
            <p className="nt-prompt">{a.prompt}</p>
            <p className="nt-prose nt-written">{a.answer}</p>
          </li>
        ))}
      </ol>
      {take && (
        <div className="nt-answer">
          <p className="nt-type">Your take{story ? ` · on ${story.headline}` : ''}</p>
          <p className="nt-prose nt-written">{take.body}</p>
        </div>
      )}
    </section>
  );
}

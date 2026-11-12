import { errorId, fieldId, MAX_CHARS } from './draft';
import { typeName } from './view';

// The form's controls. Each is required; a blank one is marked invalid and described by its own
// line in the problems list, so a screen reader hears what is wrong when it lands there.

const describedBy = (...ids) => ids.filter(Boolean).join(' ') || undefined;
const invalidProps = (field, problem) => ({
  'aria-required': 'true',
  'aria-invalid': problem ? 'true' : undefined,
  'aria-describedby': problem ? errorId(field) : undefined,
});

/** One question: its type and prompt label the answer box; the story it is about describes it. */
export function Question({ i, question, story, value, onChange, disabled, problem }) {
  const field = `a${i}`;
  const id = fieldId(field);
  const aria = invalidProps(field, problem);
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
        maxLength={MAX_CHARS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        {...aria}
        aria-describedby={describedBy(story && `${id}-on`, aria['aria-describedby'])}
      />
    </li>
  );
}

/** The story picker and the take, which is Hari's alone: no model call ever touches it. */
export function TakeFields({ stories, draft, update, disabled, problemFor }) {
  const story = invalidProps('story', problemFor('story'));
  const take = invalidProps('take', problemFor('take'));
  return (
    <section className="nt-section" aria-labelledby="nt-take-title">
      <h2 id="nt-take-title" className="nt-section__title">Your take</h2>
      <fieldset className="nt-picker" role="radiogroup" disabled={disabled} {...story}>
        <legend className="asc-mono nt-type">Which story is it on?</legend>
        {stories.map((s, i) => (
          <label key={i} className="nt-choice">
            <input
              id={i === 0 ? fieldId('story') : undefined}
              type="radio"
              name="nt-story"
              value={i}
              checked={draft.storyIndex === i}
              onChange={() => update({ storyIndex: i })}
            />
            <span>{s.headline}</span>
          </label>
        ))}
      </fieldset>
      <label htmlFor={fieldId('take')} className="asc-mono nt-type nt-label">Your take</label>
      <p id="nt-take-hint" className="nt-muted">3 to 5 sentences, starting from something you saw or did</p>
      <textarea
        id={fieldId('take')}
        className="nt-textarea nt-textarea--take"
        rows={7}
        maxLength={MAX_CHARS}
        value={draft.take}
        onChange={(e) => update({ take: e.target.value })}
        disabled={disabled}
        {...take}
        aria-describedby={describedBy('nt-take-hint', take['aria-describedby'])}
      />
    </section>
  );
}

/** What still needs filling, each line with the id its field points at. */
export function Problems({ problems }) {
  if (problems.length === 0) return null;
  return (
    <ul className="nt-problems" role="alert">
      {problems.map((p) => <li key={p.field} id={errorId(p.field)}>{p.message}</li>)}
    </ul>
  );
}

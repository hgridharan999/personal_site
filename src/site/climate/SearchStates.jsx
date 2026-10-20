/** Shown from the moment a search is sent until the API answers. */
export function Searching() {
  return (
    <p className="sp-status sp-searching">
      <span className="sp-ring" aria-hidden="true" />
      Searching the index
    </p>
  );
}

/** The request failed: a way out, not a dead end. The page's status region announces it. */
export function Failure({ message, onRetry }) {
  return (
    <div className="sp-fail">
      <p className="sp-fail-title">Search failed</p>
      <p className="sp-text">{message}</p>
      <button type="button" className="btn btn-line" onClick={onRetry}>Try again</button>
    </div>
  );
}

/**
 * The start state and the no-results state share one shape: an ink line, a grey line and
 * example searches. The examples fill the box and run, so neither state is a dead end.
 */
export function Prompt({ title, hint, terms, onPick }) {
  return (
    <div className="sp-prompt">
      <p className="sp-prompt-title">{title}</p>
      <p className="sp-text">{hint}</p>
      <ul className="sp-chips" role="list" aria-label="Example searches">
        {terms.map((term) => (
          <li key={term}>
            <button type="button" className="sp-chip" onClick={() => onPick(term)}>{term}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

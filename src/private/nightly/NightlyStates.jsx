// The small screens around the brief: loading, no brief yet, generating, grading, and failures.
// Each one that can get stuck carries a way out.

export function Loading() {
  return (
    <p className="nt-state asc-mono">
      <span className="nt-pulse" aria-hidden="true" /> Loading tonight…
    </p>
  );
}

/** An inline message under an action, announced when it appears. */
export function Notice({ notice }) {
  return (
    <p className="nt-notice" role="alert">{notice ? notice.message : ''}</p>
  );
}

export function Failure({ message, detail, onRetry }) {
  return (
    <section className="nt-panel" role="alert">
      <p className="nt-panel__title">{message}</p>
      {detail && <p className="nt-muted">{detail}</p>}
      <button type="button" className="nt-btn" onClick={onRetry}>Retry</button>
    </section>
  );
}

export function Empty({ notice, onGenerate }) {
  return (
    <section className="nt-panel" aria-labelledby="nt-empty-title">
      <h2 id="nt-empty-title" className="nt-panel__title">No brief yet</h2>
      <p className="nt-muted">Tonight's brief arrives on its own in the evening. You can make it now instead.</p>
      <button type="button" className="nt-btn nt-btn--primary" onClick={onGenerate}>Generate now</button>
      <Notice notice={notice} />
    </section>
  );
}

export function Generating({ notice, onRetry, busy }) {
  return (
    <section className="nt-panel" aria-labelledby="nt-gen-title">
      <h2 id="nt-gen-title" className="nt-panel__title nt-state">
        <span className="nt-pulse" aria-hidden="true" /> Generating…
      </h2>
      <p className="nt-muted">Writing tonight’s brief. This can take a few minutes.</p>
      {notice?.slow && !busy && <button type="button" className="nt-btn" onClick={onRetry}>Try again</button>}
      <Notice notice={notice} />
    </section>
  );
}

export function Grading({ notice, onRetry, busy }) {
  return (
    <section className="nt-panel" aria-labelledby="nt-grading-title">
      <h2 id="nt-grading-title" className="nt-panel__title nt-state">
        <span className="nt-pulse" aria-hidden="true" /> Grading…
      </h2>
      <p className="nt-muted">Your answers are locked. The grade and the blind take are on their way.</p>
      {notice && !busy && <button type="button" className="nt-btn" onClick={onRetry}>Try again</button>}
      <Notice notice={notice} />
    </section>
  );
}

export function GradeFailed({ onRetry }) {
  return (
    <section className="nt-panel" aria-labelledby="nt-failed-title">
      <h2 id="nt-failed-title" className="nt-panel__title">Grading did not finish</h2>
      <p className="nt-muted">Your answers are safe and still locked. Try the grade again.</p>
      <button type="button" className="nt-btn nt-btn--primary" onClick={onRetry}>Retry</button>
    </section>
  );
}

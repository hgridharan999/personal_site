import { useRef, useState } from 'react';
import { useCatchFocus } from './focus';

// The small screens around the brief: loading, no brief yet, generating, grading, and failures.
// Each one that can get stuck carries a way out. A view that replaces the one Hari was using
// picks up the focus that view's button dropped.

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

/**
 * "Try again", once offered, stays on screen for the rest of the view: pressing it clears the
 * notice that offered it, and a button that vanished under focus would drop focus to the page.
 * While the retry runs it is aria-disabled (still focusable) and ignores presses.
 */
function TryAgain({ offer, busy, onRetry }) {
  const [offered, setOffered] = useState(false);
  if (offer && !offered) setOffered(true);
  if (!offer && !offered) return null;
  return (
    <button type="button" className="nt-btn" aria-disabled={busy} onClick={busy ? undefined : onRetry}>
      Try again
    </button>
  );
}

export function Failure({ message, detail, onRetry }) {
  return (
    <section className="nt-panel" aria-labelledby="nt-fail-title">
      <h2 id="nt-fail-title" className="nt-panel__title">{message}</h2>
      {detail && <p className="nt-muted" role="alert">{detail}</p>}
      <button type="button" className="nt-btn" onClick={onRetry}>Retry</button>
    </section>
  );
}

export function Empty({ notice, onGenerate }) {
  const buttonRef = useRef(null);
  useCatchFocus(buttonRef, Boolean(notice)); // a failed generate lands back here
  return (
    <section className="nt-panel" aria-labelledby="nt-empty-title">
      <h2 id="nt-empty-title" className="nt-panel__title">No brief yet</h2>
      <p className="nt-muted">Tonight's brief arrives on its own in the evening. You can make it now instead.</p>
      <button ref={buttonRef} type="button" className="nt-btn nt-btn--primary" onClick={onGenerate}>Generate now</button>
      <Notice notice={notice} />
    </section>
  );
}

/** "Generating…" or "Grading…": the heading takes the focus the pressed button dropped. */
function Working({ id, title, children, notice, offer, onRetry, busy }) {
  const headingRef = useRef(null);
  useCatchFocus(headingRef);
  return (
    <section className="nt-panel" aria-labelledby={id}>
      <h2 id={id} className="nt-panel__title nt-state" ref={headingRef} tabIndex={-1}>
        <span className="nt-pulse" aria-hidden="true" /> {title}
      </h2>
      <p className="nt-muted">{children}</p>
      <TryAgain offer={offer} busy={busy} onRetry={onRetry} />
      <Notice notice={notice} />
    </section>
  );
}

export function Generating({ notice, onRetry, busy }) {
  return (
    <Working id="nt-gen-title" title="Generating…" notice={notice} offer={Boolean(notice?.slow)} onRetry={onRetry} busy={busy}>
      Writing tonight’s brief. This can take a few minutes.
    </Working>
  );
}

export function Grading({ notice, onRetry, busy }) {
  return (
    <Working id="nt-grading-title" title="Grading…" notice={notice} offer={Boolean(notice)} onRetry={onRetry} busy={busy}>
      Your answers are locked. The grade and the blind take are on their way.
    </Working>
  );
}

export function GradeFailed({ notice, onRetry }) {
  const retryRef = useRef(null);
  useCatchFocus(retryRef, Boolean(notice)); // a retry that failed again lands back here
  return (
    <section className="nt-panel" aria-labelledby="nt-failed-title">
      <h2 id="nt-failed-title" className="nt-panel__title">Grading did not finish</h2>
      <p className="nt-muted">Your answers are safe and still locked. Try the grade again.</p>
      <button ref={retryRef} type="button" className="nt-btn nt-btn--primary" onClick={onRetry}>Retry</button>
      <Notice notice={notice} />
    </section>
  );
}

/** One Stats tab panel: loading, error (with retry), locked/empty message, or the ready content. */
function PanelBody({ status, error, onRetry, view, children }) {
  if (!view && status === 'error') {
    return (
      <div className="pk-panel-msg">
        <p className="pk-error" role="alert">Couldn&apos;t load this panel: {error}</p>
        <button type="button" className="pk-btn" data-hot onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!view) return <p className="pk-muted" role="status">Loading…</p>;
  if (view.state !== 'ready') {
    return <p className={`pk-muted pk-panel-msg pk-panel-msg--${view.state}`}>{view.message}</p>;
  }
  return children(view);
}

export default function StatsPanel({ id, title, wide = false, status, error, onRetry, view, children }) {
  const className = wide ? 'pk-box pk-stats-panel pk-stats__wide' : 'pk-box pk-stats-panel';
  return (
    <section className={className} aria-labelledby={`${id}-title`} aria-busy={status === 'loading'}>
      <h2 id={`${id}-title`} className="pk-h2">{title}</h2>
      <PanelBody status={status} error={error} onRetry={onRetry} view={view}>{children}</PanelBody>
    </section>
  );
}

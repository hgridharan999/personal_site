import { Link } from 'react-router-dom';
import { usePokerResource } from '../shared/usePokerResource.js';
import { listRecentPokerSessions } from '../../lib/persistence/api.js';
import { recentSessionView } from '../review/reviewView.js';

const loadRecent = () => listRecentPokerSessions();

function RecentBody({ recent }) {
  if (!recent.data && recent.status === 'error') {
    return (
      <>
        <p className="pk-error" role="alert">Couldn&apos;t load recent sessions: {recent.error}</p>
        <button type="button" className="pk-btn" data-hot onClick={recent.reload}>Retry</button>
      </>
    );
  }
  if (!recent.data) return <p className="pk-muted" role="status">Loading recent sessions…</p>;
  if (recent.data.sessions.length === 0) return <p className="pk-muted">No saved sessions yet. Sit down to play your first.</p>;
  return (
    <ul className="pk-recent">
      {recent.data.sessions.map(recentSessionView).map((s) => (
        <li key={s.key}>
          <Link to={s.href} className="pk-review__link" data-hot>{s.when}</Link> {s.detail}{s.open ? ' · still open' : ''}
        </li>
      ))}
    </ul>
  );
}

/** The lobby's recent sessions with review links (spec §8.2). */
export default function RecentSessions() {
  const recent = usePokerResource(loadRecent, 'recent', '/me/poker');
  return (
    <section className="pk-box" aria-labelledby="pk-recent-title">
      <h2 id="pk-recent-title" className="pk-h2">Recent sessions</h2>
      <RecentBody recent={recent} />
    </section>
  );
}

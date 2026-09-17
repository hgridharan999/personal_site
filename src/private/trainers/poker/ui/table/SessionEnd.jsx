// src/private/trainers/poker/ui/table/SessionEnd.jsx
import { Link } from 'react-router-dom';
import { getPersona } from '../../bots/personas.js';
import { sessionSummary } from '../../lib/tableCore.js';
import { formatNetBb } from '../../lib/format.js';

/** Shown after getting up: totals and the hidden style labels of every opponent who sat in this session. */
export default function SessionEnd({ session }) {
  const { hands, net, rebuys } = sessionSummary(session, new Date().toISOString());
  const bots = session.seenPersonaIds.map((id) => getPersona(id));

  return (
    <section className="pk-end" aria-labelledby="pk-end-title">
      <h2 id="pk-end-title" className="pk-h2">Session over</h2>
      <dl className="pk-end__stats">
        <div><dt>Hands</dt><dd>{hands}</dd></div>
        <div><dt>Net</dt><dd>{formatNetBb(net)} BB</dd></div>
        <div><dt>Rebuys</dt><dd>{rebuys}</dd></div>
      </dl>
      <h3 className="pk-h3">Opponents this session</h3>
      <ul className="pk-end__bots">
        {bots.map((p) => <li key={p.id}>{p.tag} &middot; {p.name} &middot; {p.style}</li>)}
      </ul>
      <p className="pk-muted">Each hand is graded when it ends. The review fills in as hands finish saving.</p>
      <div className="pk-end__links">
        <Link to={`/me/poker/session/${encodeURIComponent(session.id)}`} className="pk-btn pk-btn--raise" data-hot>Review this session</Link>
        <Link to="/me/poker" className="pk-btn" data-hot>Back to the lobby</Link>
      </div>
    </section>
  );
}

// src/private/trainers/poker/ui/table/SessionEnd.jsx
import { Link } from 'react-router-dom';
import { getPersona } from '../../bots/personas.js';
import { sessionSummary } from '../../lib/tableCore.js';
import { formatNetBb } from '../../lib/format.js';

/** Shown after getting up: totals and the opponents' hidden style labels. */
export default function SessionEnd({ session }) {
  const { hands, net, rebuys } = sessionSummary(session, session.startedAt);
  const bots = session.seats.filter((s) => s.kind === 'bot').map((s) => getPersona(s.personaId));

  return (
    <section className="pk-end" aria-labelledby="pk-end-title">
      <h2 id="pk-end-title" className="pk-h2">Session over</h2>
      <dl className="pk-end__stats">
        <div><dt>Hands</dt><dd>{hands}</dd></div>
        <div><dt>Net</dt><dd>{formatNetBb(net)} BB</dd></div>
        <div><dt>Rebuys</dt><dd>{rebuys}</dd></div>
      </dl>
      <h3 className="pk-h3">Opponents at the table</h3>
      <ul className="pk-end__bots">
        {bots.map((p) => <li key={p.id}>{p.tag} &middot; {p.name} &middot; {p.style}</li>)}
      </ul>
      <p className="pk-muted">Sessions are not saved yet, so this session has no review.</p>
      <Link to="/me/poker" className="pk-btn pk-btn--raise" data-hot>Back to the lobby</Link>
    </section>
  );
}

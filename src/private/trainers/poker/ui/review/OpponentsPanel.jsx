import { opponentsView } from './reviewView.js';

/** Each seat's personas with their style labels, revealed after the session (spec §7.2). */
export default function OpponentsPanel({ opponents }) {
  const seats = opponentsView(opponents);
  return (
    <section className="pk-box" aria-labelledby="pk-review-opponents">
      <h2 id="pk-review-opponents" className="pk-h2">Opponents</h2>
      {seats.length === 0 ? (
        <p className="pk-muted">No opponents recorded.</p>
      ) : (
        <ul className="pk-review__opponents">
          {seats.map(({ seat, entries }) => (
            <li key={seat}>
              Seat {seat}: {entries.map((e) => `${e.tag} · ${e.name} · ${e.style}`).join(', then ')}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

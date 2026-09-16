// src/private/trainers/poker/ui/lobby/TableBuilder.jsx
import { useState } from 'react';
import { defaultLineup, validateLineup } from '../../lib/lineup.js';

// Where each bot seat sits relative to the hero at the bottom of the table.
const SEAT_PLACES = { 1: 'left', 2: 'top left', 3: 'top', 4: 'top right', 5: 'right' };

/** One persona per bot seat; a persona can only sit once. */
export default function TableBuilder({ personas, onSitDown }) {
  const [lineup, setLineup] = useState(() => defaultLineup(personas));
  const error = validateLineup(lineup, personas);

  const choose = (seat, personaId) => {
    setLineup((current) => current.map((x) => (x.seat === seat ? { seat, personaId } : x)));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!error) onSitDown(lineup);
  };

  return (
    <form className="pk-builder" onSubmit={submit}>
      <ol className="pk-builder__seats">
        {lineup.map(({ seat, personaId }) => {
          const takenElsewhere = new Set(lineup.filter((x) => x.seat !== seat).map((x) => x.personaId));
          return (
            <li key={seat} className="pk-builder__seat">
              <label htmlFor={`pk-seat-${seat}`}>Seat {seat} <span className="pk-muted">({SEAT_PLACES[seat]})</span></label>
              <select
                id={`pk-seat-${seat}`}
                className="pk-select"
                value={personaId ?? ''}
                onChange={(e) => choose(seat, e.target.value)}
              >
                {personaId === null && <option value="">Choose a bot</option>}
                {personas.map((p) => (
                  <option key={p.id} value={p.id} disabled={takenElsewhere.has(p.id)}>
                    {p.tag} &middot; {p.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ol>
      {error && <p className="pk-error" role="alert">{error}</p>}
      <button type="submit" className="pk-btn pk-btn--raise" data-hot disabled={Boolean(error)}>
        Sit down at this table
      </button>
    </form>
  );
}

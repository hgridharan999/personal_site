import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPersonas } from '../../bots/personas.js';
import { randomLineup } from '../../lib/lineup.js';

const SPEEDS = [
  { key: 'normal', label: 'Normal' },
  { key: 'fast', label: 'Fast' },
];

export default function PlayTab() {
  const navigate = useNavigate();
  const personas = useMemo(() => listPersonas(), []);
  const [speed, setSpeed] = useState('normal');

  const sitDown = (tableMode, lineup) => {
    navigate(`/me/poker/table/${crypto.randomUUID()}`, { state: { tableMode, lineup, speed } });
  };

  return (
    <div className="pk-lobby">
      <section className="pk-box" aria-labelledby="pk-random-title">
        <h2 id="pk-random-title" className="pk-h2">Sit down</h2>
        <p className="pk-muted">Five random bots. 100 BB buy-in, blinds 0.5/1 BB, rebuy any time you drop under 40 BB.</p>
        <fieldset className="pk-speed">
          <legend>Bot speed</legend>
          {SPEEDS.map(({ key, label }) => (
            <label key={key} className="pk-radio">
              <input type="radio" name="pk-speed" value={key} checked={speed === key} onChange={() => setSpeed(key)} />
              {label}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="pk-btn pk-btn--raise"
          data-hot
          onClick={() => sitDown('random', randomLineup(personas, Math.random))}
        >
          Sit down
        </button>
      </section>

      <section className="pk-box" aria-labelledby="pk-recent-title">
        <h2 id="pk-recent-title" className="pk-h2">Recent sessions</h2>
        <p className="pk-muted">Sessions are not saved yet. Your recent sessions and their reviews will be listed here.</p>
      </section>
    </div>
  );
}

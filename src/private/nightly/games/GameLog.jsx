import { useState } from 'react';
import { httpUrl } from '../../../site/notes';
import { Notice } from '../NightlyStates';
import { logInputs, readLogInputs } from './gamesLogic';

const NOTHING = { message: 'Enter at least one score.' };
const inputId = (key) => `nt-log-${key}`;

/** One game: its name links to the game, then the unit and which way is better. */
function LogField({ game, value, error, onChange }) {
  const { key, name, unit, lowerIsBetter } = game;
  const safeUrl = httpUrl(game.url);
  const id = inputId(key);
  return (
    <div className="nt-games-field">
      <label htmlFor={id} className="nt-games-label">
        {safeUrl ? (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer">
            {name}<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : name}
        <span className="nt-meta"> {unit}, {lowerIsBetter ? 'lower is better' : 'higher is better'}</span>
      </label>
      <input
        id={id}
        className="sp-input nt-games-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} className="nt-notice">{error}</p>}
    </div>
  );
}

/**
 * Tonight's scores from Hari's own daily games, prefilled with what is already logged. A bad
 * entry is marked beside its field and nothing is sent; blanks are left alone.
 */
export default function GameLog({ payload, busy, notice, onSave }) {
  const { catalog } = payload;
  const [inputs, setInputs] = useState(() => logInputs(catalog, payload.logged));
  const [errors, setErrors] = useState({});
  const [nothing, setNothing] = useState(false);
  const [saved, setSaved] = useState(false);

  const change = (key, text) => {
    setInputs((v) => ({ ...v, [key]: text }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setNothing(false);
    setSaved(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return; // Save is aria-disabled, so it can still be pressed
    const read = readLogInputs(catalog, inputs);
    setErrors(read.errors);
    setSaved(false);
    const bad = catalog.find((g) => read.errors[g.key]);
    if (bad) {
      document.getElementById(inputId(bad.key))?.focus();
      return;
    }
    setNothing(read.entries.length === 0);
    if (read.entries.length > 0 && await onSave(read.entries)) setSaved(true);
  };

  return (
    <section className="nt-games-sub" aria-labelledby="nt-games-log">
      <h3 id="nt-games-log" className="head">Your games</h3>
      <form onSubmit={save} noValidate>
        <div className="nt-games-fields">
          {catalog.map((g) => (
            <LogField key={g.key} game={g} value={inputs[g.key] ?? ''} error={errors[g.key]} onChange={(t) => change(g.key, t)} />
          ))}
        </div>
        <div className="nt-games-actions">
          <button type="submit" className="btn nt-primary" aria-disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          {saved && <p className="nt-meta">Saved</p>}
          <Notice notice={notice ?? (nothing ? NOTHING : null)} />
        </div>
      </form>
    </section>
  );
}

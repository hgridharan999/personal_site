import { pokerOutbox } from './pokerOutboxInstance.js';
import { saveStatusText } from './saveStatus.js';
import './pokerSaveStatus.css';

const DISCARD_MESSAGE = 'Discard this save? The server rejected it, so it can never be saved.';

const KIND_LABELS = { open: 'Session start', hand: 'Hand', close: 'Session close', 'stale-close': 'Session close' };

/** Outbox ids are `<kind>:<id>` (pokerOutbox.js). */
function entryLabel(id) {
  const kind = id.slice(0, id.indexOf(':'));
  return KIND_LABELS[kind] ?? 'Save';
}

function FailedEntry({ id, lastError }) {
  const label = entryLabel(id);
  const onDiscard = () => {
    if (window.confirm(DISCARD_MESSAGE)) pokerOutbox.discard(id);
  };
  return (
    <li className="pk-save__item">
      <span className="pk-error">{label}: {lastError ?? 'unknown error'}</span>
      <button type="button" className="pk-btn pk-btn--fold" aria-label={`Discard rejected save: ${label}`} onClick={onDiscard}>
        Discard
      </button>
    </li>
  );
}

/**
 * The save line above the table. Rejected saves are listed one by one with a Discard action.
 * There is no "Retry failed": the shared outbox cannot re-queue a failed entry.
 */
export default function PokerSaveStatus({ save }) {
  const text = saveStatusText(save);
  if (save.status !== 'failed') {
    return <p className={`pk-muted pk-save pk-save--${save.status}`} role="status">{text}</p>;
  }
  return (
    <div className="pk-save pk-save--failed">
      <p className="pk-error" role="alert">{text}</p>
      <ul className="pk-save__list">
        {save.failedEntries.map((entry) => <FailedEntry key={entry.id} id={entry.id} lastError={entry.lastError} />)}
      </ul>
    </div>
  );
}

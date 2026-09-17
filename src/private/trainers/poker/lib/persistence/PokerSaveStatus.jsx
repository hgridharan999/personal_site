import { useEffect, useRef, useState } from 'react';
import { pokerOutbox } from './pokerOutboxInstance.js';
import { saveStatusText } from './saveStatus.js';
import { nextSaveAnnouncement, ANNOUNCE_AFTER_MS } from './saveAnnounce.js';
import './pokerSaveStatus.css';

const DISCARD_MESSAGE = 'Discard this save? The server rejected it, so it can never be saved.';

const KIND_LABELS = { open: 'Session start', hand: 'Hand', close: 'Session close', 'stale-close': 'Session close' };

/** Outbox ids are `<kind>:<id>` (pokerOutbox.js). */
function entryLabel(id) {
  const kind = id.slice(0, id.indexOf(':'));
  return KIND_LABELS[kind] ?? 'Save';
}

function FailedEntry({ id, lastError, onDiscarded }) {
  const label = entryLabel(id);
  const onDiscard = () => {
    if (!window.confirm(DISCARD_MESSAGE)) return;
    pokerOutbox.discard(id);
    onDiscarded();
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
 * The hidden live region for a save stuck "saving" for a while (offline, or a struggling
 * connection): announced once per stretch, not once per hand, via the pure decision in
 * saveAnnounce.js. This hook only times it.
 */
function useStuckSavingAnnouncement(status) {
  const mark = useRef({ pendingSince: null, announced: false });
  const [text, setText] = useState('');

  useEffect(() => {
    if (status !== 'saving') {
      mark.current = { pendingSince: null, announced: false };
      setText('');
      return undefined;
    }
    if (mark.current.pendingSince == null) mark.current.pendingSince = Date.now();
    if (mark.current.announced) return undefined;
    const remaining = Math.max(ANNOUNCE_AFTER_MS - (Date.now() - mark.current.pendingSince), 0);
    const timer = setTimeout(() => {
      const next = nextSaveAnnouncement(mark.current, status, Date.now());
      mark.current = next.mark;
      if (next.text) setText(next.text);
    }, remaining);
    return () => clearTimeout(timer);
  }, [status]);

  return text;
}

/**
 * The save line above the table. Only the failure alert is announced (role="alert"): the
 * saving/saved states stay silent on every hand, since role="status" there queued a polite
 * announcement competing with the table's own ActionLog announcements. A save stuck "saving" for
 * a while (offline) still gets one quiet announcement, via the hidden live region below.
 *
 * Rejected saves are listed one by one with their own Discard action; the alert states the count
 * only, leaving each entry's error to its row. There is no "Retry failed": the shared outbox
 * cannot re-queue a failed entry.
 *
 * After a confirmed discard, focus moves to this container (or the table region, if this one is
 * gone), so keyboard focus never drops to <body>.
 */
export default function PokerSaveStatus({ save }) {
  const text = saveStatusText(save);
  const container = useRef(null);
  const [refocus, setRefocus] = useState(false);
  const stuckText = useStuckSavingAnnouncement(save.status);

  useEffect(() => {
    if (!refocus) return;
    setRefocus(false);
    const target = container.current ?? document.querySelector('.pk-table-region');
    target?.focus({ preventScroll: true });
  }, [refocus]);

  return (
    <div ref={container} tabIndex={-1} className={`pk-save pk-save--${save.status}`}>
      {save.status === 'failed' ? (
        <>
          <p className="pk-error" role="alert">{text}</p>
          <ul className="pk-save__list">
            {save.failedEntries.map((entry) => (
              <FailedEntry key={entry.id} id={entry.id} lastError={entry.lastError} onDiscarded={() => setRefocus(true)} />
            ))}
          </ul>
        </>
      ) : (
        <p className="pk-muted">{text}</p>
      )}
      <p className="pk-sr-only" aria-live="polite">{stuckText}</p>
    </div>
  );
}

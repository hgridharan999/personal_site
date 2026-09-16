// src/private/trainers/poker/ui/table/ActionLog.jsx
import { useEffect, useRef, useState } from 'react';

const NO_LINES = [];

/**
 * Collapsible log of the current hand, plus the aria-live region that announces each new line.
 * `session` is a hero-safe snapshot (lib/tableSnapshot.js), whose hand carries the log lines.
 */
export default function ActionLog({ session, yourTurn }) {
  const [open, setOpen] = useState(true);
  const list = useRef(null);
  const { hand } = session;
  const lines = hand ? hand.log : NO_LINES;

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lines, open]);

  const announcement = [lines.at(-1), yourTurn && 'Your turn'].filter(Boolean).join('. ');

  return (
    <aside className="pk-log" aria-label="Action log">
      <button
        type="button"
        className="pk-log__toggle"
        data-hot
        aria-expanded={open}
        aria-controls="pk-log-list"
        onClick={() => setOpen((value) => !value)}
      >
        Log {open ? '−' : '+'}
      </button>
      {open && (
        <ol id="pk-log-list" ref={list} className="pk-log__list">
          {hand && <li className="pk-log__hand">Hand #{hand.no}</li>}
          {lines.map((line, i) => <li key={`${hand.no}-${i}`}>{line}</li>)}
        </ol>
      )}
      <p className="pk-sr-only" aria-live="polite">{announcement}</p>
    </aside>
  );
}

// src/private/trainers/poker/ui/table/ActionLog.jsx
import { useEffect, useRef, useState } from 'react';
import { newAnnouncement } from '../../lib/announce.js';

const NO_LINES = [];

/**
 * What the live region says: every line added since the last announcement (lib/announce.js), kept
 * until more lines arrive. Render only reads the refs; the effect records what was announced, so a
 * re-render or StrictMode double render never drops or repeats lines.
 */
function useAnnouncement(lines, handNo) {
  const mark = useRef(null);
  const spoken = useRef('');
  const { text } = newAnnouncement(mark.current, lines, handNo);
  const current = text || spoken.current;
  useEffect(() => {
    mark.current = newAnnouncement(mark.current, lines, handNo).mark;
    spoken.current = current;
  }, [lines, handNo, current]);
  return current;
}

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

  const spoken = useAnnouncement(lines, hand ? hand.no : 0);
  const announcement = [spoken, yourTurn && 'Your turn'].filter(Boolean).join('. ');

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

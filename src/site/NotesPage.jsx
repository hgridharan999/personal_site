import { useCallback, useEffect, useRef, useState } from 'react';

import { NBSP } from '../home/content';
import SiteShell from './SiteShell';
import { formatLongDate } from './format';
import { httpUrl, readNotes } from './notes';
import './notes.css';

// Nothing here comes from src/private: the fetch is written out below so the public bundle
// carries none of the private nightly code.
const NOTES_URL = '/api/nightly?action=notes';

/** The notes feed: 'loading', then 'ready' or 'empty', or 'error' with a retry. */
function useNotes() {
  const [state, setState] = useState({ status: 'loading', notes: [] });

  const load = useCallback(async (signal) => {
    setState({ status: 'loading', notes: [] });
    try {
      const res = await fetch(NOTES_URL, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const notes = readNotes(await res.json());
      setState({ status: notes.length > 0 ? 'ready' : 'empty', notes });
    } catch (err) {
      if (err?.name !== 'AbortError') setState({ status: 'error', notes: [] });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { ...state, retry: () => load() };
}

function Note({ note }) {
  // readNotes already drops a non-http(s) url; checking again here keeps the href safe on its own.
  const safeUrl = httpUrl(note.url);
  return (
    <li>
      <article className="sp-note">
        <time className="sp-note-date" dateTime={note.date}>{formatLongDate(note.date)}</time>
        <p className="sp-note-body">{note.body}</p>
        {safeUrl && (
          <p className="sp-note-on">
            On:{' '}
            <a href={safeUrl} target="_blank" rel="noopener noreferrer">
              {note.headline ?? note.source ?? 'the story'}
              <span aria-hidden="true">{NBSP}↗</span>
              <span className="sr-only">{note.source ? `, ${note.source}` : ''}, opens in a new tab</span>
            </a>
          </p>
        )}
      </article>
    </li>
  );
}

/** The one status line, always on the page so each change is announced. */
function statusLine(status, count) {
  if (status === 'loading') return { text: 'Loading notes…', className: 'sp-status' };
  if (status === 'empty') return { text: 'No notes yet.', className: 'sp-text' };
  if (status === 'error') return { text: 'Could not load the notes.', className: 'sp-text' };
  return { text: count === 1 ? '1 note.' : `${count} notes.`, className: 'sr-only' };
}

/** Short public takes, one a night, published from the private nightly page. Newest first. */
export default function NotesPage() {
  const { status, notes, retry } = useNotes();
  const statusRef = useRef(null);
  const line = statusLine(status, notes.length);
  // Try again goes away the moment it is pressed: focus moves to the status line, which stays.
  const onRetry = () => {
    statusRef.current?.focus();
    retry();
  };

  return (
    <SiteShell title="Notes" intro="Short takes, one a night.">
      <section aria-label="Notes">
        <div className="sp-notes-state">
          <p ref={statusRef} className={line.className} role="status" tabIndex={-1}>{line.text}</p>
          {status === 'error' && <button type="button" className="btn btn-line" onClick={onRetry}>Try again</button>}
        </div>
        {status === 'ready' && (
          <ol role="list" className="sp-notes">
            {notes.map((note) => <Note key={note.date} note={note} />)}
          </ol>
        )}
      </section>
    </SiteShell>
  );
}

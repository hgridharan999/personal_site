import { useCallback, useEffect, useState } from 'react';

import { NBSP } from '../home/content';
import SiteShell from './SiteShell';
import { formatLongDate } from './format';
import { readNotes } from './notes';
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
  return (
    <li>
      <article className="sp-note">
        <time className="sp-note-date" dateTime={note.date}>{formatLongDate(note.date)}</time>
        <p className="sp-note-body">{note.body}</p>
        {note.url && (
          <p className="sp-note-on">
            On:{' '}
            <a href={note.url} target="_blank" rel="noopener noreferrer">
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

/** Short public takes, one a night, published from the private nightly page. Newest first. */
export default function NotesPage() {
  const { status, notes, retry } = useNotes();

  return (
    <SiteShell title="Notes" intro="Short takes, one a night.">
      <section aria-label="Notes" aria-busy={status === 'loading'}>
        {status === 'loading' && <p className="sp-status" role="status">Loading notes…</p>}
        {status === 'empty' && <p className="sp-text">No notes yet.</p>}
        {status === 'error' && (
          <div className="sp-notes-fail" role="alert">
            <p className="sp-text">Could not load the notes.</p>
            <button type="button" className="btn btn-line" onClick={retry}>Try again</button>
          </div>
        )}
        {status === 'ready' && (
          <ol role="list" className="sp-notes">
            {notes.map((note) => <Note key={note.date} note={note} />)}
          </ol>
        )}
      </section>
    </SiteShell>
  );
}

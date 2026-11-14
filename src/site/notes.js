// Reads the public notes feed (GET /api/nightly?action=notes) into what NotesPage renders. Lives in
// src/site, not src/private, so the public bundle carries none of the private nightly code.

const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null);

/**
 * The URL itself when it is an absolute http(s) URL, else null. Model and database URLs pass
 * through this before they become an href: a schema's URL check accepts javascript: and data:,
 * and React does not block them. The prefix test runs on the raw string, so leading spaces or
 * control characters (which a browser strips before reading the scheme) fail it too.
 */
export function httpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** `{ notes: [...] }` to a list of `{ date, body, headline, url, source }`, newest first. */
export function readNotes(data) {
  const rows = Array.isArray(data?.notes) ? data.notes : [];
  return rows
    .filter((row) => text(row?.date) && text(row?.body))
    .map((row) => ({
      date: row.date,
      body: row.body,
      headline: text(row.headline),
      url: httpUrl(row.url),
      source: text(row.source),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

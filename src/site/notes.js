// Reads the public notes feed (GET /api/nightly?action=notes) into what NotesPage renders. Lives in
// src/site, not src/private, so the public bundle carries none of the private nightly code.

const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null);
const httpUrl = (value) => (typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null);

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

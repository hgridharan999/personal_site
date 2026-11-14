import { describe, it, expect } from 'vitest';
import { httpUrl, readNotes } from './notes';

const note = (date, extra = {}) => ({ date, body: `take of ${date}`, headline: 'A headline', url: 'https://example.com/a', source: 'Example', ...extra });

describe('readNotes', () => {
  it('returns the notes newest first', () => {
    const notes = readNotes({ notes: [note('2026-11-10'), note('2026-11-12'), note('2026-11-11')] });
    expect(notes.map((n) => n.date)).toEqual(['2026-11-12', '2026-11-11', '2026-11-10']);
  });

  it('is an empty list for a missing or malformed payload', () => {
    expect(readNotes(null)).toEqual([]);
    expect(readNotes({})).toEqual([]);
    expect(readNotes({ notes: 'nope' })).toEqual([]);
  });

  it('drops entries without a date or a body, and keeps a note whose story link is missing', () => {
    const notes = readNotes({ notes: [note('2026-11-12', { body: '' }), { body: 'x' }, note('2026-11-11', { url: null, headline: null })] });
    expect(notes).toEqual([{ date: '2026-11-11', body: 'take of 2026-11-11', headline: null, url: null, source: 'Example' }]);
  });

  it('drops a link that is not http(s), so a bad row cannot become a javascript: link', () => {
    const [only] = readNotes({ notes: [note('2026-11-12', { url: 'javascript:alert(1)' })] });
    expect(only.url).toBeNull();
  });
});

describe('httpUrl', () => {
  it('keeps http and https URLs as given', () => {
    expect(httpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(httpUrl('HTTP://example.com')).toBe('HTTP://example.com');
  });

  it('rejects script, data and other schemes, including the disguised ones a browser would still run', () => {
    for (const bad of [
      'javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', '\tjavascript:alert(1)',
      'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd',
      'mailto:a@b.c', '//example.com', '/relative', 'https//missing-colon', '', null, undefined, 42, {},
    ]) {
      expect(httpUrl(bad), String(bad)).toBeNull();
    }
  });
});

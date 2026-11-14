import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static check: a URL that came from the model or the database only reaches an href after
// httpUrl() has passed it, so a javascript: or data: URL renders as text, not as a link.
const DIR = fileURLToPath(new URL('./', import.meta.url));
const SITE = fileURLToPath(new URL('../../site/', import.meta.url));
const read = (file) => readFileSync(file, 'utf8');

const nightlyJsx = readdirSync(DIR).filter((f) => f.endsWith('.jsx')).map((f) => [f, read(DIR + f)]);

describe('model and database URLs', () => {
  it('finds the brief and its link', () => {
    expect(nightlyJsx.map(([f]) => f)).toContain('NightlyBrief.jsx');
  });

  it('passes every dynamic href in src/private/nightly through httpUrl', () => {
    const offenders = nightlyJsx.flatMap(([file, src]) => [...src.matchAll(/href=\{([^}]+)\}/g)]
      .map((m) => m[1].trim())
      .filter((expr) => !/^safe\w*$/.test(expr))
      .map((expr) => `${file}: href={${expr}}`));
    expect(offenders).toEqual([]);
  });

  it('checks the brief URLs with the shared httpUrl and falls back to text', () => {
    const brief = read(DIR + 'NightlyBrief.jsx');
    expect(brief).toMatch(/import \{ httpUrl \} from '\.\.\/\.\.\/site\/notes'/);
    expect(brief).toMatch(/const safe\w* = httpUrl\(/);
  });

  it('reads the notes feed through readNotes, which runs httpUrl on every url', () => {
    expect(read(SITE + 'NotesPage.jsx')).toMatch(/readNotes\(/);
    expect(read(SITE + 'notes.js')).toMatch(/url: httpUrl\(row\.url\)/);
  });

  it('checks the note link with httpUrl again where it becomes an href', () => {
    const page = read(SITE + 'NotesPage.jsx');
    expect(page).toMatch(/const safeUrl = httpUrl\(note\.url\)/);
    const hrefs = [...page.matchAll(/href=\{([^}]+)\}/g)].map((m) => m[1].trim());
    expect(hrefs).toEqual(['safeUrl']);
  });
});

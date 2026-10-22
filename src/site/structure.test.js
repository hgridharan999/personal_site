import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks on how the restyled pages are put together. Each file is read as text, so this
// runs in vitest's node environment without rendering React.
const SRC = fileURLToPath(new URL('../', import.meta.url));
const SITE = join(SRC, 'site');
const read = (file) => readFileSync(file, 'utf8');
const rel = (file) => file.replace(SRC, '').replaceAll('\\', '/');

const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

const LEGAL = join(SRC, 'pages', 'LegalPage.jsx');
const siteFiles = walk(SITE);
// the pages App.jsx serves from the shell, plus the legal page, which was restyled in place
const ROUTED = [
  join(SITE, 'hiking', 'HikingPage.jsx'),
  join(SITE, 'WritingPage.jsx'),
  join(SITE, 'PostPage.jsx'),
  join(SITE, 'climate', 'ClimateSearchPage.jsx'),
  LEGAL,
];
// everything that ships; tests are left out because they name the modules they forbid
const shipped = [...siteFiles.filter((file) => /\.(jsx?|css)$/.test(file) && !file.endsWith('.test.js')), LEGAL];
const shippedScripts = shipped.filter((file) => /\.jsx?$/.test(file));

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the restyled pages leave the dark Ascent machinery behind', () => {
  const FORBIDDEN = /SubShell|PageShell|Cursor|PageInstrument|ascent\.css|lib\/gsap|gsap|lenis|framer-motion|zdog|useUnifiedFeed/;
  const SPECIFIER = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

  it('finds the files to check', () => {
    expect(shippedScripts.length).toBeGreaterThan(4);
  });

  it('imports none of the old shells, cursor, animation libraries or the unified feed', () => {
    const offenders = shippedScripts.flatMap((file) => (
      [...stripComments(read(file)).matchAll(SPECIFIER)]
        .map((match) => match[1] ?? match[2] ?? match[3])
        .filter((specifier) => FORBIDDEN.test(specifier))
        .map((specifier) => `${rel(file)} imports ${specifier}`)
    ));
    expect(offenders).toEqual([]);
  });

  it('never writes to document.body.style (the shell owns the document)', () => {
    const offenders = shippedScripts.filter((file) => /document\.body\.style/.test(stripComments(read(file))));
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe('every routed page sits in the shell', () => {
  it.each(ROUTED)('%s renders <SiteShell', (file) => {
    expect(read(file)).toContain('<SiteShell');
  });

  it('SiteShell turns the document light and sets the tab title', () => {
    const shell = read(join(SITE, 'SiteShell.jsx'));
    expect(shell).toContain('useHomeDocument(');
    expect(shell).toContain('useDocumentTitle(');
  });
});

describe('the legal page', () => {
  const source = read(LEGAL);

  it('labels each section by its own h2, with ids a link can land on', () => {
    for (const id of ['privacy', 'cookies', 'terms', 'contact']) {
      expect(source, id).toContain("id: '" + id + "'");
    }
    expect(source).toMatch(/<section key={id} aria-labelledby={id}>/);
    expect(source).toMatch(/<h2 className="head" id={id}>/);
  });

  it('uses only shell classes, with no Tailwind left', () => {
    const classes = [...source.matchAll(/className="([^"]+)"/g)].flatMap((match) => match[1].split(' '));
    expect([...new Set(classes)].sort()).toEqual(['head', 'sp-text']);
  });
});

describe('source hygiene', () => {
  const EM_DASH = String.fromCodePoint(0x2014);

  it('has no em dash in the site files, the legal page or index.html', () => {
    const files = [
      ...siteFiles.filter((file) => /\.(jsx?|css)$/.test(file)),
      LEGAL,
      join(SRC, '..', 'index.html'),
    ];
    expect(files.filter((file) => read(file).includes(EM_DASH)).map(rel)).toEqual([]);
  });
});

describe('the state list', () => {
  // Read inside each test, so a missing StateList fails these tests instead of the whole file.
  const summariesOf = () => {
    const source = stripComments(read(join(SITE, 'hiking', 'StateList.jsx')));
    return [...source.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].map((match) => match[1]);
  };

  it('has a summary to check', () => {
    expect(summariesOf().length).toBeGreaterThan(0);
  });

  it('keeps links and buttons out of the <summary>, which is itself the button', () => {
    for (const summary of summariesOf()) {
      expect(summary).not.toMatch(/<a\b|<Link\b|<SmartLink\b|<button\b|<Button\b/);
    }
  });
});

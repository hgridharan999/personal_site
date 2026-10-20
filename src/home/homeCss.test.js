import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOME_DIR = fileURLToPath(new URL('./', import.meta.url));
const raw = readFileSync(`${HOME_DIR}home.css`, 'utf8');

const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/** Removes each `@keyframes name { ... }` block, matching braces so nested stops are removed too. */
function stripKeyframes(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const start = css.indexOf('@keyframes', i);
    if (start === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, start);
    let depth = 0;
    let j = css.indexOf('{', start);
    do {
      if (css[j] === '{') depth += 1;
      if (css[j] === '}') depth -= 1;
      j += 1;
    } while (depth > 0 && j < css.length);
    i = j;
  }
  return out;
}

/** Splits at commas that are not inside (...), so :has(a, b) stays one selector. */
function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** Every selector in the file (inside @media and @supports too); declaration bodies are skipped. */
function selectorsIn(css) {
  const selectors = [];
  let buffer = '';
  for (const char of css) {
    if (char === '{') {
      const prelude = buffer.trim();
      if (prelude && !prelude.startsWith('@')) selectors.push(...splitSelectors(prelude));
      buffer = '';
    } else if (char === '}' || char === ';') {
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return selectors;
}

/** Every style rule as { prelude, body }, whitespace in the selector list collapsed. */
function rulesIn(source) {
  const rules = [];
  let buffer = '';
  let prelude = null;
  for (const char of source) {
    if (char === '{') {
      prelude = buffer.trim().replace(/\s+/g, ' ');
      buffer = '';
    } else if (char === '}') {
      if (prelude !== null && !prelude.startsWith('@')) rules.push({ prelude, body: buffer.trim() });
      prelude = null;
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return rules;
}

const css = stripKeyframes(withoutComments);
const selectors = selectorsIn(css);

describe('home.css scoping', () => {
  it('parses a realistic number of selectors (the checks below are not vacuous)', () => {
    expect(selectors.length).toBeGreaterThan(100);
    expect(selectors).toContain('.hm .xp:hover .xp-mark');
  });

  it('starts every selector with the .hm root or html.hm-page', () => {
    const offenders = selectors.filter((selector) => !/^(\.hm|html\.hm-page)(?![\w-])/.test(selector));
    expect(offenders).toEqual([]);
  });

  it('keeps the document-level rules from the port design', () => {
    const documentRules = selectors.filter((selector) => selector.startsWith('html.hm-page'));
    expect(documentRules).toEqual(expect.arrayContaining([
      'html.hm-page',
      'html.hm-page body',
      'html.hm-page body::before',
      'html.hm-page *',
      'html.hm-page ::-webkit-scrollbar-track',
      'html.hm-page ::-webkit-scrollbar-thumb',
    ]));
  });

  it('prefixes every keyframe name with hm- and uses each of them', () => {
    const names = [...withoutComments.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
    expect(names.sort()).toEqual(
      ['hm-hiker-ink', 'hm-scene-ink', 'hm-tri-in', 'hm-trail-open', 'hm-trail-text'].sort(),
    );
    for (const name of names) {
      expect(css, name).toMatch(new RegExp(`animation:[^;]*\\b${name}\\b`));
    }
  });

  it('leaves the ending to band.css', () => {
    const offenders = selectors.filter((selector) => /\.(band|deep)\b|\.deep-|motion-toggle/.test(selector));
    expect(offenders).toEqual([]);
  });

  it('keeps the tokens on .hm rather than :root', () => {
    expect(selectors).not.toContain(':root');
    expect(css).toMatch(/\.hm\s*\{[^}]*--tan:/);
  });
});

describe('home.css leaves the mockup-only machinery behind', () => {
  const REMOVED = [
    'typepick', 'data-font', 'data-copy', 'data-asks', 'data-mtn', 'data-case',
    'c-hari', 'c-panel', 'mark.ask', 'ask-dep', 'ask-alt', '.ask',
    'contour', 'beliefs', 'decide', 'margin-fig', 'finale', 'has-fig',
    'row--solo', 'row--act', 'scene--full', 'scene--mtn', '.co::after',
  ];

  it.each(REMOVED)('has no %s', (term) => {
    expect(css).not.toContain(term);
  });

  it('has no .pos, .foot, .scale or .bar rules', () => {
    const offenders = selectors.filter((selector) => /\.(pos|scale|bar)\b|\.foot/.test(selector));
    expect(offenders).toEqual([]);
  });
});

describe('home.css fonts', () => {
  // Geist and Instrument Serif are the only web fonts; index.html loads them. The two system
  // names are fallbacks that show for a moment while those fonts swap in.
  const ALLOWED = new Set(['Geist', 'Instrument Serif', 'Times New Roman', 'Segoe UI']);
  const fontDeclarations = [...css.matchAll(/(?:--sans|--serif|font-family|font)\s*:\s*([^;}]+)/g)];

  it('declares fonts somewhere (the check is not vacuous)', () => {
    expect(fontDeclarations.length).toBeGreaterThan(10);
  });

  it('names only Geist and Instrument Serif, plus system fallbacks', () => {
    const named = fontDeclarations.flatMap((match) => [...match[1].matchAll(/["']([^"']+)["']/g)]).map((m) => m[1]);
    const offenders = named.filter((family) => !ALLOWED.has(family));
    expect(offenders).toEqual([]);
    expect(named).toEqual(expect.arrayContaining(['Geist', 'Instrument Serif']));
  });

  it('does not load fonts itself (index.html owns the <link>)', () => {
    expect(css).not.toMatch(/@import|@font-face/);
  });
});

describe('home.css covers the classes the components use', () => {
  const sources = readdirSync(HOME_DIR)
    .filter((file) => file.endsWith('.jsx'))
    .map((file) => ({ file, text: readFileSync(`${HOME_DIR}${file}`, 'utf8') }));

  // Literal class strings only: className="a b", className={`ink ${x}`}, and the className:/cls:
  // fields the SVG components keep in data tables. The part before ${ is the static prefix.
  const CLASS_PATTERN = /(?:className=|className:\s*|cls:\s*)(?:"([^"]+)"|'([^']+)'|\{`([^`$]+)[`$])/g;
  const used = sources.flatMap(({ file, text }) => [...text.matchAll(CLASS_PATTERN)]
    .flatMap((match) => (match[1] ?? match[2] ?? match[3]).split(/\s+/).filter(Boolean).map((cls) => ({ file, cls }))));

  it('finds the class names to check', () => {
    expect(used.length).toBeGreaterThan(50);
  });

  it('defines every class named in a component', () => {
    const missing = used.filter(({ cls }) => !new RegExp(`\\.${cls}(?![\\w-])`).test(css));
    expect(missing).toEqual([]);
  });
});

describe('home.css: rows that open', () => {
  /** The declaration text of the first rule whose selector list is exactly `selector`. */
  const declarationsOf = (selector) => rulesIn(css).find((rule) => rule.prelude === selector)?.body ?? null;

  it('draws the open/close mark at full opacity at rest (WCAG 1.4.11)', () => {
    const mark = declarationsOf('.hm .xp-mark');
    expect(mark).toContain('linear-gradient');
    expect(mark).not.toMatch(/opacity/);
  });

  it('redraws the mark in CanvasText when Windows forced colors strips backgrounds', () => {
    const forced = css.match(/@media \(forced-colors: active\)[^{]*\{[^{]*\.hm \.xp-mark \{([^}]*)\}/);
    expect(forced).not.toBeNull();
    expect(forced[1]).toContain('forced-color-adjust: none');
    expect(forced[1]).toContain('CanvasText');
  });

  it('turns the mark into a cross from the details state, and fades it on row hover', () => {
    expect(selectors).toContain('.hm .xp:has(details[open]) .xp-mark');
    expect(selectors).toContain('.hm .xp:has(details[open]):not(:hover):not(:has(:focus-visible)) .xp-mark');
  });

  it('keeps nothing in the summary except the one-liner: no company or mark selectors', () => {
    const offenders = selectors.filter((selector) => /summary/.test(selector) && /\.(co|org|ttl|xp-mark)\b/.test(selector));
    expect(offenders).toEqual([]);
  });

  it('gives the title line a pointer cursor, since a click on it opens the row', () => {
    expect(declarationsOf('.hm .xp-head')).toContain('cursor: pointer');
  });

  it('keeps the summary focus ring', () => {
    expect(declarationsOf('.hm .xp summary:focus-visible')).toMatch(/outline: 2px solid/);
  });

  it('draws company link underlines dark enough to see', () => {
    expect(declarationsOf('.hm a.org')).toContain('text-decoration-color: rgba(26, 26, 24, 0.35)');
    expect(declarationsOf('.hm .line a.org, .hm .body a.org')).toContain('rgba(110, 109, 104, 0.45)');
  });
});

describe('components: structure the CSS depends on', () => {
  const source = (file) => readFileSync(`${HOME_DIR}${file}`, 'utf8');

  it('keeps links and the title out of the <summary> (axe: nested-interactive)', () => {
    // The doc comment above XpRow mentions <summary> too, so take the last opening tag, which is the markup.
    const rows = source('rows.jsx');
    const start = rows.lastIndexOf('<summary>');
    const end = rows.indexOf('</summary>', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(rows.slice(start, end)).not.toMatch(/<a\b|<Link\b|<SmartLink\b|<Ttl\b/);
  });

  it('puts the title line before the <details> inside each row', () => {
    const row = source('rows.jsx').match(/<li className="row xp">([\s\S]*?)<\/li>/)[1];
    expect(row.indexOf('className="xp-head"')).toBeGreaterThan(-1);
    expect(row.indexOf('className="xp-head"')).toBeLessThan(row.indexOf('<details>'));
  });

  it('renders the sub-labels in Writing as h3 headings (WCAG 1.3.1)', () => {
    const writing = source('WritingSection.jsx');
    expect(writing).toMatch(/<h3 className="kicker kicker--sub">\{memos\.label\}<\/h3>/);
    expect(writing).toMatch(/<h3 className="kicker kicker--sub">\{essaysLabel\}<\/h3>/);
  });
});

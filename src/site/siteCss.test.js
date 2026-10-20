import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks on the CSS the restyled pages share. Files are read as text, so this runs in
// vitest's node environment. The same parsing ideas as src/home/homeCss.test.js, pointed at src/site.
const SRC = fileURLToPath(new URL('../', import.meta.url));
const SITE = join(SRC, 'site');
const read = (file) => readFileSync(file, 'utf8');

const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

const siteFiles = walk(SITE);
const cssFiles = siteFiles.filter((file) => file.endsWith('.css'));
const jsxFiles = [...siteFiles.filter((file) => file.endsWith('.jsx')), join(SRC, 'pages', 'LegalPage.jsx')];
const scriptFiles = siteFiles.filter((file) => /\.jsx?$/.test(file) && !file.endsWith('.test.js'));

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const siteCss = cssFiles.map((file) => stripComments(read(file))).join('\n');
const homeCss = stripComments(read(join(SRC, 'home', 'home.css')));

/** Removes each `@keyframes name { ... }` block, matching braces so nested stops go too. */
function stripKeyframes(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const start = css.indexOf('@keyframes', i);
    if (start === -1) return out + css.slice(i);
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

/** Splits at commas outside (...), so :has(a, b) stays one selector. */
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

/** Every selector in the css, inside @media and @supports too; declaration bodies are skipped. */
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

const selectors = selectorsIn(stripKeyframes(siteCss));

describe('site css scoping', () => {
  it('finds the css to check (the checks below are not vacuous)', () => {
    expect(cssFiles.some((file) => file.endsWith('site.css'))).toBe(true);
    expect(selectors.length).toBeGreaterThan(30);
    expect(selectors).toContain('.sp .sp-title');
  });

  it('starts every selector with .sp or an sp- class', () => {
    expect(selectors.filter((selector) => !/^\.sp(?![\w])/.test(selector))).toEqual([]);
  });

  it('prefixes every keyframe with sp- and uses each of them', () => {
    const names = [...siteCss.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
    expect(names.filter((name) => !name.startsWith('sp-'))).toEqual([]);
    for (const name of names) {
      expect(siteCss, name).toMatch(new RegExp(`animation(?:-name)?\\s*:[^;}]*\\b${name}\\b`));
    }
  });

  it('has no !important, @import or @font-face (index.html and fonts.css own the fonts)', () => {
    expect(siteCss).not.toMatch(/!\s*important/);
    expect(siteCss).not.toMatch(/@import|@font-face/);
  });

  it('carries nothing over from the old Ascent look', () => {
    const sources = [siteCss, ...jsxFiles.map(read)].join('\n');
    expect(sources).not.toMatch(/\basc-|bg-paper|tech-bubble/);
  });
});

describe('site css ownership', () => {
  // Page stylesheets stay loaded after you leave the page, so two of them defining the same
  // class would restyle each other (hiking and climate search both wanting .sp-stats, say).
  // Shared classes live in site.css; anything else belongs to exactly one file.
  const classesByFile = new Map(cssFiles.map((file) => [
    file,
    new Set(selectorsIn(stripKeyframes(stripComments(read(file)))).flatMap((s) => [...s.matchAll(/\.(sp-[\w-]+)/g)].map((m) => m[1]))),
  ]));
  const shared = classesByFile.get(join(SITE, 'site.css')) ?? new Set();

  it('defines each page class in one stylesheet only', () => {
    const owners = new Map();
    for (const [file, classes] of classesByFile) {
      for (const cls of classes) {
        if (!shared.has(cls)) owners.set(cls, [...(owners.get(cls) ?? []), file.replace(SRC, '')]);
      }
    }
    const clashes = [...owners].filter(([, files]) => files.length > 1).map(([cls, files]) => `${cls}: ${files.join(', ')}`);
    expect(clashes).toEqual([]);
  });
});

describe('site css fonts', () => {
  const QUOTED = new Set(['Geist', 'Instrument Serif', 'Times New Roman', 'Segoe UI']);
  const GENERIC = new Set([
    'ui-sans-serif', 'system-ui', '-apple-system', 'Roboto', 'sans-serif', 'serif', 'ui-monospace', 'monospace',
    'inherit',
  ]);
  const declarations = [...siteCss.matchAll(/(?:^|[;{\s])(font-family|font)\s*:\s*([^;}]+)/g)];

  /** The family list of a `font` shorthand (after the size and line-height) or a `font-family` value. */
  function families(property, value) {
    const list = property === 'font'
      ? value.replace(/clamp\([^)]*\)/g, '1px').match(/\d[\d.]*(?:px|em|rem|%|vw)(?:\/[\d.]+(?:px|em|rem|%)?)?\s+(.+)$/)?.[1]
      : value;
    return list ? splitSelectors(list) : [];
  }

  it('sets fonts somewhere (the check is not vacuous)', () => {
    expect(declarations.length).toBeGreaterThan(5);
  });

  it('names only Geist, Instrument Serif and system fallbacks', () => {
    const offenders = declarations.flatMap(([, property, value]) => families(property, value.trim()))
      .filter((family) => {
        const name = family.replace(/^["']|["']$/g, '');
        return !(QUOTED.has(name) || GENERIC.has(name) || /^var\(--(?:sans|serif)\)$/.test(name));
      });
    expect(offenders).toEqual([]);
  });
});

/** Class names a JSX file writes literally: className="a b", className={`a ${x}`}, className={y ? 'a' : 'b'}. */
function classNamesIn(source) {
  const quoted = (text) => [...text.matchAll(/(['"])(.*?)\1/g)].map((match) => match[2]);
  const literals = [];
  for (const match of source.matchAll(/className=/g)) {
    let i = match.index + match[0].length;
    const open = source[i];
    if (open === '"' || open === "'") {
      literals.push(source.slice(i + 1, source.indexOf(open, i + 1)));
    } else if (open === '{') {
      let depth = 0;
      const start = i;
      do {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') depth -= 1;
        i += 1;
      } while (depth > 0 && i < source.length);
      const expression = source.slice(start + 1, i - 1);
      for (const part of expression.matchAll(/\$\{([^{}]*)\}/g)) literals.push(...quoted(part[1]));
      const bare = expression.replace(/\$\{[^{}]*\}/g, ' ');
      literals.push(...quoted(bare));
      for (const template of bare.matchAll(/`([^`]*)`/g)) literals.push(template[1]);
    }
  }
  for (const match of source.matchAll(/\b(?:cls|className):\s*(['"])(.*?)\1/g)) literals.push(match[2]);
  return literals.flatMap((text) => text.split(/\s+/)).filter((token) => /^[A-Za-z_][\w-]*$/.test(token));
}

describe('site components use only classes that exist', () => {
  // A page's stylesheet stays loaded after you leave it, so a class that only another page defines
  // would look right in development and be unstyled (or restyled) depending on the visit order.
  // Each component may therefore use home.css, site.css and the css beside it, nothing else.
  const sharedCss = `${homeCss}\n${stripComments(read(join(SITE, 'site.css')))}`;
  const cssBeside = (file) => cssFiles.filter((css) => dirname(css) === dirname(file))
    .map((css) => stripComments(read(css))).join('\n');
  const definedFor = (file) => stripKeyframes(`${sharedCss}\n${cssBeside(file)}`);
  const used = jsxFiles.flatMap((file) => classNamesIn(read(file)).map((cls) => ({ file, cls })));

  it('finds the class names to check', () => {
    expect(used.length).toBeGreaterThan(15);
    expect(used.map(({ cls }) => cls)).toEqual(expect.arrayContaining(['sp-title', 'sp-wide', 'head', 'sp-text']));
  });

  it('defines every class a component names, in home.css, site.css or the css beside it', () => {
    const missing = used.filter(({ file, cls }) => !new RegExp(`\\.${cls}(?![\\w-])`).test(definedFor(file)))
      .map(({ file, cls }) => `${file.slice(SRC.length)}: ${cls}`);
    expect(missing).toEqual([]);
  });
});

describe('site css is loaded', () => {
  const imported = new Set(scriptFiles.flatMap((file) => (
    [...read(file).matchAll(/import\s+['"](\.[^'"]+\.css)['"]/g)].map((match) => resolve(dirname(file), match[1]))
  )));

  it('imports every css file from a component', () => {
    expect(cssFiles.filter((file) => !imported.has(file)).map((file) => file.slice(SRC.length))).toEqual([]);
  });
});

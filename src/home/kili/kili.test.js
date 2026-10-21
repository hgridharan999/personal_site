import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Static checks on the ending's source: the stylesheet is scoped and complete, the heavy parts
// stay out of the main bundle, and the house style holds (no em dashes anywhere).

const KILI_DIR = fileURLToPath(new URL('./', import.meta.url));
const HOME_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(`${KILI_DIR}${file}`, 'utf8');
const files = readdirSync(KILI_DIR);
const EM_DASH = new RegExp(String.fromCharCode(0x2014));

const css = read('kili.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector in the stylesheet (inside @media too), declaration bodies skipped. */
function selectorsIn(source) {
  const out = [];
  let buffer = '';
  for (const char of source) {
    if (char === '{') {
      const prelude = buffer.trim();
      if (prelude && !prelude.startsWith('@')) out.push(...prelude.split(',').map((s) => s.trim()));
      buffer = '';
    } else if (char === '}' || char === ';') buffer = '';
    else buffer += char;
  }
  return out;
}

const selectors = selectorsIn(css);

/** The declaration text of the first rule whose selector list is exactly `selector`. */
function declarationsOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

describe('kili.css', () => {
  it('sets Next climb a little further from the section above it than the 52px between sections', () => {
    expect(css).toMatch(/\.hm main > section\.kili-next \{ padding-top: 76px; \}/);
  });

  it('parses a realistic number of selectors (the checks below are not vacuous)', () => {
    expect(selectors.length).toBeGreaterThan(30);
    expect(selectors).toContain('.hm .kili-band canvas');
  });

  it('starts every selector with the .hm root, so it cannot touch another page', () => {
    expect(selectors.filter((s) => !/^\.hm(?![\w-])/.test(s))).toEqual([]);
  });

  it('keeps to the page tokens: no :root, no fonts, no keyframes', () => {
    expect(css).not.toMatch(/:root|@font-face|@import|@keyframes/);
  });

  it('reserves the band height from the first paint: 290, 330 and 360 px', () => {
    expect(declarationsOf('.hm .kili-band')).toMatch(/--band-h:\s*290px;[\s\S]*height:\s*var\(--band-h\)/);
    expect(css).toMatch(/min-width: 600px\)\s*\{\s*\.hm \.kili-band \{ --band-h: 330px; \}/);
    expect(css).toMatch(/min-width: 1000px\)\s*\{\s*\.hm \.kili-band \{ --band-h: 360px; \}/);
  });

  it('lets the labels stand above the band but not scroll the page sideways', () => {
    const band = declarationsOf('.hm .kili-band');
    expect(band).toContain('overflow-x: clip');
    expect(band).not.toMatch(/overflow:\s*hidden/);
  });

  it('keeps labels and the legend out of the way of the pointer', () => {
    for (const cls of ['.kili-peak', '.kili-key', '.kili-wp']) expect(declarationsOf(`.hm ${cls}`)).toContain('pointer-events: none');
  });

  it('fades the labels in only when motion is welcome', () => {
    const block = css.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*)\}\s*$/)[1];
    expect(block).toContain('.hm .kili-peak');
    expect(block).toContain('transition: opacity');
    expect(css.slice(0, css.indexOf('prefers-reduced-motion'))).not.toMatch(/transition:\s*opacity/);
  });

  it('gives the pause toggle a 44px target and a focus ring', () => {
    expect(declarationsOf('.hm .kili-toggle')).toContain('min-height: 44px');
    expect(declarationsOf('.hm .kili-toggle:focus-visible')).toMatch(/outline: 2px solid/);
  });

  it('keeps the toggle clear of the site-wide motion- class rule in index.css', () => {
    for (const file of files.filter((f) => f.endsWith('.jsx') || f.endsWith('.css'))) expect(read(file), file).not.toMatch(/motion-/);
  });
});

describe('the components use only classes kili.css or home.css defines', () => {
  const homeCss = readFileSync(`${HOME_DIR}home.css`, 'utf8');
  const SHARED = new Set(['head', 'line', 'lead', 'sr-only']); // the ledger's own classes, in home.css
  const sources = files.filter((f) => f.endsWith('.jsx'));
  const used = sources.flatMap((file) => [...read(file).matchAll(/className=(?:"([^"]+)"|\{`([^`$]+)`\})|'(kili-[\w-]+)'/g)]
    .flatMap((m) => (m[1] ?? m[2] ?? m[3]).split(/\s+/).filter(Boolean).map((cls) => ({ file, cls }))));

  it('finds the class names to check', () => {
    expect(used.length).toBeGreaterThan(15);
  });

  it('defines every one of them', () => {
    const missing = used.filter(({ cls }) => !new RegExp(`\\.${cls}(?![\\w-])`).test(SHARED.has(cls) ? homeCss : css));
    expect(missing).toEqual([]);
  });

  it('leaves no kili class in the stylesheet that nothing uses', () => {
    const all = sources.map(read).join('\n');
    const defined = new Set([...css.matchAll(/\.(kili-[\w-]+)/g)].map((m) => m[1]));
    const unused = [...defined].filter((cls) => !all.includes(cls));
    expect(unused).toEqual([]);
  });
});

describe('what stays out of the main bundle', () => {
  const app = ['KiliEnding.jsx', 'KiliFooter.jsx', 'NextClimb.jsx', 'useKiliBand.js'];

  it('loads the drawing code with a dynamic import, never a static one', () => {
    for (const file of app) expect(read(file), file).not.toMatch(/from\s+['"]\.\/(draw|paint|scene|watch|terrain|route|zones|timeline|labels|math)(\.js)?['"]/);
    expect(read('useKiliBand.js')).toContain("import('./draw.js')");
  });

  it('fetches the terrain and the route at run time from public/data, and never imports them', () => {
    const hook = read('useKiliBand.js');
    expect(hook).toContain('kilimanjaro.json');
    expect(hook).toContain('kili-route.json');
    expect(hook).toMatch(/BASE_URL\}data\//);
    for (const file of files.filter((f) => /\.(jsx?|css)$/.test(f) && !f.endsWith('.test.js') && f !== 'testData.js')) {
      expect(read(file), file).not.toMatch(/import[^;]*\.json['"]/);
    }
  });

  it('waits until the band is a screen away before fetching anything', () => {
    const hook = read('useKiliBand.js');
    expect(hook).toContain("rootMargin: LAZY_MARGIN");
    expect(hook).toContain("LAZY_MARGIN = '0px 0px 100% 0px'");
    expect(hook.indexOf('whenNear(band')).toBeLessThan(hook.indexOf('cancelNear()'));
  });

  it('has one effect that owns the lifecycle and a cleanup that disposes it (StrictMode safe)', () => {
    const hook = read('useKiliBand.js');
    expect(hook.match(/useEffect\(/g)).toHaveLength(1);
    expect(hook).toMatch(/return \(\) => \{[\s\S]*abort\.abort\(\);[\s\S]*cancelNear\(\);[\s\S]*controllerRef\.current\?\.dispose\(\);/);
  });
});

describe('the markup', () => {
  const ending = read('KiliEnding.jsx');

  it('collapses the band when the drawing cannot load, so no blank gap is left', () => {
    expect(ending).toContain('data-failed={failed || undefined}');
    expect(css).toMatch(/\.hm \.kili-band\[data-failed\] \{ display: none; \}/);
    expect(read('useKiliBand.js')).toContain('guarded(setFailed)(true);');
  });

  it('hides the whole band from assistive technology: canvas, labels and legend', () => {
    expect(ending).toMatch(/<div className="kili-band" ref=\{bandRef\} aria-hidden="true"/);
    expect(ending.indexOf('<canvas />')).toBeGreaterThan(ending.indexOf('aria-hidden="true"'));
    expect(ending).toContain('<Legend />');
  });

  it('takes every word from content.js', () => {
    expect(ending).toContain("from '../content'");
    expect(ending).not.toMatch(/>\s*(Uhuru|Mawenzi|Machame|Barafu|Planned)/);
  });

  it('shows the pause toggle only while there is motion, and flips its label', () => {
    const footer = read('KiliFooter.jsx');
    expect(footer).toMatch(/\{motion && \(\s*<button type="button" className="kili-toggle"/);
    expect(footer).toContain('paused ? FOOTER.motion.play : FOOTER.motion.pause');
    expect(footer).not.toContain('aria-pressed');
  });

  it('announces a press of the toggle in one quiet status region, silent on load (WCAG 4.1.3)', () => {
    const footer = read('KiliFooter.jsx');
    expect(footer).toMatch(/<p className="sr-only" role="status">\{said\}<\/p>/);
    expect(footer).toContain("useState('')");
    expect(footer).toContain('FOOTER.motion.playing : FOOTER.motion.stopped');
  });

  it('keeps the footer copy and links from the old DeepFooter: open line, contact links, last updated', () => {
    const footer = read('KiliFooter.jsx');
    expect(footer).toContain('CONTACT_LINKS');
    expect(footer).toContain('FOOTER');
    expect(footer).toContain('<time dateTime={updated.datetime}>');
    expect(footer).toContain('<footer className="kili-foot">');
  });

  it('puts "Next climb" in the ledger style: an h2.head and one .line with a .lead', () => {
    const next = read('NextClimb.jsx');
    expect(next).toMatch(/<h2 className="head" id=\{id\}>\{title\}<\/h2>/);
    expect(next).toMatch(/<p className="line"><span className="lead">\{lead\}<\/span>\{rest\}<\/p>/);
    expect(next).toContain('aria-labelledby={id}');
  });
});

describe('the homepage', () => {
  const page = readFileSync(`${HOME_DIR}HomePage.jsx`, 'utf8');

  it('ends on the Kilimanjaro ending, with the Next climb section in <main>', () => {
    expect(page).toContain("import KiliEnding from './kili/KiliEnding';");
    expect(page).toContain('<KiliEnding />');
    expect(page).toMatch(/<NextClimb \/>\s*<\/main>\s*<KiliEnding \/>/);
  });

  it('no longer has the water band', () => {
    expect(page).not.toMatch(/band\/|import Ending\b/);
    expect(existsSync(`${HOME_DIR}band`)).toBe(false);
  });
});

describe('house style', () => {
  it('has no em dashes in any file of the ending', () => {
    for (const file of files.filter((f) => /\.(jsx?|css)$/.test(f))) expect(read(file), file).not.toMatch(EM_DASH);
  });
});

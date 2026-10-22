import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isLightPath } from './lightRoutes';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(ROOT + rel, 'utf8');

const LIGHT = [
  '/', '/hiking', '/hiking/', '/HIKING', '/writing', '/blog/tat-tvam-asi',
  '/climate-search', '/privacy', '/terms', '/legal',
];
const NOT_LIGHT = ['/login', '/me', '/me/poker', '/blog', '/theses', '/blog/a/b', '/hikingx', '/x'];

const FONTS = ['/fonts/geist-latin.woff2', '/fonts/instrument-serif-italic-latin.woff2'];
const PLATE = '/mountain-plate.webp';

describe('isLightPath', () => {
  it.each(LIGHT)('treats %s as light', (path) => {
    expect(isLightPath(path)).toBe(true);
  });

  it.each(NOT_LIGHT)('treats %s as dark', (path) => {
    expect(isLightPath(path)).toBe(false);
  });
});

describe('the pre-paint script in index.html', () => {
  const body = read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1];

  /** Runs the real script against a stub document and reports what it did. */
  function run(pathname) {
    const classes = new Set();
    const theme = { content: '#0B0A0A', setAttribute(name, value) { if (name === 'content') this.content = value; } };
    const links = [];
    const doc = {
      documentElement: { classList: { add: (name) => classes.add(name) } },
      querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? theme : null),
      createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
      head: { appendChild: (el) => links.push(el) },
    };
    new Function('location', 'document', body)({ pathname }, doc);
    return { classes, theme: theme.content, preloads: links.map((el) => el.href) };
  }

  it('compares the path with "/" exactly once, which routes.test.js looks for', () => {
    expect(body.match(/location\.pathname\s*[!=]==\s*'\/'/g)).toHaveLength(1);
  });

  it.each(LIGHT)('styles %s white and preloads both fonts', (path) => {
    const result = run(path);
    expect(result.classes.has('hm-page')).toBe(true);
    expect(result.theme).toBe('#FFFFFF');
    expect(result.preloads).toEqual(expect.arrayContaining(FONTS));
  });

  it.each(NOT_LIGHT)('leaves %s alone', (path) => {
    const result = run(path);
    expect(result.classes.size).toBe(0);
    expect(result.theme).toBe('#0B0A0A');
    expect(result.preloads).toEqual([]);
  });

  it('preloads the mountain plate on "/" only', () => {
    for (const path of LIGHT) {
      expect(run(path).preloads.includes(PLATE), path).toBe(path === '/');
    }
  });

  it('agrees with isLightPath on every path it is tested with', () => {
    for (const path of [...LIGHT, ...NOT_LIGHT, '/blog/', '/terms/', '/climate-search/x']) {
      expect(run(path).classes.has('hm-page'), path).toBe(isLightPath(path));
    }
  });
});

describe('App.jsx routes', () => {
  const app = read('src/App.jsx');
  const paths = [...app.matchAll(/\bpath="([^"]+)"/g)].map((m) => m[1]);
  const isPrivate = (path) => path === '*' || /^\/(login|me)(\/|$)/.test(path);

  it('finds the public routes to check', () => {
    expect(paths.filter((path) => !isPrivate(path)).length).toBeGreaterThanOrEqual(8);
  });

  it('wears the light look on every public route and the dark one on every private route', () => {
    for (const path of paths.filter((p) => p !== '*')) {
      const sample = path.replace(/:[A-Za-z]+/g, 'sample');
      expect(isLightPath(sample), path).toBe(!isPrivate(path));
    }
  });
});

describe('no cookie notice', () => {
  it('mounts no consent banner: the public site sets no cookies and keeps no preferences', () => {
    expect(read('src/App.jsx')).not.toMatch(/CookieConsent/);
  });
});

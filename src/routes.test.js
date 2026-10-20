import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HIDDEN_POST_SLUGS } from './blog/hidden.js';

// Static checks on the site-v2 routing plumbing. Each file is read as text so
// the test runs in vitest's node environment without rendering React.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(ROOT + rel, 'utf8');

const SITE = 'https://www.harigridharan.com';
const REMOVED = ['/work', '/projects', '/thesis', '/trailsense', '/ascent', '/climbing', '/blog'];
const KEPT = ['/', '/hiking', '/theses', '/blog/:slug', '/climate-search', '/privacy', '/terms', '/legal', '/login', '/me'];
// Public pages a sitemap may list (/login and /me are disallowed in robots.txt).
const PUBLIC_STATIC = new Set(['/', '/hiking', '/theses', '/climate-search', '/privacy', '/terms', '/legal']);

const EXPECTED_REDIRECTS = {
  '/climbing': '/hiking',
  '/blog': '/theses',
  '/ascent/hiking': '/hiking',
  '/ascent/theses': '/theses',
  '/work': '/',
  '/projects': '/',
  '/thesis': '/',
  '/trailsense': '/',
  '/ascent': '/',
  '/ascent/:path*': '/',
  '/Gridharan_Hari_Resume.pdf': '/Hari_Gridharan_Resume.pdf',
  '/resume.pdf': '/Hari_Gridharan_Resume.pdf',
};

function postSlugs() {
  const dir = ROOT + 'src/blog/posts/';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const front = readFileSync(dir + f, 'utf8').split(/\r?\n---\r?\n/)[0];
      const m = front.match(/^slug:\s*"?([^"\r\n]+)"?\s*$/m);
      return m ? m[1] : null;
    })
    .filter(Boolean);
}

describe('App.jsx routes', () => {
  const app = read('src/App.jsx');
  const paths = [...app.matchAll(/\bpath="([^"]+)"/g)].map((m) => m[1]);

  it('has no route for a removed page', () => {
    for (const removed of REMOVED) {
      expect(paths, removed).not.toContain(removed);
    }
    expect(paths.filter((p) => p.startsWith('/ascent'))).toEqual([]);
  });

  it('keeps every live route', () => {
    for (const kept of KEPT) expect(paths, kept).toContain(kept);
  });

  it('serves the new HomePage at "/" and sends unknown paths home', () => {
    expect(app).toMatch(/import HomePage from '\.\/home\/HomePage'/);
    expect(app).toMatch(/<Route path="\/" element={<HomePage \/>} \/>/);
    expect(app).toMatch(/<Route path="\*" element={<Navigate to="\/" replace \/>} \/>/);
  });

  it('drops the old homepage chrome and the removed pages\' imports', () => {
    const gone = [
      'GlobalChrome', 'HikerHeroScene', 'AscentPage', 'AscentWork', 'AscentProjects', 'AscentThesis', 'AscentTrailSense',
      // the dark pages the homepage used to link to, replaced by src/site
      'AscentHiking', 'AscentTheses', 'AscentPost', 'ClimateSearchRoute', 'SubShell', 'PageShell',
    ];
    for (const name of gone) {
      expect(app, name).not.toContain(name);
    }
  });

  it('lazy-loads the restyled pages from src/site and keeps the legal page', () => {
    const pages = {
      HikingPage: './site/hiking/HikingPage',
      ThesesPage: './site/ThesesPage',
      PostPage: './site/PostPage',
      ClimateSearchPage: './site/climate/ClimateSearchPage',
      LegalPage: './pages/LegalPage',
    };
    for (const [name, file] of Object.entries(pages)) {
      expect(app, name).toContain(`const ${name} = lazy(() => import('${file}'));`);
      expect(existsSync(`${ROOT}src/${file.slice(2)}.jsx`), file).toBe(true);
    }
    for (const [path, name] of [['/hiking', 'HikingPage'], ['/theses', 'ThesesPage'], ['/blog/:slug', 'PostPage'], ['/climate-search', 'ClimateSearchPage']]) {
      expect(app, path).toContain(`<Route path="${path}" element={<${name} />} />`);
    }
  });
});

describe('vercel.json', () => {
  const raw = read('vercel.json');
  const config = JSON.parse(raw);

  it('301-redirects every removed path to its replacement', () => {
    const bySource = Object.fromEntries(config.redirects.map((r) => [r.source, r]));
    for (const [source, destination] of Object.entries(EXPECTED_REDIRECTS)) {
      expect(bySource[source], source).toBeDefined();
      expect(bySource[source].destination, source).toBe(destination);
      expect(bySource[source].statusCode, source).toBe(301);
    }
    for (const removed of REMOVED) expect(bySource[removed], removed).toBeDefined();
  });

  it('lists redirects before the SPA rewrite, which stays intact', () => {
    expect(raw.indexOf('"redirects"')).toBeGreaterThan(-1);
    expect(raw.indexOf('"redirects"')).toBeLessThan(raw.indexOf('"rewrites"'));
    expect(config.rewrites).toEqual([{ source: '/((?!api/).*)', destination: '/' }]);
  });
});

describe('sitemap.xml', () => {
  const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const slugs = new Set(postSlugs());

  it('lists only live routes and existing, visible posts', () => {
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc.startsWith(SITE + '/'), loc).toBe(true);
      const path = loc.slice(SITE.length);
      const post = path.match(/^\/blog\/([^/]+)$/);
      if (post) {
        expect(slugs.has(post[1]), loc).toBe(true);
        expect(HIDDEN_POST_SLUGS, loc).not.toContain(post[1]);
      } else {
        expect(PUBLIC_STATIC.has(path), loc).toBe(true);
      }
    }
  });

  it('drops /work, /projects and the hidden post', () => {
    const joined = locs.join('\n');
    expect(joined).not.toMatch(/\/work\b|\/projects\b|doing-it-all/);
  });
});

describe('ThesesPage.jsx', () => {
  const src = read('src/site/ThesesPage.jsx');

  it('no longer links to the removed /thesis page', () => {
    expect(src).not.toContain("'/thesis'");
    expect(src).not.toContain('"/thesis"');
  });

  it('lists the essays from the homepage content, not the remote feed', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bWRITING\b[^}]*\}\s*from\s*'\.\.\/home\/content'/);
    expect(src).not.toContain('useUnifiedFeed');
  });
});

describe('index.html head', () => {
  const html = read('index.html');

  it('has no canonical or og:url, since every route shares this file', () => {
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('og:url');
  });

  it('uses the new title without an em dash', () => {
    expect(html).toContain('<title>Hari Gridharan · Cornell Dyson ’29</title>');
    expect(html).not.toContain('—');
  });

  it('runs the pre-paint script on the light routes, starting the mountain on "/"', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(script).not.toBeNull();
    expect(script[1]).toMatch(/location\.pathname [!=]== '\/'/);
    expect(script[1]).toContain('hm-page');
    expect(script[1]).toContain('#FFFFFF');
    expect(script[1]).toContain('/mountain-plate.webp');
  });

  it('self-hosts Geist and Instrument Serif italic and preloads them on the light routes', () => {
    const fonts = read('src/fonts.css');
    for (const file of ['/fonts/geist-latin.woff2', '/fonts/instrument-serif-italic-latin.woff2']) {
      expect(fonts).toContain(`url('${file}')`);
      expect(html).toContain(`'${file}'`);
      expect(existsSync(ROOT + 'public' + file), file).toBe(true);
    }
    expect(html).not.toMatch(/family=Geist/);
  });

  it('points og:image and twitter:image at an absolute URL', () => {
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/www\.harigridharan\.com\/og-image\.png" ?\/?>/);
    expect(html).toMatch(/<meta name="twitter:image" content="https:\/\/www\.harigridharan\.com\/og-image\.png" ?\/?>/);
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta property="og:image:height" content="630"');
    expect(html).toContain('<meta property="og:image:alt"');
  });

  it('references only assets that exist in public/', () => {
    const refs = [
      ...[...html.matchAll(/(?:href|src)="(\/[^"/][^"]*)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/'(\/[^'/][^']*\.(?:webp|png|ico|svg|jpg))'/g)].map((m) => m[1]),
    ];
    const assets = refs.filter((r) => !r.startsWith('/src/'));
    expect(assets).toContain('/favicon.ico');
    for (const asset of assets) {
      expect(existsSync(ROOT + 'public' + asset), asset).toBe(true);
    }
  });
});

describe('solipsism post', () => {
  it('carries the homepage title', () => {
    expect(read('src/blog/posts/2026-03-15-solipsism.md')).toMatch(
      /^title: "Solipsism and the Case for Taking More Risks"$/m,
    );
  });
});

describe('resume', () => {
  // Every Resume link and both old-path redirects point at this file; if it went
  // missing, the SPA fallback would quietly bounce visitors to "/".
  it('public/Hari_Gridharan_Resume.pdf exists', () => {
    expect(existsSync(ROOT + 'public/Hari_Gridharan_Resume.pdf')).toBe(true);
  });
});

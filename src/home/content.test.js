import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HIDDEN_POST_SLUGS } from '../blog/hidden.js';
import * as content from './content.js';

const POSTS_DIR = fileURLToPath(new URL('../blog/posts/', import.meta.url));
const KEPT_ROUTES = new Set(['/', '/hiking', '/theses', '/climate-search']);
// Hidden from every listing on purpose; the URL still works for anyone who has it.
const HIDDEN_SLUGS = new Set(HIDDEN_POST_SLUGS);
const RESUME_PATH = '/Hari_Gridharan_Resume.pdf';
// Built from the code point so this file does not contain the character it bans.
const EM_DASH = new RegExp(String.fromCharCode(0x2014));

/** Every slug declared in a blog post's frontmatter. */
function postSlugs() {
  return readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const match = readFileSync(`${POSTS_DIR}${file}`, 'utf8').match(/^slug:\s*["']?([^"'\r\n]+)["']?\s*$/m);
      if (!match) throw new Error(`No slug: line found in ${file}`);
      return match[1];
    });
}

/** Yields { path, value } for every string reachable from `node`, so no copy can hide in a nested array. */
function* strings(node, path = []) {
  if (typeof node === 'string') {
    yield { path: path.join('.'), value: node };
  } else if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) yield* strings(child, [...path, index]);
  } else if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) yield* strings(child, [...path, key]);
  }
}

const allStrings = Object.entries(content).flatMap(([name, value]) => [...strings(value, [name])]);

/** Values under an `href` key, plus any string that is shaped like a link. */
const hrefs = allStrings.filter(
  ({ path, value }) => /href$/i.test(path.split('.').at(-1)) || /^(https?:|mailto:|\/)/.test(value),
);

const essaySlugs = content.WRITING.essays.map((essay) => essay.slug);
const essayHrefs = essaySlugs.map((slug) => ({ path: `WRITING.essays/${slug}`, value: `/blog/${slug}` }));

describe('homepage content: wording', () => {
  it('walks a realistic amount of copy (the checks below are not vacuous)', () => {
    expect(allStrings.length).toBeGreaterThan(150);
    expect(hrefs.length).toBeGreaterThan(20);
  });

  it('has no em dash, TK placeholder, review chip or leftover wording-toggle marker', () => {
    const banned = [EM_DASH, /\bTK\b/, /\[ask/i, /c-hari/, /c-panel/];
    const offenders = allStrings.filter(({ value }) => banned.some((pattern) => pattern.test(value)));
    expect(offenders).toEqual([]);
  });

  it('does not use Stealth Startup, the retired name for Midian Partners', () => {
    const offenders = allStrings.filter(({ value }) => /stealth/i.test(value));
    expect(offenders).toEqual([]);
  });
});

describe('homepage content: links', () => {
  const slugs = new Set(postSlugs());

  it('points every internal link at a kept route or a published blog post', () => {
    const internal = [...hrefs, ...essayHrefs].filter(({ value }) => value.startsWith('/'));
    const offenders = internal.filter(({ value }) => {
      if (KEPT_ROUTES.has(value) || value === RESUME_PATH) return false;
      const blog = value.match(/^\/blog\/([^/]+)$/);
      return !(blog && slugs.has(blog[1]) && !HIDDEN_SLUGS.has(blog[1]));
    });
    expect(offenders).toEqual([]);
  });

  it('uses only https: or mailto: for links that leave the site', () => {
    const external = hrefs.filter(({ value }) => !value.startsWith('/'));
    const offenders = external.filter(({ value }) => !/^(https:|mailto:)/.test(value));
    expect(offenders).toEqual([]);
  });

  it('serves the resume from the PDF in public/, as a plain file path', () => {
    expect(content.RESUME_HREF).toBe(RESUME_PATH);
    expect(content.HEADER.actions.resume.href).toBe(RESUME_PATH);
  });

  it('lists every published essay and never the hidden one', () => {
    const visible = [...slugs].filter((slug) => !HIDDEN_SLUGS.has(slug));
    expect([...essaySlugs].sort()).toEqual(visible.sort());
    expect(essaySlugs.some((slug) => HIDDEN_SLUGS.has(slug))).toBe(false);
  });

  it('keeps the essay titles unique and the newest first', () => {
    const { essays } = content.WRITING;
    expect(new Set(essays.map((essay) => essay.title)).size).toBe(essays.length);
    const dates = essays.map((essay) => essay.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('sends the theses link and the trail log to routes that still exist', () => {
    expect(content.WRITING.thesesLink.href).toBe('/theses');
    const mountaineering = content.OFF_CLOCK.rows.find((row) => row.co === 'Mountaineering');
    expect(mountaineering.meta.find((item) => item.href).href).toBe('/hiking');
    const climate = content.PROJECTS.rows.find((row) => row.co === 'Climate startup search');
    expect(climate.meta.some((item) => item.href === '/climate-search')).toBe(true);
  });
});

describe('homepage content: row shape', () => {
  const sections = [content.EXPERIENCE, content.ON_CAMPUS, content.PROJECTS, content.OFF_CLOCK];

  it('gives every section an id, a title and rows with a unique name', () => {
    for (const section of sections) {
      expect(section.id).toMatch(/^[a-z-]+$/);
      expect(section.title.length).toBeGreaterThan(0);
      const names = section.rows.map((row) => row.co);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('keeps the section ids unique across the page', () => {
    const ids = [...sections.map((section) => section.id), content.WRITING.id];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives expandable rows a body and a lead, and never an empty body', () => {
    for (const row of sections.flatMap((section) => section.rows)) {
      if (row.body === undefined) continue;
      expect(Array.isArray(row.body) && row.body.length > 0, row.co).toBe(true);
      expect(row.lead, row.co).toBeTruthy();
    }
  });

  const isSegment = (segment) =>
    typeof segment === 'string' || (typeof segment.text === 'string' && typeof segment.href === 'string');
  const asSegments = (text) => (Array.isArray(text) ? text : [text]);
  const allRows = sections.flatMap((section) => section.rows);

  it('writes one-liner continuations as strings or { text, href } segments', () => {
    for (const row of allRows.filter((candidate) => candidate.rest !== undefined)) {
      for (const segment of asSegments(row.rest)) expect(isSegment(segment), row.co).toBe(true);
    }
  });

  it('writes each body paragraph as a string or an array of such segments', () => {
    for (const row of allRows.filter((candidate) => candidate.body)) {
      for (const paragraph of row.body) {
        for (const segment of asSegments(paragraph)) expect(isSegment(segment), row.co).toBe(true);
      }
    }
  });

  it('keeps links out of the one-liner on rows that open (it is the summary button)', () => {
    // A link inside a <summary> is a control nested in a control (axe: nested-interactive).
    for (const row of allRows.filter((candidate) => candidate.body)) {
      const links = asSegments(row.rest ?? []).filter((segment) => typeof segment !== 'string');
      expect(links, row.co).toEqual([]);
    }
  });

  it('links the grant funders and DNHacks in the body instead of the one-liner', () => {
    const linked = (row) => row.body.flatMap(asSegments).filter((segment) => typeof segment !== 'string');
    const loadstone = content.EXPERIENCE.rows.find((row) => row.coHref === 'https://loadstonelabs.com/');
    expect(linked(loadstone).map((link) => link.href)).toEqual(['https://aws.amazon.com/', 'https://www.lvlup.vc/']);
    const vest = content.PROJECTS.rows.find((row) => row.co === 'Vest Practices');
    expect(linked(vest).map((link) => link.href)).toEqual(['https://dnhacks.org/']);
  });

  it('keeps company links in the title of every row that has one', () => {
    const linkedTitles = allRows.filter((row) => row.coHref);
    expect(linkedTitles.length).toBeGreaterThanOrEqual(7); // Loadstone, EXL, Adobe, CVC, CEC, Armada, OEIS
    for (const row of linkedTitles) expect(row.coHref, row.co).toMatch(/^https:/);
  });

  it('writes meta items as strings or { label, href } links', () => {
    const rows = sections.flatMap((section) => section.rows).filter((row) => row.meta !== undefined);
    for (const row of rows) {
      for (const item of row.meta) {
        const ok = typeof item === 'string' || (typeof item.label === 'string' && typeof item.href === 'string');
        expect(ok, row.co).toBe(true);
      }
    }
  });

  it('glues dates together so a range never breaks across lines', () => {
    const dates = sections.flatMap((section) => section.rows).map((row) => row.when).filter(Boolean);
    expect(dates.length).toBeGreaterThan(10);
    for (const date of dates) expect(date, date).not.toMatch(/ /);
  });
});

describe('homepage content: footer', () => {
  it('shares the header contact data: resume, email, LinkedIn, GitHub, in that order', () => {
    const { actions } = content.HEADER;
    expect(content.CONTACT_LINKS.map((link) => link.href)).toEqual([
      actions.resume.href,
      actions.email.href,
      ...actions.social.map((link) => link.href),
    ]);
  });

  it('labels the email link with the address itself', () => {
    const email = content.CONTACT_LINKS[1];
    expect(`mailto:${email.label}`).toBe(email.href);
  });

  it('marks the resume as a PDF download and the profile links with a default arrow', () => {
    const [resume, , ...profiles] = content.CONTACT_LINKS;
    expect(resume.arrow).toBe('\u2193');
    expect(resume.sr).toBe(content.A11Y.pdf);
    expect(profiles.every((link) => link.arrow === true)).toBe(true);
  });

  it('has the footer wording the ending renders', () => {
    const { open, updated, motion } = content.FOOTER;
    expect(open).toMatch(/Summer.2027 internship in New.York or San.Francisco/);
    expect(updated).toEqual({ label: 'Last updated', date: 'Oct 2026', datetime: '2026-10' });
    expect(motion).toEqual({ pause: 'Pause motion', play: 'Play motion' });
  });
});

describe('homepage content: resume match', () => {
  it('lists the fellowship after Dyson Scholar in the affiliation', () => {
    const { affiliation } = content.HEADER;
    expect(affiliation.school).toMatch(/Dyson.Scholar$/);
    expect(affiliation.fellowship).toBe('KKR Accelerator Scholar');
  });

  it('keeps the toolkit and coursework in one closed Skills row, not in the header', () => {
    expect(content.HEADER.lines).toBeUndefined();
    expect(content.SKILLS.rows).toHaveLength(1);
    expect(content.SKILLS.rows[0].body).toHaveLength(3); // tools, methods, coursework
  });

  it('has the new toolkit entries and the six courses', () => {
    const [tools, methods, coursework] = content.SKILLS.rows[0].body;
    expect(tools).toMatch(/Multi.Agent.Orchestration/); // U+2011: the hyphen never breaks the line
    expect(methods).toMatch(/competitive.analysis/);
    expect(coursework.replace(/^Coursework: /, '').split(/\s·\s/)).toHaveLength(6); // the dot is glued to the item before it
  });

  it('opens the Armada row, with the directory linked in its body', () => {
    const armada = content.ON_CAMPUS.rows.find((row) => row.co.startsWith('Cornell') && row.co.endsWith('Armada'));
    expect(armada.body).toHaveLength(3);
    const links = armada.body.flat().filter((segment) => typeof segment !== 'string');
    expect(links.map((link) => link.href)).toEqual(['https://www.bigred.network/']);
  });

  it('presents Loadstone as venture-backed, with the funders linked in the third paragraph', () => {
    const loadstone = content.EXPERIENCE.rows.find((row) => row.coHref === 'https://loadstonelabs.com/');
    expect(loadstone.lead).toMatch(/^Venture-backed/);
    expect(loadstone.body).toHaveLength(3);
    expect(loadstone.body[2].filter((segment) => typeof segment !== 'string').map((link) => link.text)).toEqual([
      'AWS',
      expect.stringMatching(/^LvlUp.Ventures$/),
    ]);
  });

  it('names the Adobe role as a contract and leaves the location as Remote', () => {
    const adobe = content.EXPERIENCE.rows.find((row) => row.co === 'Adobe');
    expect(adobe.role).toBe('AI Strategy Consultant (Contract)');
    expect(adobe.meta).toEqual(['Remote']);
  });
});

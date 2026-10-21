import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks on the hg mark and the tab icons made from it. Files are read as text (and the icon
// headers as bytes), so this runs in vitest's node environment without rendering React.
const SRC = fileURLToPath(new URL('../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(file, 'utf8');

const mark = read(join(SRC, 'home', 'Mark.jsx'));
const favicon = read(join(ROOT, 'public', 'favicon.svg'));
const html = read(join(ROOT, 'index.html'));

const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

/** The two path strings of the mark as Mark.jsx holds them. */
const markPaths = () => ({
  ink: mark.match(/const INK = '([^']+)';/)?.[1],
  hat: mark.match(/const HAT = '([^']+)';/)?.[1],
});

describe('Mark', () => {
  it('is an inline svg that screen readers and focus skip', () => {
    expect(mark).toContain('<svg');
    expect(mark).toContain('aria-hidden="true"');
    expect(mark).toContain('focusable="false"');
  });

  it('takes a className and always carries the mark class', () => {
    expect(mark).toMatch(/function Mark\(\{ className = '' \}\)/);
    expect(mark).toMatch(/className=\{`mark \$\{className\}`\.trim\(\)\}/);
  });

  it('draws the ink in currentColor and the circumflex in the brand blue', () => {
    const { ink, hat } = markPaths();
    expect(ink?.length).toBeGreaterThan(200);
    expect(hat?.length).toBeGreaterThan(50);
    expect(mark).toContain('<path fill="currentColor" d={INK} />');
    expect(mark).toContain('<path fill="#0F7DAA" d={HAT} />');
  });

  it('is made of paths alone: no image, font or text to load', () => {
    expect(mark).not.toMatch(/<image|<text|href=|\.webp/);
  });
});

describe('the lockups use Mark, not the hiker', () => {
  it.each([
    ['home/Header.jsx', "from './Mark'"],
    ['site/SiteShell.jsx', "from '../home/Mark'"],
  ])('%s imports and renders Mark', (file, specifier) => {
    const source = read(join(SRC, file));
    expect(source).toContain(`import Mark ${specifier}`);
    expect(source).toContain('<Mark />');
    expect(source).not.toMatch(/HikerMark/);
  });

  it('has deleted HikerMark, and nothing imports it', () => {
    expect(existsSync(join(SRC, 'home', 'HikerMark.jsx'))).toBe(false);
    const importers = walk(SRC)
      .filter((file) => /\.jsx?$/.test(file) && !file.endsWith('.test.js'))
      .filter((file) => /HikerMark/.test(read(file)));
    expect(importers).toEqual([]);
  });

  it('leaves no hiker rules in home.css or site.css', () => {
    for (const file of [join(SRC, 'home', 'home.css'), join(SRC, 'site', 'site.css')]) {
      expect(read(file).replace(/\/\*[\s\S]*?\*\//g, ''), file).not.toMatch(/hiker/i);
    }
  });
});

describe('the tab icons', () => {
  it('links the svg icon with the ico and apple-touch fallbacks, and no 32px png that could outrank the svg', () => {
    expect(html).toMatch(/<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml" ?\/?>/);
    expect(html).toMatch(/<link rel="icon" href="\/favicon\.ico" sizes="32x32" ?\/?>/);
    expect(html).not.toMatch(/favicon-32\.png/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" ?\/?>/);
  });

  it('no longer calls the icon the hiker on a dark tile', () => {
    expect(html).not.toMatch(/Site icon: the hiker/);
  });

  it('draws the same paths as Mark, in a square viewBox', () => {
    const { ink, hat } = markPaths();
    expect(favicon).toContain(`<path class="ink" d="${ink}"`);
    expect(favicon).toContain(`<path fill="#0F7DAA" d="${hat}"`);
    const [, , width, height] = favicon.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    expect(width).toBe(height);
  });

  it('turns its ink light when the browser is in dark mode, and leaves the circumflex blue', () => {
    expect(favicon).toMatch(/@media \(prefers-color-scheme: dark\) \{ \.ink \{[^}]*fill: #FFFFFF/);
    expect(favicon).not.toMatch(/\.ink[^}]*#0F7DAA/);
  });

  it('has fallback images at the sizes the links promise', () => {
    const png = (name) => readFileSync(join(ROOT, 'public', name));
    const sizeOf = (buffer) => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
    expect(sizeOf(png('apple-touch-icon.png'))).toEqual([180, 180]);
  });

  it('packs 16px and 32px images into favicon.ico', () => {
    const ico = readFileSync(join(ROOT, 'public', 'favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b);
    expect(sizes).toEqual([16, 32]);
  });
});

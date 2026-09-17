import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

// Vercel traces each function's static imports into its bundle and runs it in plain Node,
// not through Vite. Importing every poker function in a fresh Node process proves each
// import (including the ../../../src engine and bot modules) resolves without Vite.
const ROOT_URL = new URL('../../', import.meta.url);
const POKER_DIR_URL = new URL('../trainers/poker/', import.meta.url);
const POKER_FUNCTIONS = readdirSync(POKER_DIR_URL)
  .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'))
  .sort()
  .map((name) => `api/trainers/poker/${name}`);

describe('poker API functions load in plain Node', () => {
  it.each(POKER_FUNCTIONS)('%s', (file) => {
    const url = new URL(file, ROOT_URL).href;
    const script = `const m = await import(${JSON.stringify(url)}); console.log(typeof m.default);`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fileURLToPath(ROOT_URL),
      encoding: 'utf8',
    });
    expect(out.trim()).toBe('function');
  }, 20000);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// Vercel Hobby deploys at most 12 functions. Every .js file under api/ is one, except files or folders
// whose name starts with "_" and tests (.vercelignore drops **/*.test.js).
const API_DIR = fileURLToPath(new URL('../', import.meta.url));
const HOBBY_FUNCTION_LIMIT = 12;

function functionFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_')) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return functionFiles(full);
    const isFunction = entry.name.endsWith('.js') && !entry.name.endsWith('.test.js');
    return isFunction ? [path.relative(API_DIR, full).split(path.sep).join('/')] : [];
  });
}

describe('Vercel function count', () => {
  it(`stays within the Hobby limit of ${HOBBY_FUNCTION_LIMIT}`, () => {
    const files = functionFiles(API_DIR).sort();
    expect(files).toContain('trainers/poker/stats.js');
    expect(files.length, files.join(', ')).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });
});

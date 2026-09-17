import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Class names intentionally shared with the felt table (none yet): document any addition here
 * with a reason before adding to this allowlist. */
const SHARED_ALLOWLIST = new Set([]);

const TABLE_CSS = fileURLToPath(new URL('../table/table.css', import.meta.url));
const STATS_CSS = fileURLToPath(new URL('./stats.css', import.meta.url));
const REVIEW_CSS = fileURLToPath(new URL('../review/review.css', import.meta.url));

/** Pulls every `.pk-foo` class token referenced in a CSS file's selectors (dedup'd). */
function classNamesIn(cssPath) {
  const text = readFileSync(cssPath, 'utf8');
  const matches = text.matchAll(/\.pk-[a-z0-9_-]+/g);
  return new Set([...matches].map((m) => m[0].slice(1)));
}

describe('poker stats/review CSS does not clash with the felt table', () => {
  const tableClasses = classNamesIn(TABLE_CSS);

  it('stats.css defines no class name also defined in table.css (outside the allowlist)', () => {
    const statsClasses = classNamesIn(STATS_CSS);
    const collisions = [...statsClasses].filter((c) => tableClasses.has(c) && !SHARED_ALLOWLIST.has(c));
    expect(collisions).toEqual([]);
  });

  it('review.css defines no class name also defined in table.css (outside the allowlist)', () => {
    const reviewClasses = classNamesIn(REVIEW_CSS);
    const collisions = [...reviewClasses].filter((c) => tableClasses.has(c) && !SHARED_ALLOWLIST.has(c));
    expect(collisions).toEqual([]);
  });

  it('table.css still defines pk-table (the felt table), proving the check is not vacuous', () => {
    expect(tableClasses.has('pk-table')).toBe(true);
  });

  it('stats.css now uses pk-datatable, not pk-table, for its data tables', () => {
    const statsClasses = classNamesIn(STATS_CSS);
    expect(statsClasses.has('pk-datatable')).toBe(true);
    expect(statsClasses.has('pk-table')).toBe(false);
  });
});

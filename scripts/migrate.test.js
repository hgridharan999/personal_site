import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from './migrate.js';

describe('pendingMigrations', () => {
  it('sorts, filters invalid names, and skips applied', () => {
    const files = ['002_stats.sql', 'README.md', '001_trainers.sql', '1_bad.sql', '003_more.sql'];
    expect(pendingMigrations(files, ['001_trainers.sql'])).toEqual(['002_stats.sql', '003_more.sql']);
  });
  it('returns nothing when everything is applied', () => {
    expect(pendingMigrations(['001_trainers.sql'], ['001_trainers.sql'])).toEqual([]);
  });
  it('MIGRATION_NAME', () => {
    expect(MIGRATION_NAME.test('001_trainers.sql')).toBe(true);
    expect(MIGRATION_NAME.test('001-trainers.sql')).toBe(false);
  });
});

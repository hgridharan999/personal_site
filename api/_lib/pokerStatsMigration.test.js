import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from '../../scripts/migrate.js';

const sqlText = fs.readFileSync(new URL('../../db/migrations/003_poker_stats.sql', import.meta.url), 'utf8');

describe('db/migrations/003_poker_stats.sql', () => {
  it('runs after 002_poker', () => {
    expect(MIGRATION_NAME.test('003_poker_stats.sql')).toBe(true);
    expect(pendingMigrations(['003_poker_stats.sql', '001_trainers.sql', '002_poker.sql'], ['001_trainers.sql']))
      .toEqual(['002_poker.sql', '003_poker_stats.sql']);
  });

  it('adds covering indexes for per-hand and per-spot aggregates', () => {
    expect(sqlText).toContain('ON poker_decisions (hand_id) INCLUDE (spot, action, ev_loss, grade, confident)');
    expect(sqlText).toContain('ON poker_decisions (spot, hand_id) INCLUDE (ev_loss, grade, confident)');
    expect(sqlText).toContain('DROP INDEX IF EXISTS poker_decisions_spot;');
    expect(sqlText).not.toMatch(/CREATE TABLE/);
  });
});

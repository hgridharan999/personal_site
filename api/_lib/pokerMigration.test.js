import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from '../../scripts/migrate.js';

const sqlText = fs.readFileSync(new URL('../../db/migrations/002_poker.sql', import.meta.url), 'utf8');

describe('db/migrations/002_poker.sql', () => {
  it('is a valid migration name that runs after 001_trainers', () => {
    expect(MIGRATION_NAME.test('002_poker.sql')).toBe(true);
    expect(pendingMigrations(['002_poker.sql', '001_trainers.sql'], [])).toEqual(['001_trainers.sql', '002_poker.sql']);
  });

  it('creates the three poker tables with cascading children', () => {
    for (const table of ['poker_sessions', 'poker_hands', 'poker_decisions']) {
      expect(sqlText).toContain(`CREATE TABLE ${table} (`);
    }
    expect(sqlText.match(/ON DELETE CASCADE/g)).toHaveLength(2);
    expect(sqlText).toContain('UNIQUE (session_id, hand_no)');
    expect(sqlText).toContain('PRIMARY KEY (hand_id, idx)');
  });

  it('stores chip amounts as integer units, never numeric BB', () => {
    expect(sqlText).not.toMatch(/_bb\b/);
    expect(sqlText).not.toMatch(/numeric\(10,\s*1\)/);
    expect(sqlText).toMatch(/\bnet\s+int NOT NULL DEFAULT 0/);
    expect(sqlText).toMatch(/\bpot\s+int NOT NULL/);
    expect(sqlText).toMatch(/\bhero_net\s+int NOT NULL/);
    expect(sqlText).toMatch(/\bhero_start_stack\s+int NOT NULL/);
    expect(sqlText).toMatch(/\bsize\s+int,/);
    expect(sqlText).toMatch(/\bto_call\s+int NOT NULL/);
  });

  it('indexes open sessions, recent hands and decision spots', () => {
    expect(sqlText).toContain('WHERE ended_at IS NULL');
    expect(sqlText).toContain('ON poker_hands (played_at DESC, id DESC)');
    expect(sqlText).toContain('ON poker_decisions (spot)');
  });
});

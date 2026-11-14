import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from '../../scripts/migrate.js';

const sqlText = fs.readFileSync(new URL('../../db/migrations/009_nightly_games.sql', import.meta.url), 'utf8');
const flat = sqlText.replace(/\s+/g, ' ');

describe('db/migrations/009_nightly_games.sql', () => {
  it('is a valid migration name that runs after 004_nightly', () => {
    expect(MIGRATION_NAME.test('009_nightly_games.sql')).toBe(true);
    expect(pendingMigrations(['009_nightly_games.sql', '004_nightly.sql'], [])).toEqual([
      '004_nightly.sql',
      '009_nightly_games.sql',
    ]);
  });

  it('refuses to drop nightly_game_results unless it is empty', () => {
    const doStart = sqlText.indexOf('DO $$');
    const exists = sqlText.indexOf('EXISTS (SELECT 1 FROM nightly_game_results)');
    const raise = sqlText.indexOf('RAISE EXCEPTION');
    const drop = sqlText.indexOf('DROP TABLE nightly_game_results;');
    expect(doStart).toBeGreaterThanOrEqual(0);
    expect(exists).toBeGreaterThan(doStart);
    expect(raise).toBeGreaterThan(exists);
    expect(drop).toBeGreaterThan(raise);
  });

  it('recreates results keyed by night and creates nightly_puzzles', () => {
    expect(sqlText).toContain('CREATE TABLE nightly_game_results (');
    expect(sqlText).toContain('PRIMARY KEY (night, game)');
    expect(sqlText).toContain('CREATE TABLE nightly_puzzles (');
    expect(sqlText).toContain('night date PRIMARY KEY');
    expect(sqlText.indexOf('DROP TABLE nightly_game_results;')).toBeLessThan(
      sqlText.indexOf('CREATE TABLE nightly_game_results ('),
    );
  });

  it('defines the columns the spec names', () => {
    expect(flat).toContain('score numeric NOT NULL');
    expect(flat).toContain('detail jsonb');
    expect(flat).toContain('logged_at timestamptz NOT NULL DEFAULT now()');
    expect(flat).toContain('updated_at timestamptz NOT NULL DEFAULT now()');
    expect(flat).toContain('flaw jsonb NOT NULL');
    expect(flat).toContain('created_at timestamptz NOT NULL DEFAULT now()');
  });

  it('makes puzzle results final with a BEFORE UPDATE trigger', () => {
    expect(flat).toContain(
      'CREATE TRIGGER nightly_puzzle_results_final BEFORE UPDATE ON nightly_game_results',
    );
    const fn = sqlText.match(/CREATE FUNCTION nightly_puzzle_results_final\(\)[\s\S]*?\$\$ LANGUAGE/)[0];
    expect(fn).toContain("OLD.game LIKE 'puzzle\\_%'");
    expect(fn).toContain('RAISE EXCEPTION');
  });
});

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from '../../scripts/migrate.js';

const sqlText = fs.readFileSync(new URL('../../db/migrations/004_nightly.sql', import.meta.url), 'utf8');

describe('db/migrations/004_nightly.sql', () => {
  it('is a valid migration name that runs after 003_poker_stats', () => {
    expect(MIGRATION_NAME.test('004_nightly.sql')).toBe(true);
    expect(pendingMigrations(['004_nightly.sql', '003_poker_stats.sql'], [])).toEqual([
      '003_poker_stats.sql',
      '004_nightly.sql',
    ]);
  });

  it.each([
    'nightly_sessions',
    'nightly_answers',
    'nightly_takes',
    'nightly_forecasts',
    'nightly_game_results',
  ])('creates %s', (table) => {
    expect(sqlText).toContain(`CREATE TABLE ${table} (`);
  });

  it('keeps one session per night and guards the status lifecycle', () => {
    expect(sqlText).toContain('date date NOT NULL UNIQUE');
    expect(sqlText).toContain(
      "'generating','generated','submitted','grading','graded','complete','missed'",
    );
    expect(sqlText).toContain("status IN ('generating','missed') OR");
  });

  it('constrains answers, takes, forecasts and game results', () => {
    expect(sqlText).toContain('PRIMARY KEY (session_id, idx)');
    expect(sqlText).toContain('CHECK (score BETWEEN 1 AND 5)');
    expect(sqlText).toContain('UNIQUE (session_id, game)');
    expect(sqlText).toContain('story_index smallint');
    expect(sqlText).toContain('CHECK (idx >= 0)');
  });

  it('generates ids and cascades the four child tables', () => {
    expect(sqlText.match(/gen_random_uuid\(\)/g).length).toBeGreaterThanOrEqual(4);
    expect(sqlText.match(/ON DELETE CASCADE/g)).toHaveLength(4);
  });

  it('installs the update, delete and freeze triggers', () => {
    expect(sqlText.match(/CREATE TRIGGER/g)).toHaveLength(5);
    for (const name of [
      'nightly_answers_immutable BEFORE UPDATE ON nightly_answers',
      'nightly_takes_immutable BEFORE UPDATE ON nightly_takes',
      'nightly_answers_no_delete BEFORE DELETE ON nightly_answers',
      'nightly_takes_no_delete BEFORE DELETE ON nightly_takes',
      'nightly_sessions_brief_frozen BEFORE UPDATE ON nightly_sessions',
    ]) {
      expect(sqlText.replace(/\s+/g, ' ')).toContain(`CREATE TRIGGER ${name}`);
    }
  });

  const body = (fn) => sqlText.match(new RegExp(String.raw`CREATE FUNCTION ${fn}\(\)[\s\S]*?\$\$ LANGUAGE`))[0];

  it('answers and takes keep session_id immutable too', () => {
    expect(body('nightly_answers_immutable')).toContain('NEW.session_id IS DISTINCT FROM OLD.session_id');
    expect(body('nightly_takes_immutable')).toContain('NEW.session_id IS DISTINCT FROM OLD.session_id');
    expect(body('nightly_takes_immutable')).toContain('IF OLD.published THEN');
  });

  it('refuses deletes of answers and takes unconditionally', () => {
    const fn = body('nightly_no_delete');
    expect(fn).toContain('RAISE EXCEPTION');
    expect(fn).not.toContain('IF ');
  });

  it('freezes stories, niche and questions once the status leaves generating', () => {
    const fn = body('nightly_sessions_brief_frozen');
    expect(fn).toContain("OLD.status <> 'generating'");
    for (const col of ['stories', 'niche', 'questions']) {
      expect(fn).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
    expect(fn).toContain('RAISE EXCEPTION');
  });
});

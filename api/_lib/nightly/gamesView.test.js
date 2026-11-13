import { describe, it, expect } from 'vitest';
import { gamesPayload } from './gamesView.js';
import { sprintProblems } from './sprint.js';
import { GAMES } from './games.js';

const NIGHT = '2026-11-13';
const FLAW = {
  flaw_key: 'sunk_cost',
  setting: 'a bank',
  argument: 'We have spent a lot, so we must continue.',
  choices: ['Small sample', 'Sunk cost', 'Selection bias', "Goodhart's law"],
  answer_index: 1,
  explanation: 'It weighs past spend.',
};
const PUZZLES_ROW = { night: NIGHT, flaw: FLAW };

function deepKeys(value) {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...deepKeys(v)]);
  return [];
}

describe('gamesPayload', () => {
  it('gives a fresh night with no puzzle state', () => {
    const p = gamesPayload({ night: NIGHT, puzzlesRow: null, results: [], history: [] });
    expect(p.night).toBe(NIGHT);
    expect(p.puzzles.flaw).toBeNull();
    expect(p.puzzles.sprint.problems).toHaveLength(5);
    p.puzzles.sprint.problems.forEach((pr) => expect(Object.keys(pr)).toEqual(['prompt']));
    expect(p.puzzles.sprint.result).toBeNull();
    expect(p.logged).toEqual({});
    expect(p.history).toEqual([]);
    expect(p.catalog).toHaveLength(5);
    expect(p.catalog[0]).toEqual({ key: 'krillion', name: 'Krillion', unit: 'points', min: 0, max: 700, decimals: 0, lowerIsBetter: false, url: 'https://krillion.io' });
  });

  it('leaks nothing about unsolved puzzles', () => {
    const p = gamesPayload({ night: NIGHT, puzzlesRow: PUZZLES_ROW, results: [], history: [] });
    const keys = deepKeys(p);
    for (const k of ['answer_index', 'answerIndex', 'explanation', 'answers', 'flaw_key']) expect(keys).not.toContain(k);
    expect(p.puzzles.flaw).toEqual({ setting: 'a bank', argument: FLAW.argument, choices: FLAW.choices, result: null });
  });

  it('reveals solved puzzles', () => {
    const results = [
      { game: 'puzzle_sprint', score: '3', detail: { seconds: 90, correct: [true, true, true, false, false], answers: [9, 9, 9, 9, 9] } },
      { game: 'puzzle_flaw', score: '0', detail: { choice: 2 } },
    ];
    const p = gamesPayload({ night: NIGHT, puzzlesRow: PUZZLES_ROW, results, history: [] });
    expect(p.puzzles.sprint.result).toEqual({
      score: 3,
      seconds: 90,
      correct: [true, true, true, false, false],
      answers: sprintProblems(NIGHT).map((x) => x.answer),
    });
    expect(p.puzzles.flaw.result).toEqual({ score: 0, choice: 2, answerIndex: 1, flawName: 'Sunk cost', explanation: 'It weighs past spend.' });
  });

  it('converts numeric strings and keeps puzzle rows out of logged', () => {
    const results = [
      { game: 'fermi', score: '1.94', detail: null },
      { game: 'puzzle_flaw', score: '1', detail: { choice: 1 } },
      { game: 'unknown', score: '4', detail: null },
    ];
    const history = [{ night: NIGHT, game: 'fermi', score: '1.94' }];
    const p = gamesPayload({ night: NIGHT, puzzlesRow: PUZZLES_ROW, results, history });
    expect(p.logged).toEqual({ fermi: 1.94 });
    expect(p.history).toEqual([{ night: NIGHT, game: 'fermi', score: 1.94 }]);
    expect(GAMES.length).toBe(5);
  });
});

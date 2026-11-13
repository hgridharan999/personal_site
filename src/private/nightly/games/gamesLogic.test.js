import { describe, it, expect } from 'vitest';
import {
  parseAnswer, nightsBack, historyGrid, formatScore, formatSeconds, sprintSummary, logInputs, readLogInputs,
  unreadableCount, unreadableNotice, changedEntries,
} from './gamesLogic.js';

const CATALOG = [
  { key: 'krillion', name: 'Krillion', unit: 'of 700', min: 0, max: 700, decimals: 0, lowerIsBetter: false, url: 'x' },
  { key: 'fermi', name: 'Fermi', unit: 'ratio', min: 1, max: 100, decimals: 2, lowerIsBetter: true, url: 'y' },
  { key: 'farflung', name: 'Farflung', unit: 'pts', min: 0, max: 100000, decimals: 0, lowerIsBetter: false, url: 'z' },
];

describe('parseAnswer', () => {
  it.each([
    ['2,400', 2400], ['$45', 45], ['15%', 15], ['1.94×', 1.94], ['1.94x', 1.94], [' 3.5 ', 3.5],
    ['-30', -30], ['−30', -30], ['103.5M', 103.5], ['103.5m', 103.5], ['$12k', 12], ['40 K', 40],
  ])('reads %s', (text, want) => expect(parseAnswer(text)).toBe(want));

  it.each([[''], ['   '], ['abc'], [undefined], ['M'], ['5MM'], ['5km']])('returns null for %s', (text) => {
    expect(parseAnswer(text)).toBeNull();
  });
});

describe('unreadableCount', () => {
  it('counts blank and unparseable answers', () => {
    expect(unreadableCount(['1', '', '  ', 'abc', '2.5M'])).toBe(3);
    expect(unreadableCount(['1', '2', '3', '4', '5'])).toBe(0);
  });
});

describe('unreadableNotice', () => {
  it('says how many and asks for a second press', () => {
    expect(unreadableNotice(1)).toBe('1 answer is blank or unreadable. Press Submit again to finish anyway.');
    expect(unreadableNotice(2)).toBe('2 answers are blank or unreadable. Press Submit again to finish anyway.');
  });
});

describe('changedEntries', () => {
  it('drops entries equal to the logged score, comparing numerically', () => {
    const entries = [{ game: 'fermi', score: 1.9 }, { game: 'krillion', score: 540 }, { game: 'farflung', score: 10 }];
    expect(changedEntries(entries, { fermi: 1.90, krillion: 541 })).toEqual([
      { game: 'krillion', score: 540 }, { game: 'farflung', score: 10 },
    ]);
  });
  it('treats string and number forms of the same value as unchanged', () => {
    expect(changedEntries([{ game: 'fermi', score: 1.9 }], { fermi: '1.90' })).toEqual([]);
  });
  it('keeps everything when nothing is logged', () => {
    expect(changedEntries([{ game: 'fermi', score: 2 }], undefined)).toEqual([{ game: 'fermi', score: 2 }]);
    expect(changedEntries([{ game: 'fermi', score: 2 }], { fermi: null })).toEqual([{ game: 'fermi', score: 2 }]);
  });
});

describe('nightsBack', () => {
  it('ends with the night, oldest first, across the DST weekend', () => {
    expect(nightsBack('2026-03-09', 3)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });
  it('crosses month and year boundaries', () => {
    expect(nightsBack('2027-01-01', 2)).toEqual(['2026-12-31', '2027-01-01']);
  });
});

describe('historyGrid', () => {
  const payload = {
    night: '2026-11-13',
    catalog: CATALOG,
    history: [
      { night: '2026-11-13', game: 'puzzle_sprint', score: 4 },
      { night: '2026-11-12', game: 'krillion', score: 540 },
    ],
  };
  it('has 14 nights and puzzle rows before catalog rows', () => {
    const grid = historyGrid(payload);
    expect(grid.nights).toHaveLength(14);
    expect(grid.nights[13]).toBe('2026-11-13');
    expect(grid.rows.map((r) => r.key)).toEqual(['puzzle_sprint', 'puzzle_flaw', 'krillion', 'fermi', 'farflung']);
    expect(grid.rows[0].name).toBe('Sprint');
    expect(grid.rows[1].name).toBe('Spot the flaw');
  });
  it('puts a score in its cell and null elsewhere', () => {
    const { rows } = historyGrid(payload);
    expect(rows[0].cells[13]).toBe(4);
    expect(rows[0].cells[12]).toBeNull();
    expect(rows[2].cells[12]).toBe(540);
    expect(rows[2].cells[13]).toBeNull();
  });
});

describe('formatting', () => {
  it('formats scores with exactly the given decimals', () => {
    expect(formatScore(2400, 0)).toBe('2,400');
    expect(formatScore(1.9, 2)).toBe('1.90');
  });
  it('formats seconds', () => {
    expect(formatSeconds(52)).toBe('52s');
    expect(formatSeconds(125)).toBe('2:05');
    expect(formatSeconds(60)).toBe('1:00');
  });
  it('summarises a sprint', () => {
    expect(sprintSummary({ score: 4, seconds: 52 })).toBe('4/5 in 52s');
    expect(sprintSummary({ score: 4, seconds: 125 })).toBe('4/5 in 2:05');
  });
});

describe('logInputs', () => {
  it('turns the logged scores into input strings', () => {
    expect(logInputs(CATALOG, { krillion: 540, fermi: 1.9 })).toEqual({ krillion: '540', fermi: '1.90', farflung: '' });
  });
  it('tolerates no logged object', () => {
    expect(logInputs(CATALOG, undefined).krillion).toBe('');
  });
});

describe('readLogInputs', () => {
  it('skips blanks', () => {
    expect(readLogInputs(CATALOG, { krillion: '  ' })).toEqual({ entries: [], errors: {} });
  });
  it('accepts in-range values', () => {
    expect(readLogInputs(CATALOG, { krillion: '540' }).entries).toEqual([{ game: 'krillion', score: 540 }]);
    expect(readLogInputs(CATALOG, { fermi: '1.94×' }).entries).toEqual([{ game: 'fermi', score: 1.94 }]);
  });
  it('rejects out-of-range values', () => {
    expect(readLogInputs(CATALOG, { krillion: '701' }).errors.krillion).toBe('Krillion: enter 0 to 700');
    expect(readLogInputs(CATALOG, { fermi: '0.5' }).errors.fermi).toBe('Fermi: enter 1 to 100');
    expect(readLogInputs(CATALOG, { farflung: '100001' }).errors.farflung).toBe('Farflung: enter 0 to 100,000');
  });
  it('rejects too many decimals', () => {
    expect(readLogInputs(CATALOG, { krillion: '540.5' }).errors.krillion).toBe('Krillion: whole numbers only');
    expect(readLogInputs(CATALOG, { fermi: '1.945' }).errors.fermi).toBe('Fermi: up to 2 decimals');
  });
  it('rejects text', () => {
    expect(readLogInputs(CATALOG, { krillion: 'abc' }).errors.krillion).toBe('Krillion: enter a number');
  });
});
